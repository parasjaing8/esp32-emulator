// ESP32BLEService — BLE implementation for FlashLink OS protocol.
// Uses react-native-ble-plx. Platform-guarded (no-op on web).
//
// Auth flow:
//   connect → read CHAR_CLAIMED → try stored token → if fail emit onAuthNeeded
//   → submitPassword() → on success runSetup → emit boardInfo + subscribe GPIO_STATE

import { Platform, PermissionsAndroid } from 'react-native';
import { Buffer } from 'buffer';
import {
  OS_SERVICE_UUID, CHAR_AUTH, CHAR_SESSION, CHAR_SETUP,
  CHAR_CLAIMED, CHAR_VISIBILITY,
  CHAR_BOARD_INFO, CHAR_GPIO_CONFIG, CHAR_GPIO_WRITE, CHAR_GPIO_STATE,
  CHAR_SERIAL_TX, CHAR_SERIAL_RX, CHAR_PARTITION,
  OS_DEVICE_NAME_PREFIX, BLE_MTU_SIZE, BLE_SCAN_TIMEOUT, BLE_RECONNECT_DELAYS,
} from '@/constants/ble';
import * as AuthService from '@/services/AuthService';
import { logBleInfo, logBleError } from '@/services/CrashReportService';
import type { BoardInfo } from '@/context/DeviceContext';
import { PIN_MAP, type ChipVariant } from '@/constants/gpio';

// ── Types ─────────────────────────────────────────────────────────────────────

export type DiscoveredDevice = { id: string; name: string; rssi: number };

export type ESP32Callbacks = {
  onBoardInfo:   (info: BoardInfo) => void;
  onPinStates:   (states: Record<number, number>) => void;
  onSerialLine:  (line: string) => void;
  onDisconnect:  () => void;
  onAuthNeeded:  (isClaimed: boolean) => void;
};

type ConnectedDevice = {
  id: string;
  discoverAllServicesAndCharacteristics(): Promise<unknown>;
  requestMTU(size: number): Promise<unknown>;
  onDisconnected(cb: (err: unknown) => void): { remove(): void };
  readCharacteristicForService(svc: string, ch: string): Promise<{ value?: string | null } | null>;
  writeCharacteristicWithResponseForService(svc: string, ch: string, b64: string): Promise<unknown>;
  writeCharacteristicWithoutResponseForService(svc: string, ch: string, b64: string): Promise<unknown>;
  monitorCharacteristicForService(svc: string, ch: string, cb: (err: unknown, c: { value?: string | null } | null) => void): { remove(): void };
};

// ── Singleton BleManager ──────────────────────────────────────────────────────

let _BleManagerClass: new () => unknown = null!;
let _managerInstance: unknown = null;
export let bleModuleAvailable = false;

if (Platform.OS === 'android' || Platform.OS === 'ios') {
  try {
    const mod = require('react-native-ble-plx');
    _BleManagerClass = mod.BleManager;
    bleModuleAvailable = true;
  } catch { bleModuleAvailable = false; }
}

export function getBleManager(): unknown {
  if (!bleModuleAvailable || !_BleManagerClass) return null;
  if (!_managerInstance) {
    try { _managerInstance = new _BleManagerClass(); } catch { return null; }
  }
  return _managerInstance;
}

export function resetBleManager(): void { _managerInstance = null; }

// ── Main service ──────────────────────────────────────────────────────────────

export class ESP32BLEService {
  private device: ConnectedDevice | null = null;
  private subs: { remove(): void }[] = [];
  private serialBuf = '';
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempt = 0;
  private cbs: ESP32Callbacks | null = null;
  private _deviceId: string | null = null;

  // ── Scan ────────────────────────────────────────────────────────────────────

