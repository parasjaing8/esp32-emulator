/**
 * BLEService — full BLE implementation for WaterTank ESP32.
 *
 * Auth flow (firmware v1.3.0+):
 *   1. Connect → discover → read C_CLAIMED
 *   2. If stored token → write to C_AUTH → read response
 *   3. If 'ok' → runConnectionSetup (monitors, time sync, log stream)
 *   4. If 'fail'/'setup_required' → emit authState, await submitPassword()
 */

import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Buffer } from "buffer";

import {
  BLE_CHAR_AUTH,
  BLE_CHAR_CLAIMED,
  BLE_CHAR_FILL_TARGET,
  BLE_CHAR_FW_VERSION,
  BLE_CHAR_LOG_CTRL,
  BLE_CHAR_LOG_DATA,
  BLE_CHAR_RESET_REASON,
  BLE_CHAR_SESSION,
  BLE_CHAR_SETUP,
  BLE_CHAR_STATE,
  BLE_CHAR_TANK,
  BLE_CHAR_TIME_SYNC,
  BLE_CHAR_VISIBILITY,
  BLE_LOG_ACK,
  BLE_LOG_START,
  BLE_LOG_STREAM_TIMEOUT,
  BLE_MTU_SIZE,
  BLE_RECONNECT_DELAYS,
  BLE_SCAN_TIMEOUT,
  BLE_SERVICE_UUID,
} from "@/constants/ble";
import { logBleInfo, logBleError, logBoardReset } from "@/services/CrashReportService";
import { AuthState, DEFAULT_DEVICE_STATE, DeviceState, EventType, StopReason, WaterEvent } from "@/models/Event";
import { insertEvent, insertSyncLog } from "@/storage/database";
import * as AuthService from "@/services/AuthService";

import { IDeviceService } from "./IDeviceService";

type Listener = (state: DeviceState) => void;
type EventListener = (event: WaterEvent) => void;
type LogListener = (msg: string) => void;

// Shape of a fully connected BLE device (post-connect())
type ConnectedDevice = {
  id: string;
  discoverAllServicesAndCharacteristics(): Promise<unknown>;
  requestMTU(size: number): Promise<unknown>;
  onDisconnected(cb: (err: unknown, d: unknown) => void): { remove(): void };
  readCharacteristicForService(svc: string, char: string): Promise<{ value?: string } | null>;
  writeCharacteristicWithResponseForService(svc: string, char: string, b64: string): Promise<unknown>;
  writeCharacteristicWithoutResponseForService(svc: string, char: string, b64: string): Promise<unknown>;
  monitorCharacteristicForService(svc: string, char: string, cb: (err: unknown, char: unknown) => void): { remove(): void };
};

export type DiscoveredDevice = {
  id: string;
  name?: string;
  localName?: string;
  rssi?: number;
};

let BleManagerClass: unknown = null;
let bleModuleAvailable = false;

if (Platform.OS === "android" || Platform.OS === "ios") {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require("react-native-ble-plx");
    BleManagerClass = mod.BleManager;
    bleModuleAvailable = true;
  } catch {
    bleModuleAvailable = false;
  }
}

export { bleModuleAvailable };

let _managerInstance: unknown = null;
let _bleServiceInstance: BLEService | null = null;

export function getBleManager(): unknown {
  if (!bleModuleAvailable || !BleManagerClass) return null;
  if (!_managerInstance) {
    try {
      _managerInstance = new (BleManagerClass as new () => unknown)();
    } catch {
      return null;
    }
  }
  return _managerInstance;
}

export function resetBleManager(): void { _managerInstance = null; }

export function getBleService(): BLEService | null { return _bleServiceInstance; }
export function registerBleService(svc: BLEService): void { _bleServiceInstance = svc; }

export class BLEService implements IDeviceService {
  private state: DeviceState = { ...DEFAULT_DEVICE_STATE };
  private listeners: Listener[] = [];
  private eventListeners: EventListener[] = [];
  private logListeners: LogListener[] = [];
  private logMessages: string[] = [];
  private running = false;
  private device: ConnectedDevice | null = null;
  private reconnectAttempt = 0;
  private scanTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private logStreamTimer: ReturnType<typeof setTimeout> | null = null;
  private logStreamInProgress = false;
  private subscriptions: Array<{ remove(): void }> = [];
  private discoveryTimer: ReturnType<typeof setTimeout> | null = null;
  private discoveryResolver: ((devices: DiscoveredDevice[]) => void) | null = null;

