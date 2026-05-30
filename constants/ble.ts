// ESP32 Emulator OS — BLE protocol
// The "OS firmware" on ESP32 exposes these characteristics.
// Project firmware (WaterTank, custom, etc.) lives in the other OTA partition.

export const OS_SERVICE_UUID   = 'e32f0001-b5a3-f393-e0a9-e50e24dcca9e';

// ── Core characteristics ──────────────────────────────────────────────────────
export const CHAR_BOARD_INFO   = 'e32f0002-b5a3-f393-e0a9-e50e24dcca9e'; // READ
// JSON: { chip, revision, mac, flash_mb, psram_mb, fw_version, app_partition }

export const CHAR_GPIO_CONFIG  = 'e32f0003-b5a3-f393-e0a9-e50e24dcca9e'; // WRITE
// JSON: { pin, mode }  — mode: "INPUT" | "OUTPUT" | "INPUT_PULLUP" | "INPUT_PULLDOWN"

export const CHAR_GPIO_WRITE   = 'e32f0004-b5a3-f393-e0a9-e50e24dcca9e'; // WRITE
// JSON: { pin, value }  — value: 0 | 1

export const CHAR_GPIO_STATE   = 'e32f0005-b5a3-f393-e0a9-e50e24dcca9e'; // READ + NOTIFY
// JSON: { pins: { "4": 1, "5": 0, ... }, ts }  — notified on any pin change

export const CHAR_ADC_READ     = 'e32f0006-b5a3-f393-e0a9-e50e24dcca9e'; // WRITE + READ
// Write pin number (uint8), read returns uint16 ADC value (0-4095)

export const CHAR_PWM_WRITE    = 'e32f0007-b5a3-f393-e0a9-e50e24dcca9e'; // WRITE
// JSON: { pin, freq, duty }  — duty 0-255

// ── Serial terminal ───────────────────────────────────────────────────────────
export const CHAR_SERIAL_TX    = 'e32f0008-b5a3-f393-e0a9-e50e24dcca9e'; // WRITE
// Raw bytes to send to ESP32 UART0

export const CHAR_SERIAL_RX    = 'e32f0009-b5a3-f393-e0a9-e50e24dcca9e'; // NOTIFY
// Raw bytes received from ESP32 UART0

// ── OTA firmware flash ────────────────────────────────────────────────────────
// Reuses the same OTA protocol from WaterTank (proven 24/26 bench tests)
export const CHAR_OTA_CTRL     = 'e32f000a-b5a3-f393-e0a9-e50e24dcca9e'; // WRITE + NOTIFY
// Write: JSON { cmd: "START", size, sha256 } | { cmd: "ABORT" }
// Notify: JSON { status: "READY" | "PROGRESS" | "DONE" | "ERROR", pct? }

export const CHAR_OTA_DATA     = 'e32f000b-b5a3-f393-e0a9-e50e24dcca9e'; // WRITE
// Raw binary firmware chunks (512B each)

// ── Auth (same model as WaterTank) ────────────────────────────────────────────
export const CHAR_AUTH         = 'e32f000c-b5a3-f393-e0a9-e50e24dcca9e'; // WRITE + READ
export const CHAR_SESSION      = 'e32f000d-b5a3-f393-e0a9-e50e24dcca9e'; // READ
export const CHAR_SETUP        = 'e32f000e-b5a3-f393-e0a9-e50e24dcca9e'; // WRITE
export const CHAR_VISIBILITY   = 'e32f000f-b5a3-f393-e0a9-e50e24dcca9e'; // WRITE
export const CHAR_CLAIMED      = 'e32f0010-b5a3-f393-e0a9-e50e24dcca9e'; // READ

// ── Partition control ─────────────────────────────────────────────────────────
export const CHAR_PARTITION    = 'e32f0011-b5a3-f393-e0a9-e50e24dcca9e'; // WRITE + READ
// Write: JSON { cmd: "BOOT_OS" | "BOOT_APP" | "STATUS" }
// Read:  JSON { active: "os" | "app", app_name?, app_version? }

// ── Board identification ──────────────────────────────────────────────────────
export const OS_DEVICE_NAME_PREFIX = 'ESP32-OS';
export const DEFAULT_PASSWORD      = '1234';

// ── NimBLEOta protocol (separate GATT service — same as WaterTank) ────────────
// These are the NimBLEOta library's fixed UUIDs, used by FirmwareUpdateService.ts
export const BLE_OTA_SERVICE_UUID  = '00008018-0000-1000-8000-00805f9b34fb';
export const BLE_OTA_CHAR_RECV_FW  = '00008020-0000-1000-8000-00805f9b34fb';
export const BLE_OTA_CHAR_COMMAND  = '00008022-0000-1000-8000-00805f9b34fb';

// ── BLE tuning ────────────────────────────────────────────────────────────────
export const BLE_MTU_SIZE          = 512;
export const BLE_SCAN_TIMEOUT      = 10000;
export const BLE_RECONNECT_DELAYS  = [5000, 10000, 20000, 30000] as const;
