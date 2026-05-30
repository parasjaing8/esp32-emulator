import React, { createContext, useContext, useState, useRef, useCallback } from 'react';
import { BleManager, Device } from 'react-native-ble-plx';
import { PIN_MAP, type ChipVariant, type PinDef } from '@/constants/gpio';

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

interface DeviceContextValue {
  // Connection
  connected:      boolean;
  connecting:     boolean;
  boardInfo:      BoardInfo | null;
  connect:        (device: Device) => Promise<void>;
  disconnect:     () => void;
  // GPIO
  pinStates:      Record<number, number>;
  setPinMode:     (pin: number, mode: string) => void;
  writePin:       (pin: number, value: number) => void;
  // Serial
  serialLines:    SerialLine[];
  sendSerial:     (text: string) => void;
  // OTA
  otaProgress:    number | null;
  flashFirmware:  (uri: string) => Promise<void>;
  // Partition
  bootPartition:  (target: 'os' | 'app') => void;
}

// ── Context ───────────────────────────────────────────────────────────────────

const DeviceContext = createContext<DeviceContextValue | null>(null);

export function useDevice() {
  const ctx = useContext(DeviceContext);
  if (!ctx) throw new Error('useDevice must be used inside DeviceProvider');
  return ctx;
}

// ── Provider ──────────────────────────────────────────────────────────────────

export function DeviceProvider({ children }: { children: React.ReactNode }) {
  const [connected, setConnected]       = useState(false);
  const [connecting, setConnecting]     = useState(false);
  const [boardInfo, setBoardInfo]       = useState<BoardInfo | null>(null);
  const [pinStates, setPinStates]       = useState<Record<number, number>>({});
  const [serialLines, setSerialLines]   = useState<SerialLine[]>([]);
  const [otaProgress, setOtaProgress]   = useState<number | null>(null);

  const deviceRef = useRef<Device | null>(null);

  // ── Connect ──────────────────────────────────────────────────────────────
  const connect = useCallback(async (device: Device) => {
    setConnecting(true);
    try {
      await device.connect();
      await device.discoverAllServicesAndCharacteristics();
      deviceRef.current = device;
      setConnected(true);

      // Read board info
      // TODO: read CHAR_BOARD_INFO, parse JSON, set boardInfo
      // For now, set mock info based on known board
      setBoardInfo({
        chip:          'ESP32-C3',
        revision:      'v0.4',
        mac:           device.id,
        flash_mb:      4,
        psram_mb:      0,
        fw_version:    '1.0.0',
        app_partition: 'os',
        pins:          PIN_MAP['ESP32-C3'],
      });

      // Subscribe to GPIO state notifications
      // TODO: subscribe CHAR_GPIO_STATE
    } catch (e) {
      console.error('Connect failed:', e);
    } finally {
      setConnecting(false);
    }
  }, []);

  // ── Disconnect ───────────────────────────────────────────────────────────
  const disconnect = useCallback(() => {
    deviceRef.current?.cancelConnection();
    deviceRef.current = null;
    setConnected(false);
    setBoardInfo(null);
    setPinStates({});
    setSerialLines([]);
    setOtaProgress(null);
  }, []);

  // ── GPIO ─────────────────────────────────────────────────────────────────
  const setPinMode = useCallback((pin: number, mode: string) => {
    // TODO: write CHAR_GPIO_CONFIG {pin, mode}
    console.log('setPinMode', pin, mode);
  }, []);

  const writePin = useCallback((pin: number, value: number) => {
    // TODO: write CHAR_GPIO_WRITE {pin, value}
    setPinStates((prev) => ({ ...prev, [pin]: value }));
  }, []);

  // ── Serial ───────────────────────────────────────────────────────────────
  const sendSerial = useCallback((text: string) => {
    // TODO: write CHAR_SERIAL_TX
    const line: SerialLine = { id: Date.now().toString(), text, dir: 'tx', ts: Date.now() };
    setSerialLines((prev) => [...prev.slice(-200), line]);
  }, []);

  function addRxLine(text: string) {
    const line: SerialLine = { id: Date.now().toString(), text, dir: 'rx', ts: Date.now() };
    setSerialLines((prev) => [...prev.slice(-200), line]);
  }

  // ── OTA ──────────────────────────────────────────────────────────────────
  const flashFirmware = useCallback(async (uri: string) => {
    setOtaProgress(0);
    // TODO: implement BLE OTA using FirmwareUpdateService pattern from WaterTank
    // 1. Read file bytes from uri
    // 2. Write CHAR_OTA_CTRL {cmd:"START", size, sha256}
    // 3. Wait for READY notify
    // 4. Stream 512B chunks to CHAR_OTA_DATA
    // 5. Monitor CHAR_OTA_CTRL notify for PROGRESS/DONE/ERROR
    console.log('flashFirmware', uri);
    setOtaProgress(null);
  }, []);

  // ── Partition ────────────────────────────────────────────────────────────
  const bootPartition = useCallback((target: 'os' | 'app') => {
    // TODO: write CHAR_PARTITION {cmd: target === 'os' ? 'BOOT_OS' : 'BOOT_APP'}
    console.log('bootPartition', target);
  }, []);

  return (
    <DeviceContext.Provider value={{
      connected, connecting, boardInfo, connect, disconnect,
      pinStates, setPinMode, writePin,
      serialLines, sendSerial,
      otaProgress, flashFirmware,
      bootPartition,
    }}>
      {children}
    </DeviceContext.Provider>
  );
}