  // ── Lifecycle ────────────────────────────────────────────────────────────

  start(): void {
    if (!bleModuleAvailable) {
      this.log("BLE not available — use Simulation Mode");
      return;
    }
    this.running = true;
    this.reconnectAttempt = 0;
    // Try direct connect to a previously paired device first (works even when
    // advertising is off after claiming). Falls back to scan if none known.
    this.tryDirectConnect().then((ok) => {
      if (!ok && this.running) this.startScan();
    }).catch(() => {
      if (this.running) this.startScan();
    });
  }

  stop(): void {
    this.running = false;
    this.cleanup();
    this.emit({ ...this.state, connected: false, pumpState: 0, motorOn: false, authState: 'pending' });
  }

  subscribe(fn: Listener): () => void {
    this.listeners.push(fn);
    fn({ ...this.state });
    return () => { this.listeners = this.listeners.filter((l) => l !== fn); };
  }

  subscribeEvents(fn: EventListener): () => void {
    this.eventListeners.push(fn);
    return () => { this.eventListeners = this.eventListeners.filter((l) => l !== fn); };
  }

  addBleLogListener(fn: LogListener): () => void {
    this.logListeners.push(fn);
    return () => { this.logListeners = this.logListeners.filter((l) => l !== fn); };
  }

  getConnectedDeviceId(): string | null { return this.device?.id ?? null; }
  getBleLog(): string[] { return [...this.logMessages]; }

  triggerSync(): void {
    if (this.device && this.running && !this.logStreamInProgress) this.requestLogStream().catch(() => {});
  }

  // ── Manual device discovery (user-initiated scan) ──────────────────────────

  // Scan for nearby WaterTank devices without auto-connecting.
  // Returns the list when the timeout expires or stopDiscovery() is called.
  async discoverDevices(timeoutMs: number = 10000): Promise<DiscoveredDevice[]> {
    this.stopDiscovery();
    const mgr = getBleManager() as {
      startDeviceScan(uuids: string[] | null, opts: null, cb: (err: unknown, device: unknown) => void): void;
      stopDeviceScan(): void;
      state(): Promise<string>;
    } | null;
    if (!mgr) return [];

    // Cancel any auto-connect scan in progress
    if (this.scanTimer) { clearTimeout(this.scanTimer); this.scanTimer = null; }
    try { mgr.stopDeviceScan(); } catch {}

    const seen = new Set<string>();
    const devices: DiscoveredDevice[] = [];

    return new Promise((resolve) => {
      this.discoveryResolver = resolve;

      const doDiscovery = () => {
        this.discoveryTimer = setTimeout(() => {
          try { mgr.stopDeviceScan(); } catch {}
          this.discoveryTimer = null;
          if (this.discoveryResolver) {
            this.discoveryResolver(devices);
            this.discoveryResolver = null;
          }
        }, timeoutMs);

        try {
          mgr.startDeviceScan(null, null, (err, device) => {
            if (err) {
              this.log(`Discovery scan error: ${String(err)}`);
              return;
            }
            const dev = device as {
              name?: string; localName?: string; id: string; rssi?: number;
              serviceUUIDs?: string[];
            } | null;
            if (!dev?.id || seen.has(dev.id)) return;
            const hasServiceUUID = dev.serviceUUIDs?.some(
              (u) => u.toLowerCase() === BLE_SERVICE_UUID.toLowerCase(),
            );
            const hasName = (dev.name ?? dev.localName ?? "").toLowerCase().includes("watertank");
            if (!hasServiceUUID && !hasName) return;
            seen.add(dev.id);
            devices.push({
              id: dev.id,
              name: dev.name,
              localName: dev.localName,
              rssi: dev.rssi,
            });
            this.log(`Discovered: ${dev.name ?? dev.localName ?? "WaterTank"} (${dev.id}) RSSI=${dev.rssi ?? "?"}`);
          });
        } catch (e) {
          this.log(`startDeviceScan threw: ${String(e)}`);
          if (this.discoveryResolver) {
            this.discoveryResolver(devices);
            this.discoveryResolver = null;
          }
        }
      };

      mgr.state().then((s) => {
        if (s !== "PoweredOn") {
          this.log(`BLE not ready (${s})`);
          resolve([]);
          return;
        }
        doDiscovery();
      }).catch(() => doDiscovery());
    });
  }

