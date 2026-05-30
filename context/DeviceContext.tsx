import React, {
  createContext, useContext, useState, useRef,
  useCallback, useEffect,
} from 'react';
import { Platform } from 'react-native';
import { PIN_MAP, type ChipVariant, type PinDef, type PinMode } from '@/constants/gpio';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface BoardInfo {
  chip:           ChipVariant;
  revision:       string;
  mac:            string;
  flash_mb:       number;
  psram_mb:       number;
  fw_version:     string;
  app_partition:  'os' | 'app';
  app_version?:   string;
  pins:           PinDef[];
}

export interface SerialLine {
  id:   string;
  text: string;
  dir:  'rx' | 'tx';
  ts:   number;
}

export interface DiscoveredDevice {
  id:         string;
  name:       string;
  rssi:       number;
  isSim?:     boolean;
}

export interface FlashRecord {
  name:       string;
  sizeKb:     number;
  date:       number;
}

interface DeviceContextValue {
  // State
  connected:      boolean;
  connecting:     boolean;
  simMode:        boolean;
  boardInfo:      BoardInfo | null;
  uptime:         number;
  appPartition:   'os' | 'app';
  // GPIO
  pinStates:      Record<number, number>;
  pinModes:       Record<number, PinMode>;
  adcValues:      Record<number, number>;
  setPinMode:     (pin: number, mode: PinMode) => void;
  writePin:       (pin: number, value: number) => void;
  // Serial
  serialLines:    SerialLine[];
  sendSerial:     (text: string) => void;
  clearSerial:    () => void;
  // OTA
  otaProgress:    number | null;
  flashFirmware:  (uri: string, name: string, sizeKb: number) => Promise<void>;
  flashHistory:   FlashRecord[];
  // Partition
  bootPartition:  (target: 'os' | 'app') => void;
  // BLE
  scanForDevices: () => Promise<DiscoveredDevice[]>;
  connectToDevice:(device: DiscoveredDevice) => Promise<void>;
  disconnect:     () => void;
}

const SIM_BOARD: BoardInfo = {
  chip:          'ESP32-C3',
  revision:      'v0.3',
  mac:           'AA:BB:CC:DD:EE:FF',
  flash_mb:      4,
  psram_mb:      0,
  fw_version:    '1.2.0',
  app_partition: 'os',
  pins:          PIN_MAP['ESP32-C3'],
};

const SIM_DEVICE: DiscoveredDevice = {
  id:    'SIM:AA:BB:CC:DD:EE:FF',
  name:  'ESP32-OS-SIM',
  rssi:  -48,
  isSim: true,
};

const SIM_LOG_LINES = [
  'Boot complete',
  'NimBLE Stack initialized',
  'Sensor read: temp=24.7°C hum=61%',
  'ADC1: 2847',
  'GPIO5 → HIGH',
  'GPIO6 → LOW',
  'heap_free=189432',
  'uptime tick',
  'BLE connected, MTU=512',
  'CHAR_BOARD_INFO read OK',
  'Task hwm: ble_task=2048',
  'ADC2: 1394',
  'Sensor read: temp=25.1°C hum=59%',
];

const DeviceContext = createContext<DeviceContextValue | null>(null);