  async discoverDevices(timeoutMs = BLE_SCAN_TIMEOUT): Promise<DiscoveredDevice[]> {
    const manager = getBleManager() as {
      startDeviceScan(uuids: null, opts: unknown, cb: (err: unknown, dev: unknown) => void): void;
      stopDeviceScan(): void;
    } | null;
    if (!manager) return [];

    if (Platform.OS === 'android') {
      await PermissionsAndroid.requestMultiple([
        'android.permission.BLUETOOTH_SCAN' as never,
        'android.permission.BLUETOOTH_CONNECT' as never,
        'android.permission.ACCESS_FINE_LOCATION' as never,
      ]);
    }

    return new Promise((resolve) => {
      const found: Map<string, DiscoveredDevice> = new Map();
      const timer = setTimeout(() => {
        manager.stopDeviceScan();
        resolve([...found.values()]);
      }, timeoutMs);

      manager.startDeviceScan(null, { allowDuplicates: false }, (err: unknown, dev: unknown) => {
        if (err) {
          clearTimeout(timer);
          manager.stopDeviceScan();
          logBleError('scan error', { err: String(err) });
          resolve([...found.values()]);
          return;
        }
        const d = dev as { id: string; name?: string | null; localName?: string | null; rssi?: number | null };
        const name = d.localName ?? d.name ?? '';
        if (name.startsWith(OS_DEVICE_NAME_PREFIX)) {
          found.set(d.id, { id: d.id, name, rssi: d.rssi ?? -99 });
        }
      });
    });
  }

  stopScan(): void {
    const manager = getBleManager() as { stopDeviceScan(): void } | null;
    manager?.stopDeviceScan();
  }

  // ── Connect ─────────────────────────────────────────────────────────────────

  async connect(deviceId: string, cbs: ESP32Callbacks): Promise<void> {
    this.cbs = cbs;
    this._deviceId = deviceId;
    this.reconnectAttempt = 0;
    await this._doConnect(deviceId);
  }

  private async _doConnect(deviceId: string): Promise<void> {
    const manager = getBleManager() as {
      connectToDevice(id: string, opts: unknown): Promise<ConnectedDevice>;
    } | null;
    if (!manager) throw new Error('BLE not available');

    try {
      logBleInfo('connecting', { deviceId });
      const raw = await manager.connectToDevice(deviceId, { timeout: 10000 });
      await raw.requestMTU(BLE_MTU_SIZE);
      await raw.discoverAllServicesAndCharacteristics();
      this.device = raw as ConnectedDevice;

      const disconnectSub = this.device.onDisconnected(() => {
        logBleInfo('disconnected', { deviceId });
        this._cleanup(false);
        this.cbs?.onDisconnect();
        this._scheduleReconnect();
      });
      this.subs.push(disconnectSub);

      await this._runAuthHandshake();
    } catch (err) {
      logBleError('connect failed', { err: String(err) });
      this._cleanup(false);
      throw err;
    }
  }

  // ── Auth ────────────────────────────────────────────────────────────────────

  private async _runAuthHandshake(): Promise<void> {
    if (!this.device) return;
    const deviceId = this.device.id;

    // Read CLAIMED flag
    const claimedChar = await this.device.readCharacteristicForService(OS_SERVICE_UUID, CHAR_CLAIMED);
    const claimedBuf = claimedChar?.value ? Buffer.from(claimedChar.value, 'base64') : Buffer.alloc(1);
    const isClaimed = claimedBuf[0] === 1;

    // Try stored session token
    const stored = await AuthService.getSession(deviceId);
    if (stored) {
      const tokenBuf = Buffer.from(stored.token, 'hex');
      await this.device.writeCharacteristicWithResponseForService(
        OS_SERVICE_UUID, CHAR_AUTH, tokenBuf.toString('base64'),
      );
      const authResp = await this.device.readCharacteristicForService(OS_SERVICE_UUID, CHAR_AUTH);
      const resp = authResp?.value ? Buffer.from(authResp.value, 'base64').toString('utf8').toUpperCase() : '';

      if (resp === 'OK' || resp === 'SETUP_REQUIRED') {
        await this._onAuthSuccess(resp === 'SETUP_REQUIRED');
        return;
      }
      // Stored token rejected — clear it
      await AuthService.clearSession(deviceId);
    }

    // Need password from user
    this.cbs?.onAuthNeeded(isClaimed);
  }

  async submitPassword(password: string): Promise<boolean> {
    if (!this.device) return false;
    const pwBuf = Buffer.from(password, 'utf8');
    await this.device.writeCharacteristicWithResponseForService(
      OS_SERVICE_UUID, CHAR_AUTH, pwBuf.toString('base64'),
    );
    const authResp = await this.device.readCharacteristicForService(OS_SERVICE_UUID, CHAR_AUTH);
    const resp = authResp?.value ? Buffer.from(authResp.value, 'base64').toString('utf8').toUpperCase() : '';
    if (resp === 'OK' || resp === 'SETUP_REQUIRED') {
      await this._onAuthSuccess(resp === 'SETUP_REQUIRED');
      return true;
    }
    return false;
  }