  stopDiscovery(): void {
    if (this.discoveryTimer) { clearTimeout(this.discoveryTimer); this.discoveryTimer = null; }
    if (this.discoveryResolver) {
      this.discoveryResolver([]);
      this.discoveryResolver = null;
    }
    const mgr = getBleManager() as { stopDeviceScan(): void } | null;
    try { mgr?.stopDeviceScan(); } catch {}
  }

  // Connect to a specific device chosen by the user (from discoverDevices results).
  async connectToDevice(deviceId: string): Promise<void> {
    const mgr = getBleManager() as {
      connectToDevice(id: string, opts: { timeout: number }): Promise<ConnectedDevice>;
      cancelDeviceConnection(id: string): Promise<void>;
    } | null;
    if (!mgr) throw new Error("BLE not available");
    // Cancel any pending reconnect/scan
    if (this.scanTimer) { clearTimeout(this.scanTimer); this.scanTimer = null; }
    if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }
    // Disconnect existing connection before connecting to a different device
    if (this.device) {
      this.subscriptions.forEach((s) => { try { s.remove(); } catch {} });
      this.subscriptions = [];
      try { await mgr.cancelDeviceConnection(this.device.id); } catch {}
      this.device = null;
    }
    try {
      const connected = await mgr.connectToDevice(deviceId, { timeout: 10000 });
      await this.setupConnectedDevice(connected);
    } catch (e) {
      this.log(`Manual connect failed (${deviceId}): ${String(e)}`);
      logBleError("manual connect failed", { deviceId, error: String(e) });
      this.scheduleReconnect();
      throw e;
    }
  }

  // ── Auth public API ───────────────────────────────────────────────────────

  // Write password string to C_AUTH; returns the board's response.
  // On 'ok'/'setup_required': reads and stores the new session token.
  // On 'ok': immediately runs full connection setup (monitors, time sync, log stream).
  async submitPassword(password: string): Promise<'ok' | 'fail' | 'setup_required'> {
    const connected = this.device;
    if (!connected) throw new Error("Not connected");
    const pwB64 = Buffer.from(password, "utf8").toString("base64");
    await connected.writeCharacteristicWithResponseForService(BLE_SERVICE_UUID, BLE_CHAR_AUTH, pwB64);
    const resp = await this.readAuthResponse(connected);
    if (resp === "OK" || resp === "SETUP_REQUIRED") {
      await this.readAndStoreToken(connected);
      if (resp === "OK") {
        await this.runConnectionSetup(connected);
        return "ok";
      }
      this.emit({ ...this.state, authState: "setup_required" });
      return "setup_required";
    }
    this.emit({ ...this.state, authState: "fail" });
    return "fail";
  }

  // Write "name|password" to C_SETUP; board clears old sessions, issues new token.
  // Automatically reads and stores the new token, then runs full connection setup.
  async submitSetup(name: string, password: string): Promise<void> {
    const connected = this.device;
    if (!connected) throw new Error("Not connected");
    const payload = Buffer.from(`${name}|${password}`, "utf8").toString("base64");
    await connected.writeCharacteristicWithResponseForService(BLE_SERVICE_UUID, BLE_CHAR_SETUP, payload);
    const result = await connected.readCharacteristicForService(BLE_SERVICE_UUID, BLE_CHAR_SETUP);
    const resp = result?.value ? Buffer.from(result.value, "base64").toString("utf8").trim() : "FAIL";
    if (resp !== "OK") throw new Error(`Setup failed: ${resp}`);
    // Board issued a fresh token — read it and store under the new device name
    const sessChar = await connected.readCharacteristicForService(BLE_SERVICE_UUID, BLE_CHAR_SESSION);
    if (sessChar?.value) {
      const token = Buffer.from(sessChar.value, "base64");
      await AuthService.storeSession(connected.id, token, name);
    }
    await this.runConnectionSetup(connected);
  }

  // Write 0x01 to open a 5-min advertising window; 0x00 to close immediately.
  async setVisibility(on: boolean): Promise<void> {
    const connected = this.device;
    if (!connected) throw new Error("Not connected");
    const buf = Buffer.from([on ? 0x01 : 0x00]).toString("base64");
    await connected.writeCharacteristicWithResponseForService(BLE_SERVICE_UUID, BLE_CHAR_VISIBILITY, buf);
  }

  async writeFillTarget(pct: number): Promise<void> {
    if (!this.device) throw new Error("Not connected");
    const clamped = Math.max(1, Math.min(98, Math.round(pct)));
    await this.device.writeCharacteristicWithResponseForService(
      BLE_SERVICE_UUID, BLE_CHAR_FILL_TARGET,
      Buffer.from(String(clamped)).toString("base64"),
    );
    this.state = { ...this.state, fillTarget: clamped };
    this.emit({ ...this.state });
  }

  // ── Private internals ─────────────────────────────────────────────────────

  private log(msg: string): void {
    const ts = new Date().toLocaleTimeString();
    const line = `[${ts}] ${msg}`;
    this.logMessages = [line, ...this.logMessages].slice(0, 200);
    this.logListeners.forEach((l) => l(line));
  }

  private emit(state: DeviceState): void {
    this.state = state;
    this.listeners.forEach((l) => l({ ...state }));
  }

  private cleanup(): void {
    if (this.scanTimer) { clearTimeout(this.scanTimer); this.scanTimer = null; }
    if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }
    if (this.logStreamTimer) { clearTimeout(this.logStreamTimer); this.logStreamTimer = null; }
    if (this.discoveryTimer) { clearTimeout(this.discoveryTimer); this.discoveryTimer = null; }
    if (this.discoveryResolver) { this.discoveryResolver([]); this.discoveryResolver = null; }
    this.subscriptions.forEach((s) => { try { s.remove(); } catch {} });
    this.subscriptions = [];
    const mgr = getBleManager() as {
      stopDeviceScan(): void;
      cancelDeviceConnection(id: string): Promise<void>;
      destroy(): void;
    } | null;
    if (mgr) {
      try { mgr.stopDeviceScan(); } catch {}
      if (this.device?.id) mgr.cancelDeviceConnection(this.device.id).catch(() => {});
      // destroy() unregisters the GATT client from Android's BT stack immediately,
      // preventing stale scanner registrations from saturating Android's 5-per-app limit.
      try { mgr.destroy(); } catch {}
    }
    // Reset singleton so next start() creates a fresh BleManager
    resetBleManager();
    this.device = null;
  }

  private scheduleReconnect(): void {
    if (!this.running) return;
    if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }
    const delay = BLE_RECONNECT_DELAYS[Math.min(this.reconnectAttempt, BLE_RECONNECT_DELAYS.length - 1)];
    this.reconnectAttempt++;
    this.log(`Reconnecting in ${delay / 1000}s (attempt ${this.reconnectAttempt})...`);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (!this.running) return;
      this.tryDirectConnect().then((ok) => {
        if (!ok && this.running) this.startScan();
      }).catch(() => {
        if (this.running) this.startScan();
      });
    }, delay);
  }

  // A2.8 — Direct connect by stored MAC (works even when board is not advertising).
  private async tryDirectConnect(): Promise<boolean> {
    const sessions = await AuthService.listSessions();
    if (sessions.length === 0) return false;

    // If user has selected a preferred device, try it first.
    const preferred = await AuthService.getPreferredDevice();
    const ordered = preferred
      ? sessions.filter(s => s.deviceMac === preferred).concat(sessions.filter(s => s.deviceMac !== preferred))
      : sessions;

    const mgr = getBleManager() as {
      connectToDevice(id: string, opts: { timeout: number }): Promise<ConnectedDevice>;
    } | null;
    if (!mgr) return false;

    for (const session of ordered) {
      if (!this.running) return false;
      this.log(`Direct connect: ${session.deviceName} (${session.deviceMac})...`);
      this.emit({ ...this.state, connected: false });
      try {
        const connected = await mgr.connectToDevice(session.deviceMac, { timeout: 8000 });
        await this.setupConnectedDevice(connected);
        return true;
      } catch (e) {
        this.log(`Direct connect failed (${session.deviceMac}): ${String(e)}`);
        logBleError("direct connect failed", { deviceId: session.deviceMac, error: String(e) });
      }
    }
    return false;
  }

  private startScan(): void {
    logBleInfo("scan start", { attempt: this.reconnectAttempt });
    if (!this.running) return;
    const mgr = getBleManager() as {
      startDeviceScan(uuids: string[] | null, opts: null, cb: (err: unknown, device: unknown) => void): void;
      stopDeviceScan(): void;
      state(): Promise<string>;
    } | null;
    if (!mgr) return;

    this.log("Scanning for WaterTank...");
    this.emit({ ...this.state, connected: false });

    const doScan = () => {
      this.scanTimer = setTimeout(() => {
        if (!this.running) return;
        this.log("Scan timeout — retrying...");
        try { mgr.stopDeviceScan(); } catch {}
        this.scheduleReconnect();
      }, BLE_SCAN_TIMEOUT);

      let connecting = false;
      try {
        // Scan with null filter (no hardware UUID filter) — more compatible across Android
        // versions and OEM BT stacks. Identify our board by serviceUUIDs or name in callback.
        mgr.startDeviceScan(null, null, (err, device) => {
          if (err) {
            this.log(`Scan error: ${String(err)}`);
            logBleError("scan error", { error: String(err) });
            if (this.scanTimer) { clearTimeout(this.scanTimer); this.scanTimer = null; }
            try { mgr.stopDeviceScan(); } catch {}
            this.scheduleReconnect();
            return;
          }
          if (connecting) return;
          const dev = device as {
            name?: string; localName?: string; id: string;
            serviceUUIDs?: string[];
            connect(opts?: unknown): Promise<ConnectedDevice>;
          } | null;
          if (!dev?.id) return;
          // Identify WaterTank board by service UUID or name
          const hasServiceUUID = dev.serviceUUIDs?.some(
            (u) => u.toLowerCase() === BLE_SERVICE_UUID.toLowerCase(),
          );
          const hasName = (dev.name ?? dev.localName ?? "").toLowerCase().includes("watertank");
          if (!hasServiceUUID && !hasName) return;
          connecting = true;
          if (this.scanTimer) { clearTimeout(this.scanTimer); this.scanTimer = null; }
          try { mgr.stopDeviceScan(); } catch {}
          this.log(`Found ${dev.name ?? dev.localName ?? "WaterTank"} (${dev.id}) — connecting...`);
          const devId = dev.id;
          dev.connect().then((connected) => this.setupConnectedDevice(connected)).catch((e) => {
            this.log(`Connect failed: ${String(e)}`);
            logBleError("connect failed", { deviceId: devId, error: String(e) });
            this.scheduleReconnect();
          });
        });
      } catch (e) {
        this.log(`startDeviceScan threw: ${String(e)}`);
        this.scheduleReconnect();
      }
    };

    mgr.state().then((s) => {
      if (!this.running) return;
      if (s !== "PoweredOn") {
        this.log(`BLE adapter not ready (${s}) — retry in 1s`);
        setTimeout(() => { if (this.running) this.startScan(); }, 1000);
        return;
      }
      doScan();
    }).catch(() => doScan());
  }

  // A2.3 — Core post-connect flow: discover → register disconnect → auth → setup or pending.
  private async setupConnectedDevice(connected: ConnectedDevice): Promise<void> {
    try {
      this.device = connected;
      this.reconnectAttempt = 0;

      await connected.discoverAllServicesAndCharacteristics();
      this.log("Services discovered");
      try { await connected.requestMTU(BLE_MTU_SIZE); } catch {}

      // Register disconnect handler immediately — needed even during auth phase
      const disconnectSub = connected.onDisconnected((err) => {
        this.log(`Disconnected: ${err ? String(err) : "clean"}`);
        logBleInfo("disconnected", { reason: err ? String(err) : "clean" });
        this.device = null;
        this.subscriptions.forEach((s) => { try { s.remove(); } catch {} });
        this.subscriptions = [];
        this.emit({ ...this.state, connected: false, firmwareVersion: null, authState: "pending" });
        if (this.running) this.scheduleReconnect();
      });
      this.subscriptions.push(disconnectSub);

      // Auth handshake
      const authResult = await this.runAuthHandshake(connected);
      if (authResult === "ok") {
        await this.runConnectionSetup(connected);
      } else {
        // Stay connected, await user password input via submitPassword()
        this.emit({ ...this.state, connected: true, authState: authResult });
        this.log(`Auth required — state: ${authResult}`);
      }
    } catch (e) {
      this.log(`Connection sequence failed: ${String(e)}`);
      this.device = null;
      this.scheduleReconnect();
    }
  }

  private async runAuthHandshake(connected: ConnectedDevice): Promise<AuthState> {
    // Read C_CLAIMED (0 = factory/unclaimed, 1 = claimed)
    let isClaimed = true;
    try {
      const c = await connected.readCharacteristicForService(BLE_SERVICE_UUID, BLE_CHAR_CLAIMED);
      isClaimed = c?.value ? Buffer.from(c.value, "base64")[0] === 1 : true;
    } catch {}

    // Try stored session token for this device MAC
    const session = await AuthService.getSession(connected.id).catch(() => null);
    if (session) {
      const tokenBuf = Buffer.from(session.token, "hex");
      const tokenB64 = tokenBuf.toString("base64");
      try {
        await connected.writeCharacteristicWithResponseForService(BLE_SERVICE_UUID, BLE_CHAR_AUTH, tokenB64);
        const resp = await this.readAuthResponse(connected);
        if (resp === "OK") {
          // Refresh token — board issues a new one on every successful auth
          await this.readAndStoreToken(connected, session.deviceName);
          this.log(`Token auth OK — ${session.deviceName}`);
          return "ok";
        }
        // Token rejected (factory reset?) — clear stored session
        this.log("Stored token rejected — clearing session");
        await AuthService.clearSession(connected.id);
      } catch (e) {
        this.log(`Token auth error: ${String(e)}`);
        await AuthService.clearSession(connected.id);
      }
    }

    return isClaimed ? "fail" : "setup_required";
  }

  // Runs after auth is confirmed OK: reads FW info, sets up monitors, syncs time, streams log.
  private async runConnectionSetup(connected: ConnectedDevice): Promise<void> {
    let connectedFwVersion: string | undefined;
    try {
      const fwChar = await connected.readCharacteristicForService(BLE_SERVICE_UUID, BLE_CHAR_FW_VERSION);
      if (fwChar?.value) {
        const version = Buffer.from(fwChar.value, "base64").toString("utf8").trim();
        this.state = { ...this.state, firmwareVersion: version };
        connectedFwVersion = version;
        this.log(`Firmware: ${version}`);
        AsyncStorage.setItem(`@watertank_fw_version_${connected.id}`, version).catch((e) => {
          logBleError("fw version persist failed", { error: String(e) });
        });
      }
    } catch {}

    try {
      const rstChar = await connected.readCharacteristicForService(BLE_SERVICE_UUID, BLE_CHAR_RESET_REASON);
      if (rstChar?.value) logBoardReset(Buffer.from(rstChar.value, "base64")[0]);
    } catch {}

    try {
      const ftChar = await connected.readCharacteristicForService(BLE_SERVICE_UUID, BLE_CHAR_FILL_TARGET);
      if (ftChar?.value) {
        const pct = parseInt(Buffer.from(ftChar.value, "base64").toString("utf8").trim(), 10);
        if (!isNaN(pct)) this.state = { ...this.state, fillTarget: pct };
      }
    } catch {}

    logBleInfo("connected", { deviceId: connected.id, firmwareVersion: connectedFwVersion });

    const ts = Math.floor(Date.now() / 1000);
    const buf = Buffer.alloc(4);
    buf.writeUInt32LE(ts, 0);
    await connected.writeCharacteristicWithResponseForService(BLE_SERVICE_UUID, BLE_CHAR_TIME_SYNC, buf.toString("base64"));
    this.log(`Time sync: ${ts}`);

    // STATE notify — full pump/motor/inlet/tank status
    const stateSub = connected.monitorCharacteristicForService(BLE_SERVICE_UUID, BLE_CHAR_STATE, (err, char) => {
      if (err) return;
      try {
        const c = char as { value?: string };
        if (!c?.value) return;
        const parsed = JSON.parse(Buffer.from(c.value, "base64").toString("utf8")) as {
          state: number; motor: boolean; manual: boolean; tank: number; inlet?: boolean;
        };
        const manual = !!parsed.manual;
        this.emit({
          ...this.state,
          connected: true,
          authState: "ok",
          pumpState: parsed.state,
          motorOn: parsed.state === 3 || manual,
          manual,
          tank: Math.max(0, Math.min(100, parsed.tank)),
          inletActive: !!parsed.inlet,
        });
      } catch {}
    });
    this.subscriptions.push(stateSub);

    // TANK notify — separate high-frequency level updates
    const tankSub = connected.monitorCharacteristicForService(BLE_SERVICE_UUID, BLE_CHAR_TANK, (err, char) => {
      if (err) return;
      try {
        const c = char as { value?: string };
        if (!c?.value) return;
        const pct = parseFloat(Buffer.from(c.value, "base64").toString("utf8"));
        if (!isNaN(pct)) this.emit({ ...this.state, tank: Math.max(0, Math.min(100, pct)), connected: true, authState: "ok" });
      } catch {}
    });
    this.subscriptions.push(tankSub);

    this.emit({ ...this.state, connected: true, authState: "ok", lastSyncAt: Math.floor(Date.now() / 1000) });
    await this.requestLogStream();
  }

  // Read C_AUTH characteristic response ("OK", "SETUP_REQUIRED", or "FAIL")
  private async readAuthResponse(connected: ConnectedDevice): Promise<string> {
    try {
      const c = await connected.readCharacteristicForService(BLE_SERVICE_UUID, BLE_CHAR_AUTH);
      return c?.value ? Buffer.from(c.value, "base64").toString("utf8").trim() : "FAIL";
    } catch {
      return "FAIL";
    }
  }

  // Read C_SESSION and persist the token for this device.
  private async readAndStoreToken(connected: ConnectedDevice, deviceName?: string): Promise<void> {
    try {
      const sessChar = await connected.readCharacteristicForService(BLE_SERVICE_UUID, BLE_CHAR_SESSION);
      if (sessChar?.value) {
        const token = Buffer.from(sessChar.value, "base64");
        const name = deviceName ?? (await AuthService.getSession(connected.id))?.deviceName ?? "WaterTank";
        await AuthService.storeSession(connected.id, token, name);
      }
    } catch {}
  }

  private async requestLogStream(): Promise<void> {
    const connected = this.device;
    if (!connected || this.logStreamInProgress) return;

    this.logStreamInProgress = true;
    this.log("Starting log stream...");
    const pendingEvents: WaterEvent[] = [];

    const done = (acked: boolean) => {
      this.logStreamInProgress = false;
      if (!acked) {
        this.log(`Log stream incomplete — ${pendingEvents.length} partial events saved`);
        pendingEvents.forEach((e) => { try { insertEvent(e); } catch {} });
      }
      this.emit({ ...this.state, lastSyncAt: Math.floor(Date.now() / 1000) });
      insertSyncLog(Math.floor(Date.now() / 1000));
    };

    return new Promise<void>((resolve) => {
      let sub: { remove(): void };

      const timeoutHandle = setTimeout(() => {
        this.log("Log stream timeout — partial sync, no ACK sent");
        sub.remove();
        this.subscriptions = this.subscriptions.filter((s) => s !== sub);
        done(false);
        resolve();
      }, BLE_LOG_STREAM_TIMEOUT);

      sub = connected.monitorCharacteristicForService(BLE_SERVICE_UUID, BLE_CHAR_LOG_DATA, (err, char) => {
        if (err) {
          clearTimeout(timeoutHandle);
          sub.remove();
          this.subscriptions = this.subscriptions.filter((s) => s !== sub);
          done(false);
          resolve();
          return;
        }
        try {
          const c = char as { value?: string };
          if (!c?.value) return;
          const str = Buffer.from(c.value, "base64").toString("utf8");
          if (str === "DONE") {
            clearTimeout(timeoutHandle);
            sub.remove();
            this.subscriptions = this.subscriptions.filter((s) => s !== sub);
            this.log(`Log stream done — ${pendingEvents.length} events`);
            pendingEvents.forEach((e) => { try { insertEvent(e); } catch {} });
            connected.writeCharacteristicWithResponseForService(
              BLE_SERVICE_UUID, BLE_CHAR_LOG_CTRL, Buffer.from([BLE_LOG_ACK]).toString("base64"),
            ).then(() => {
              done(true);
              resolve();
            }).catch(() => {
              done(false);
              resolve();
            });
            return;
          }
          const ev = JSON.parse(str) as { id: number; t: number; type: number; tank: number; dur: number; stop: number };
          pendingEvents.push({
            id: ev.id, epoch: ev.t, type: ev.type as EventType,
            tankPct: ev.tank, flowLpm: 0, stopReason: ev.stop as StopReason,
            durationSec: ev.dur, synced: true,
          });
        } catch {}
      });
      this.subscriptions.push(sub);

      connected.writeCharacteristicWithResponseForService(
        BLE_SERVICE_UUID, BLE_CHAR_LOG_CTRL, Buffer.from([BLE_LOG_START]).toString("base64"),
      ).catch((e: unknown) => {
        this.log(`LOG_CTRL write failed: ${String(e)}`);
        clearTimeout(timeoutHandle);
        done(false);
        resolve();
      });
    });
  }
}
