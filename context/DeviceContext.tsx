import React, {
  createContext, useContext, useState, useRef,
  useCallback, useEffect,
} from 'react';
import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system';
import { Buffer } from 'buffer';
import { PIN_MAP, type ChipVariant, type PinDef, type PinMode } from '@/constants/gpio';
import { getEsp32BleService } from '@/services/BLEService';
import { performOtaTransfer } from '@/services/FirmwareUpdateService';

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
  // Auth
  authNeeded:     { isClaimed: boolean } | null;
  submitPassword: (password: string) => Promise<boolean>;
  completeSetup:  (name: string, password: string) => Promise<boolean>;
  dismissAuth:    () => void;
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
  const [authNeeded, setAuthNeeded] = useState<{ isClaimed: boolean } | null>(null);

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
    if (Platform.OS === 'web') {
      await new Promise<void>((r) => setTimeout(r, 1500));
      return [SIM_DEVICE];
    }
    const bleService = getEsp32BleService();
    const real = await bleService.discoverDevices();
    return [SIM_DEVICE, ...real];
  }, []);

  const connectToDevice = useCallback(async (device: DiscoveredDevice) => {
    setConnecting(true);
    try {
      if (device.isSim || Platform.OS === 'web') {
        // Simulation path — unchanged
        await new Promise<void>((r) => setTimeout(r, 800));
        const board = { ...SIM_BOARD };
        setBoardInfo(board);
        setAppPartition(board.app_partition);
        setConnected(true);
        isSimConnected.current = true;
        setSimMode(true);
        addRxLine('--- Simulation mode ---');
        addRxLine(`Board: ${board.chip} rev ${board.revision}`);
        startSimulation(board);
        return;
      }

      // Real BLE path
      const bleService = getEsp32BleService();
      await bleService.connect(device.id, {
        onBoardInfo: (info) => {
          setBoardInfo(info);
          setAppPartition(info.app_partition);
          if (info.pins?.length) {
            setPinModes(buildInitialPinModes(info.pins));
            setPinStates(buildInitialPinStates(info.pins, buildInitialPinModes(info.pins)));
          }
          addRxLine(`Board: ${info.chip} rev ${info.revision}`);
          uptimeInterval.current = setInterval(() => setUptime((u) => u + 1), 1000);
        },
        onPinStates: (states) => {
          const parsed: Record<number, number> = {};
          Object.entries(states).forEach(([k, v]) => { parsed[Number(k)] = Number(v); });
          setPinStates(parsed);
        },
        onSerialLine: (line) => addRxLine(line),
        onDisconnect: () => {
          if (uptimeInterval.current) clearInterval(uptimeInterval.current);
          setConnected(false);
          addRxLine('--- Disconnected ---');
        },
        onAuthNeeded: (isClaimed) => {
          setAuthNeeded({ isClaimed });
          addRxLine(isClaimed ? '--- Auth required ---' : '--- Setup required ---');
        },
      });
      setConnected(true);
      setSimMode(false);
      isSimConnected.current = false;
    } finally {
      setConnecting(false);
    }
  }, [addRxLine, startSimulation]);

  const disconnect = useCallback(() => {
    stopSimulation();
    if (!simMode) getEsp32BleService().disconnect();
    isSimConnected.current = false;
    if (uptimeInterval.current) { clearInterval(uptimeInterval.current); uptimeInterval.current = null; }
    setConnected(false);
    setBoardInfo(null);
    setPinStates({});
    setPinModes({});
    setAdcValues({});
    setUptime(0);
    setOtaProgress(null);
    setSimMode(true);
  }, [stopSimulation, simMode]);

  // ── GPIO ─────────────────────────────────────────────────────────────────

  const setPinMode = useCallback((pin: number, mode: PinMode) => {
    setPinModes((prev) => ({ ...prev, [pin]: mode }));
    if (mode === 'ADC') {
      setAdcValues((prev) => ({ ...prev, [pin]: Math.floor(Math.random() * 3000) + 500 }));
    }
    addRxLine(`GPIO${pin} mode → ${mode}`);
    if (!simMode) {
      getEsp32BleService().writeGpioConfig(pin, mode).catch((e) => addRxLine(`ERR: ${e}`));
    }
  }, [addRxLine, simMode]);

  const writePin = useCallback((pin: number, value: number) => {
    setPinStates((prev) => ({ ...prev, [pin]: value }));
    addRxLine(`GPIO${pin} → ${value === 1 ? 'HIGH' : 'LOW'}`);
    if (!simMode) {
      getEsp32BleService().writeGpioPin(pin, value).catch((e) => addRxLine(`ERR: ${e}`));
    }
  }, [addRxLine, simMode]);

  // ── Serial ───────────────────────────────────────────────────────────────

  const sendSerial = useCallback((text: string) => {
    setSerialLines((prev) => [
      ...prev.slice(-300),
      { id: uid(), text: text.trimEnd(), dir: 'tx', ts: Date.now() },
    ]);
    if (simMode) {
      setTimeout(() => addRxLine(`OK: ${text.trim()}`), 120 + Math.random() * 200);
    } else {
      getEsp32BleService().sendSerial(text + '\n').catch((e) => addRxLine(`ERR: ${e}`));
    }
  }, [simMode, addRxLine]);

  const clearSerial = useCallback(() => setSerialLines([]), []);

  // ── Auth ─────────────────────────────────────────────────────────────────

  const submitPassword = useCallback(async (password: string): Promise<boolean> => {
    const ok = await getEsp32BleService().submitPassword(password);
    if (ok) setAuthNeeded(null);
    return ok;
  }, []);

  const completeSetup = useCallback(async (name: string, password: string): Promise<boolean> => {
    const ok = await getEsp32BleService().completeSetup(name, password);
    if (ok) setAuthNeeded(null);
    return ok;
  }, []);

  const dismissAuth = useCallback(() => setAuthNeeded(null), []);

  // ── OTA ──────────────────────────────────────────────────────────────────

  const flashFirmware = useCallback(async (uri: string, name: string, sizeKb: number) => {
    setOtaProgress(0);
    addRxLine(`OTA START: ${name} (${sizeKb} KB)`);

    if (simMode) {
      const steps = 40;
      for (let i = 1; i <= steps; i++) {
        await new Promise<void>((r) => setTimeout(r, 80 + Math.random() * 60));
        setOtaProgress(Math.round((i / steps) * 100));
      }
      addRxLine('OTA DONE — reboot pending');
    } else {
      const deviceId = getEsp32BleService().connectedDeviceId;
      if (!deviceId) throw new Error('Not connected');
      const b64 = await FileSystem.readAsStringAsync(uri, { encoding: 'base64' });
      const bytes = new Uint8Array(Buffer.from(b64, 'base64'));
      await performOtaTransfer(bytes, deviceId, (done, total) => {
        setOtaProgress(Math.round((done / total) * 100));
      });
      addRxLine('OTA DONE — board rebooting');
    }

    setFlashHistory((h) => [{ name, sizeKb, date: Date.now() }, ...h].slice(0, 5));
    setOtaProgress(null);
  }, [addRxLine, simMode]);

  // ── Partition ────────────────────────────────────────────────────────────

  const bootPartition = useCallback((target: 'os' | 'app') => {
    setAppPartition(target);
    setBoardInfo((b) => b ? { ...b, app_partition: target } : b);
    addRxLine(`Rebooting to ${target.toUpperCase()} partition…`);
    if (!simMode) {
      getEsp32BleService().bootPartition(target).catch((e) => addRxLine(`ERR: ${e}`));
    }
  }, [addRxLine, simMode]);

  const value: DeviceContextValue = {
    connected, connecting, simMode, boardInfo, uptime, appPartition,
    authNeeded, submitPassword, completeSetup, dismissAuth,
    pinStates, pinModes, adcValues, setPinMode, writePin,
    serialLines, sendSerial, clearSerial,
    otaProgress, flashFirmware, flashHistory,
    bootPartition,
    scanForDevices, connectToDevice, disconnect,
  };

  return <DeviceContext.Provider value={value}>{children}</DeviceContext.Provider>;
}