  async completeSetup(deviceName: string, newPassword: string): Promise<boolean> {
    if (!this.device) return false;
    const payload = Buffer.from(`${deviceName}|${newPassword}`, 'utf8');
    await this.device.writeCharacteristicWithResponseForService(
      OS_SERVICE_UUID, CHAR_SETUP, payload.toString('base64'),
    );
    const r = await this.device.readCharacteristicForService(OS_SERVICE_UUID, CHAR_SETUP);
    const resp = r?.value ? Buffer.from(r.value, 'base64').toString('utf8').toUpperCase() : '';
    if (resp !== 'OK') return false;

    // Store fresh session token generated by setup
    const sessChar = await this.device.readCharacteristicForService(OS_SERVICE_UUID, CHAR_SESSION);
    if (sessChar?.value) {
      const token = Buffer.from(sessChar.value, 'base64');
      await AuthService.storeSession(this.device.id, token, deviceName);
      await AuthService.setPreferredDevice(this.device.id);
    }

    await this._runConnectionSetup();
    return true;
  }

  private async _onAuthSuccess(setupRequired: boolean): Promise<void> {
    if (!this.device) return;
    const deviceId = this.device.id;

    // Read and store fresh session token
    const sessChar = await this.device.readCharacteristicForService(OS_SERVICE_UUID, CHAR_SESSION);
    if (sessChar?.value) {
      const token = Buffer.from(sessChar.value, 'base64');
      const deviceNameChar = await this.device.readCharacteristicForService(OS_SERVICE_UUID, CHAR_BOARD_INFO).catch(() => null);
      let name = 'ESP32-OS';
      if (deviceNameChar?.value) {
        try {
          const info = JSON.parse(Buffer.from(deviceNameChar.value, 'base64').toString('utf8'));
          name = info.chip ?? 'ESP32-OS';
        } catch { /* ignore */ }
      }
      await AuthService.storeSession(deviceId, token, name);
      await AuthService.setPreferredDevice(deviceId);
    }

    if (setupRequired) {
      this.cbs?.onAuthNeeded(false);
      return;
    }

    await this._runConnectionSetup();
  }

  // ── Post-auth setup ──────────────────────────────────────────────────────────

  private async _runConnectionSetup(): Promise<void> {
    if (!this.device) return;
    this.reconnectAttempt = 0;

    // Read board info
    const boardChar = await this.device.readCharacteristicForService(OS_SERVICE_UUID, CHAR_BOARD_INFO);
    if (boardChar?.value) {
      try {
        const raw = JSON.parse(Buffer.from(boardChar.value, 'base64').toString('utf8'));
        const boardInfo = this._parseBoardInfo(raw);
        this.cbs?.onBoardInfo(boardInfo);
        logBleInfo('board info', { chip: raw.chip, mac: raw.mac });
      } catch (err) {
        logBleError('board info parse error', { err: String(err) });
      }
    }

    // Subscribe to GPIO state notifications
    const gpioSub = this.device.monitorCharacteristicForService(
      OS_SERVICE_UUID, CHAR_GPIO_STATE,
      (err, char) => {
        if (err) { logBleError('gpio notify error', { err: String(err) }); return; }
        if (!char?.value) return;
        try {
          const data = JSON.parse(Buffer.from(char.value, 'base64').toString('utf8'));
          if (data.pins) this.cbs?.onPinStates(data.pins);
        } catch { /* ignore malformed */ }
      },
    );
    this.subs.push(gpioSub);

    // Subscribe to serial RX notifications
    const serialSub = this.device.monitorCharacteristicForService(
      OS_SERVICE_UUID, CHAR_SERIAL_RX,
      (err, char) => {
        if (err) return;
        if (!char?.value) return;
        const chunk = Buffer.from(char.value, 'base64').toString('utf8');
        this.serialBuf += chunk;
        let nl: number;
        while ((nl = this.serialBuf.indexOf('\n')) !== -1) {
          const line = this.serialBuf.slice(0, nl).trimEnd();
          if (line) this.cbs?.onSerialLine(line);
          this.serialBuf = this.serialBuf.slice(nl + 1);
        }
      },
    );
    this.subs.push(serialSub);

    logBleInfo('connection setup complete', { deviceId: this.device.id });
  }