export function useDevice() {
  const ctx = useContext(DeviceContext);
  if (!ctx) throw new Error('useDevice must be inside DeviceProvider');
  return ctx;
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function buildInitialPinModes(pins: PinDef[]): Record<number, PinMode> {
  const m: Record<number, PinMode> = {};
  pins.forEach((p) => { m[p.gpio] = p.defaultMode; });
  // Give some pins OUTPUT mode for demo
  [5, 6, 7, 8, 10].forEach((g) => { if (m[g] !== undefined) m[g] = 'OUTPUT'; });
  return m;
}

function buildInitialAdcValues(pins: PinDef[]): Record<number, number> {
  const v: Record<number, number> = {};
  pins.filter((p) => p.adcChannel !== undefined).forEach((p) => {
    v[p.gpio] = Math.floor(Math.random() * 3000) + 500;
  });
  return v;
}

function buildInitialPinStates(pins: PinDef[], modes: Record<number, PinMode>): Record<number, number> {
  const s: Record<number, number> = {};
  pins.forEach((p) => { s[p.gpio] = modes[p.gpio] === 'OUTPUT' ? (Math.random() > 0.5 ? 1 : 0) : 0; });
  return s;
}

function fmtTs(ts: number): string {
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `[${hh}:${mm}:${ss}]`;
}

// ── Provider ──────────────────────────────────────────────────────────────────

export function DeviceProvider({ children }: { children: React.ReactNode }) {
  const [connected, setConnected]       = useState(false);
  const [connecting, setConnecting]     = useState(false);
  const [simMode, setSimMode]           = useState(true);
  const [boardInfo, setBoardInfo]       = useState<BoardInfo | null>(null);
  const [uptime, setUptime]             = useState(0);
  const [appPartition, setAppPartition] = useState<'os' | 'app'>('os');

  const [pinStates, setPinStates]   = useState<Record<number, number>>({});
  const [pinModes, setPinModes]     = useState<Record<number, PinMode>>({});
  const [adcValues, setAdcValues]   = useState<Record<number, number>>({});
  const [serialLines, setSerialLines] = useState<SerialLine[]>([]);
  const [otaProgress, setOtaProgress] = useState<number | null>(null);
  const [flashHistory, setFlashHistory] = useState<FlashRecord[]>([]);

  const simIntervals = useRef<ReturnType<typeof setInterval>[]>([]);
  const uptimeInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const isSimConnected = useRef(false);

  // ── Simulation helpers ───────────────────────────────────────────────────

  const addRxLine = useCallback((text: string) => {
    setSerialLines((prev) => [
      ...prev.slice(-300),
      { id: uid(), text: `${fmtTs(Date.now())} ${text}`, dir: 'rx', ts: Date.now() },
    ]);
  }, []);

  const startSimulation = useCallback((board: BoardInfo) => {
    const modes  = buildInitialPinModes(board.pins);
    const adc    = buildInitialAdcValues(board.pins);
    const states = buildInitialPinStates(board.pins, modes);

    setPinModes(modes);
    setAdcValues(adc);
    setPinStates(states);
    setUptime(0);

    // Uptime tick
    uptimeInterval.current = setInterval(() => setUptime((u) => u + 1), 1000);

    // GPIO state changes every 2s
    const gpioInterval = setInterval(() => {
      setPinStates((prev) => {
        const next = { ...prev };
        board.pins.forEach((p) => {
          if (modes[p.gpio] === 'OUTPUT' && Math.random() < 0.3) {
            next[p.gpio] = next[p.gpio] === 1 ? 0 : 1;
          }
        });
        return next;
      });
    }, 2000);

    // ADC drift every 800ms
    const adcInterval = setInterval(() => {
      setAdcValues((prev) => {
        const next = { ...prev };
        Object.keys(next).forEach((k) => {
          const g = Number(k);
          const delta = Math.floor((Math.random() - 0.5) * 200);
          next[g] = Math.max(0, Math.min(4095, (next[g] ?? 2000) + delta));
        });
        return next;
      });
    }, 800);

    // Fake serial output every 2–5s
    let logIdx = 0;
    const serialInterval = setInterval(() => {
      if (!isSimConnected.current) return;
      addRxLine(SIM_LOG_LINES[logIdx % SIM_LOG_LINES.length]);
      logIdx++;
    }, 2000 + Math.random() * 3000);

    simIntervals.current = [gpioInterval, adcInterval, serialInterval];
  }, [addRxLine]);

  const stopSimulation = useCallback(() => {
    simIntervals.current.forEach(clearInterval);
    simIntervals.current = [];
    if (uptimeInterval.current) clearInterval(uptimeInterval.current);
    uptimeInterval.current = null;
  }, []);

  // ── Scan / Connect / Disconnect ──────────────────────────────────────────

  const scanForDevices = useCallback(async (): Promise<DiscoveredDevice[]> => {
    if (Platform.OS === 'web' || simMode) {
      await new Promise<void>((r) => setTimeout(r, 1500));
      return [SIM_DEVICE];
    }
    return [SIM_DEVICE]; // BLE TODO
  }, [simMode]);

  const connectToDevice = useCallback(async (device: DiscoveredDevice) => {
    setConnecting(true);
    try {
      await new Promise<void>((r) => setTimeout(r, 800));
      const board = device.isSim ? { ...SIM_BOARD } : { ...SIM_BOARD, mac: device.id };
      setBoardInfo(board);
      setAppPartition(board.app_partition);
      setConnected(true);
      isSimConnected.current = true;
      setSimMode(device.isSim ?? true);
      addRxLine('--- Connection established ---');
      addRxLine(`Board: ${board.chip} rev ${board.revision}`);
      startSimulation(board);
    } finally {
      setConnecting(false);
    }
  }, [addRxLine, startSimulation]);

  const disconnect = useCallback(() => {
    stopSimulation();
    isSimConnected.current = false;
    setConnected(false);
    setBoardInfo(null);
    setPinStates({});
    setPinModes({});
    setAdcValues({});
    setUptime(0);
    setOtaProgress(null);
    setSimMode(true);
  }, [stopSimulation]);

  // ── GPIO ─────────────────────────────────────────────────────────────────

  const setPinMode = useCallback((pin: number, mode: PinMode) => {
    setPinModes((prev) => ({ ...prev, [pin]: mode }));
    if (mode === 'ADC') {
      setAdcValues((prev) => ({ ...prev, [pin]: Math.floor(Math.random() * 3000) + 500 }));
    }
    addRxLine(`GPIO${pin} mode → ${mode}`);
  }, [addRxLine]);

  const writePin = useCallback((pin: number, value: number) => {
    setPinStates((prev) => ({ ...prev, [pin]: value }));
    addRxLine(`GPIO${pin} → ${value === 1 ? 'HIGH' : 'LOW'}`);
  }, [addRxLine]);

  // ── Serial ───────────────────────────────────────────────────────────────

  const sendSerial = useCallback((text: string) => {
    setSerialLines((prev) => [
      ...prev.slice(-300),
      { id: uid(), text: text.trimEnd(), dir: 'tx', ts: Date.now() },
    ]);
    // Sim echo
    if (simMode) {
      setTimeout(() => {
        addRxLine(`OK: ${text.trim()}`);
      }, 120 + Math.random() * 200);
    }
  }, [simMode, addRxLine]);

  const clearSerial = useCallback(() => setSerialLines([]), []);

  // ── OTA ──────────────────────────────────────────────────────────────────

  const flashFirmware = useCallback(async (uri: string, name: string, sizeKb: number) => {
    setOtaProgress(0);
    addRxLine(`OTA START: ${name} (${sizeKb} KB)`);
    const steps = 40;
    for (let i = 1; i <= steps; i++) {
      await new Promise<void>((r) => setTimeout(r, 80 + Math.random() * 60));
      setOtaProgress(Math.round((i / steps) * 100));
    }
    addRxLine('OTA DONE — reboot pending');
    setFlashHistory((h) => [{ name, sizeKb, date: Date.now() }, ...h].slice(0, 5));
    setOtaProgress(null);
  }, [addRxLine]);

  // ── Partition ────────────────────────────────────────────────────────────

  const bootPartition = useCallback((target: 'os' | 'app') => {
    setAppPartition(target);
    setBoardInfo((b) => b ? { ...b, app_partition: target } : b);
    addRxLine(`Rebooting to ${target.toUpperCase()} partition…`);
  }, [addRxLine]);

  const value: DeviceContextValue = {
    connected, connecting, simMode, boardInfo, uptime, appPartition,
    pinStates, pinModes, adcValues, setPinMode, writePin,
    serialLines, sendSerial, clearSerial,
    otaProgress, flashFirmware, flashHistory,
    bootPartition,
    scanForDevices, connectToDevice, disconnect,
  };

  return <DeviceContext.Provider value={value}>{children}</DeviceContext.Provider>;
}
