/**
 * CrashReportService — structured diagnostic log for WaterTank app.
 *
 * Phone-side only. Ring buffer (500 entries ≈ 175KB max) in AsyncStorage.
 * No BLE transfer needed — phone storage is negligible, board stores nothing.
 * Board crash context comes via the C_RESET_REASON characteristic (1 byte, read on connect).
 *
 * Captures:
 *  - BLE connect/disconnect/scan events and errors
 *  - OTA transfer progress and failures (with sector context)
 *  - Board reset reason (power-on, sw reset, watchdog, panic, brownout)
 *  - Unhandled JS exceptions via ErrorUtils global handler
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { Share } from "react-native";

const STORAGE_KEY = "@flashlink_diag";
const MAX_ENTRIES = 500;

export type LogLevel = "info" | "warn" | "error" | "fatal";
export type LogTag = "ble" | "ota" | "app" | "board";

interface LogEntry {
  ts: number;
  level: LogLevel;
  tag: LogTag;
  msg: string;
  ctx?: Record<string, unknown>;
}

let _buffer: LogEntry[] = [];
let _loaded = false;
let _flushTimer: ReturnType<typeof setTimeout> | null = null;

async function load(): Promise<void> {
  if (_loaded) return;
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (raw) _buffer = JSON.parse(raw) as LogEntry[];
  } catch {}
  _loaded = true;
}

function scheduleFlush(): void {
  if (_flushTimer) return;
  _flushTimer = setTimeout(async () => {
    _flushTimer = null;
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(_buffer));
    } catch {}
  }, 1000);
}

function append(level: LogLevel, tag: LogTag, msg: string, ctx?: Record<string, unknown>): void {
  const entry: LogEntry = { ts: Date.now(), level, tag, msg };
  if (ctx && Object.keys(ctx).length > 0) entry.ctx = ctx;
  _buffer.push(entry);
  if (_buffer.length > MAX_ENTRIES) {
    _buffer = _buffer.slice(_buffer.length - MAX_ENTRIES);
  }
  scheduleFlush();
}

// ── BLE logging ───────────────────────────────────────────────────────────────

export function logBleInfo(msg: string, ctx?: Record<string, unknown>): void {
  append("info", "ble", msg, ctx);
}

export function logBleError(msg: string, ctx?: Record<string, unknown>): void {
  append("error", "ble", msg, ctx);
}

// ── OTA logging ───────────────────────────────────────────────────────────────

export function logOtaEvent(msg: string, ctx?: Record<string, unknown>): void {
  append("info", "ota", msg, ctx);
}

export function logOtaError(msg: string, ctx?: Record<string, unknown>): void {
  append("error", "ota", msg, ctx);
}

// ── App / render errors ───────────────────────────────────────────────────────

/** Call from ErrorBoundary.onError to log React render crashes. */
export function logAppError(error: Error, componentStack: string): void {
  append("error", "app", error?.message ?? "render error", {
    stack: error?.stack?.slice(0, 600),
    componentStack: componentStack?.slice(0, 400),
  });
}

// ── Board reset reason ────────────────────────────────────────────────────────

const RESET_NAMES: Record<number, string> = {
  0: "unknown", 1: "power_on", 2: "ext_pin", 3: "sw_reset",
  4: "panic",   5: "int_watchdog", 6: "task_watchdog", 7: "watchdog",
  8: "deep_sleep", 9: "brownout", 10: "sdio",
};

/** Call when C_RESET_REASON characteristic is read on connect. */
export function logBoardReset(reasonCode: number): void {
  const reasonName = RESET_NAMES[reasonCode] ?? `unknown_${reasonCode}`;
  // Panic, watchdog, and brownout are abnormal — flag as warn
  const level: LogLevel = [4, 5, 6, 7, 9].includes(reasonCode) ? "warn" : "info";
  append(level, "board", `reset: ${reasonName}`, { reasonCode });
}

// ── Stats & export ────────────────────────────────────────────────────────────

/** Returns the last N log entries as plain-text lines for inclusion in reports. */
export function getRecentLogs(n = 30): string {
  const recent = _buffer.slice(-n);
  return recent.map((e) => {
    const d = new Date(e.ts).toISOString();
    const ctx = e.ctx ? " " + JSON.stringify(e.ctx) : "";
    return `${d} [${e.level.toUpperCase()}][${e.tag}] ${e.msg}${ctx}`;
  }).join("\n");
}

export function getLogStats(): { count: number; sizeKb: number } {
  const approxBytes = _buffer.reduce((sum, e) => sum + JSON.stringify(e).length, 0);
  return { count: _buffer.length, sizeKb: Math.round(approxBytes / 1024) };
}

export async function exportLogs(fwVersion?: string | null): Promise<void> {
  const header = [
    "=== FlashLink Diagnostics ===",
    `Exported: ${new Date().toISOString()}`,
    `Firmware: ${fwVersion ? "v" + fwVersion : "unknown"}`,
    `Log entries: ${_buffer.length}`,
    "",
    "--- Logs ---",
  ].join("\n");

  const lines = _buffer.map((e) => {
    const d = new Date(e.ts).toISOString();
    const ctx = e.ctx ? " " + JSON.stringify(e.ctx) : "";
    return `${d} [${e.level.toUpperCase()}][${e.tag}] ${e.msg}${ctx}`;
  });
  await Share.share({
    message: header + "\n" + (lines.join("\n") || "(no diagnostic logs recorded)"),
    title: "FlashLink Diagnostics",
  });
}

export async function clearLogs(): Promise<void> {
  _buffer = [];
  try { await AsyncStorage.removeItem(STORAGE_KEY); } catch {}
}

// ── Init ──────────────────────────────────────────────────────────────────────

export async function init(): Promise<void> {
  await load();

  // Wrap the existing global JS error handler — preserve any prior handler
  // (e.g. from ErrorBoundary or third-party SDKs).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const EU = (globalThis as any).ErrorUtils;
  if (EU?.setGlobalHandler) {
    const prev = EU.getGlobalHandler?.();
    EU.setGlobalHandler((error: Error, isFatal?: boolean) => {
      append("fatal", "app", error?.message ?? "uncaught exception", {
        stack: error?.stack?.slice(0, 600),
        isFatal: isFatal ?? false,
      });
      // Best-effort synchronous flush before the process may terminate
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(_buffer)).catch(() => {});
      prev?.(error, isFatal);
    });
  }
}