  // ── GPIO ────────────────────────────────────────────────────────────────────

  async writeGpioConfig(pin: number, mode: string): Promise<void> {
    if (!this.device) return;
    const payload = Buffer.from(JSON.stringify({ pin, mode }), 'utf8');
    await this.device.writeCharacteristicWithoutResponseForService(
      OS_SERVICE_UUID, CHAR_GPIO_CONFIG, payload.toString('base64'),
    );
  }

  async writeGpioPin(pin: number, value: number): Promise<void> {
    if (!this.device) return;
    const payload = Buffer.from(JSON.stringify({ pin, value }), 'utf8');
    await this.device.writeCharacteristicWithoutResponseForService(
      OS_SERVICE_UUID, CHAR_GPIO_WRITE, payload.toString('base64'),
    );
  }

  // ── Serial ──────────────────────────────────────────────────────────────────

  async sendSerial(text: string): Promise<void> {
    if (!this.device) return;
    const payload = Buffer.from(text, 'utf8');
    await this.device.writeCharacteristicWithoutResponseForService(
      OS_SERVICE_UUID, CHAR_SERIAL_TX, payload.toString('base64'),
    );
  }

  // ── Partition ────────────────────────────────────────────────────────────────

  async bootPartition(target: 'os' | 'app'): Promise<void> {
    if (!this.device) return;
    const cmd = target === 'os' ? 'BOOT_OS' : 'BOOT_APP';
    const payload = Buffer.from(JSON.stringify({ cmd }), 'utf8');
    await this.device.writeCharacteristicWithResponseForService(
      OS_SERVICE_UUID, CHAR_PARTITION, payload.toString('base64'),
    ).catch(() => { /* board reboots so connection drops — that's expected */ });
  }

  // ── Reconnect ────────────────────────────────────────────────────────────────

  private _scheduleReconnect(): void {
    if (!this._deviceId || !this.cbs) return;
    const delay = BLE_RECONNECT_DELAYS[Math.min(this.reconnectAttempt, BLE_RECONNECT_DELAYS.length - 1)];
    this.reconnectAttempt++;
    logBleInfo('reconnect scheduled', { attempt: this.reconnectAttempt, delayMs: delay });
    this.reconnectTimer = setTimeout(async () => {
      try {
        await this._doConnect(this._deviceId!);
      } catch {
        this._scheduleReconnect();
      }
    }, delay);
  }

  // ── Disconnect ───────────────────────────────────────────────────────────────

  disconnect(): void {
    if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }
    this._cleanup(true);
    this._deviceId = null;
    this.cbs = null;
  }

  private _cleanup(cancelDisconnectSub: boolean): void {
    this.subs.forEach((s) => { try { s.remove(); } catch { /* ignore */ } });
    this.subs = [];
    if (cancelDisconnectSub && this.device) {
      try {
        (this.device as unknown as { cancelConnection(): void }).cancelConnection?.();
      } catch { /* ignore */ }
    }
    this.device = null;
    this.serialBuf = '';
  }

  // ── Getters ──────────────────────────────────────────────────────────────────

  get connectedDeviceId(): string | null { return this.device?.id ?? null; }

  // ── Helpers ──────────────────────────────────────────────────────────────────

  private _parseBoardInfo(raw: Record<string, unknown>): BoardInfo {
    const chip = (raw.chip as string ?? 'ESP32-C3') as ChipVariant;
    return {
      chip,
      revision:      String(raw.revision ?? 'v0'),
      mac:           String(raw.mac ?? ''),
      flash_mb:      Number(raw.flash_mb ?? 4),
      psram_mb:      Number(raw.psram_mb ?? 0),
      fw_version:    String(raw.fw_version ?? '1.0.0'),
      app_partition: (raw.app_partition as 'os' | 'app') ?? 'os',
      app_version:   raw.app_version as string | undefined,
      pins:          PIN_MAP[chip] ?? PIN_MAP['ESP32-C3'],
    };
  }
}

// ── Module-level singleton ────────────────────────────────────────────────────

let _serviceInstance: ESP32BLEService | null = null;

export function getEsp32BleService(): ESP32BLEService {
  if (!_serviceInstance) _serviceInstance = new ESP32BLEService();
  return _serviceInstance;
}
