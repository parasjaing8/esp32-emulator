# FlashLink — Product Plan (Vision to Play Store)

## What this app does
Android app that turns any ESP32 into a wireless dev board over BLE:
- Live GPIO read/write dashboard (all pins)
- BLE serial terminal (UART0 passthrough)
- OTA firmware flash (.bin from phone storage, BLE transfer)
- Dual-partition switcher (OS firmware ↔ project firmware)

**UVP:** No cloud. No account. No USB cable.

---

## Current State (as of 2026-05-31)

| Layer | Status |
|---|---|
| UI — all 4 screens | Done (simulation mode works) |
| BLE — real connection | NOT wired (2 stubs in DeviceContext) |
| BLEService.ts | WaterTank code, wrong UUIDs |
| FirmwareUpdateService.ts | Complete NimBLEOta protocol, needs UUID fix |
| AuthService.ts | Reusable, just rename storage keys |
| ESP32 OS firmware | Doesn't exist yet |
| expo prebuild / android/ | Never run |

---

## Phase 0 — Cleanup

Remove WaterTank artifacts. Zero WaterTank references in source files after this phase.

**Delete:**
- `models/Event.ts`
- `storage/database.ts`
- `services/IDeviceService.ts`

**Rename storage keys only:**
- `services/AuthService.ts` — `@watertank_auth` → `@flashlink_auth`
- `services/CrashReportService.ts` — `@watertank_diag` → `@flashlink_diag`

**Add to `constants/ble.ts`:**
```ts
export const BLE_OTA_SERVICE_UUID = '00008018-0000-1000-8000-00805f9b34fb';
export const BLE_OTA_CHAR_RECV_FW = '00008020-0000-1000-8000-00805f9b34fb';
export const BLE_OTA_CHAR_COMMAND = '00008022-0000-1000-8000-00805f9b34fb';
export const BLE_RECONNECT_DELAYS = [5000, 10000, 20000, 30000];
export const BLE_SCAN_TIMEOUT = 15000;
export const BLE_MTU_SIZE = 512;
```

**Done when:** `npm run typecheck` passes. Sim mode works identically.

---

## Phase 1 — BLE Core

**Goal:** Real phone connects to real ESP32, board info shows, GPIO toggles change physical pins.

**Rewrite `services/BLEService.ts`** as `ESP32BLEService` using WaterTank as structural template:
- Port: `getBleManager()` singleton, scan loop + timeout, `connectToDevice()` with MTU 512, `runAuthHandshake()` (CHAR_CLAIMED → stored token → password fallback), reconnect backoff (`scheduleReconnect`)
- New: `runConnectionSetup()` reads CHAR_BOARD_INFO, subscribes CHAR_GPIO_STATE notify
- New: `writeGpioConfig(pin, mode)` → CHAR_GPIO_CONFIG JSON
- New: `writeGpioPin(pin, value)` → CHAR_GPIO_WRITE JSON (write-without-response)

**Wire `context/DeviceContext.tsx`:**
- `scanForDevices()` (~line 242): call `esp32Service.discoverDevices()` on real path
- `connectToDevice()` (~line 249): call `esp32Service.connectToDevice()`, subscribe state events, populate `boardInfo` / `pinStates` / `appPartition`
- `setPinMode()` / `writePin()`: add real-path branches
- Sim path stays completely untouched

Add Android BLE runtime permissions (`BLUETOOTH_SCAN`, `BLUETOOTH_CONNECT`) before first scan.

---

## Phase 2 — Serial Terminal + OTA

**Serial** in `ESP32BLEService`:
- `subscribeSerialRx(cb)` — monitor CHAR_SERIAL_RX notify, buffer to newline (MTU=512 so lines >509 chars span packets), emit string lines
- `sendSerialTx(text)` — write UTF-8 to CHAR_SERIAL_TX write-without-response
- Wire `DeviceContext.sendSerial()` real-path

**OTA flash** in `DeviceContext.flashFirmware(uri)` real-path:
1. Read .bin bytes via `expo-file-system` base64 → `Uint8Array`
2. Call `FirmwareUpdateService.performOtaTransfer(bytes, deviceId, onProgress, signal)` — protocol already correct, just needed Phase 0 UUID fix
3. Pipe `onProgress` → `setOtaProgress`, on success append `flashHistory`

**Partition switch** in `DeviceContext.bootPartition(target)` real-path:
- Write `{ cmd: "BOOT_OS" | "BOOT_APP" }` to CHAR_PARTITION
- Board disconnects (reboots), reconnect logic picks it back up

---

## Phase 3 — UI Polish

Run `/frontend-design` skill on each screen for Play Store quality visuals.

Targets:
- GPIO screen: green glow on HIGH pins, gradient ADC bars, consider 3-column layout (ESP32 has 25 pins)
- Firmware screen: pulsing OTA progress bar, slide-in flash history animations
- Board screen: animated connection indicator, partition fill bars
- Terminal screen: new lines slide in from bottom
- Scan sheet: vivid RSSI indicator

Rules: all color changes via `constants/theme.ts` / `constants/colors.ts`. Don't touch tab bar layout.

Can run in parallel after Phase 0 — purely additive to screen files.

---

## Phase 4 — ESP32 OS Firmware

Write `firmware/esp32-os/esp32_os.ino`.

**Libraries:** NimBLE-Arduino 2.x, NimBLEOta, ArduinoJson, Preferences (built-in), mbedtls (built-in)

**Port from WaterTank firmware verbatim:**
- `AuthCB`, `SetupCB`, `VisibilityCB`, `ClaimedCB` BLE callbacks
- `sessionFind`, `sessionAdd`, `genToken`, NVS persistence
- SHA256 salted password hashing

**New characteristics:**

| Char | Op | Payload |
|---|---|---|
| CHAR_BOARD_INFO | READ | `{"chip":"ESP32-C3","mac":"..","flash_mb":4,"fw_version":"1.0.0","app_partition":"os"}` |
| CHAR_GPIO_CONFIG | WRITE | `{"pin":5,"mode":"OUTPUT"}` |
| CHAR_GPIO_WRITE | WRITE | `{"pin":5,"value":1}` + notify GPIO_STATE |
| CHAR_GPIO_STATE | READ+NOTIFY | `{"pins":{"5":1},"ts":1234}` — 100ms poll for INPUT changes |
| CHAR_ADC_READ | WRITE+READ | write pin number, read uint16 LE |
| CHAR_SERIAL_TX | WRITE | raw bytes → `Serial.write()` |
| CHAR_SERIAL_RX | NOTIFY | buffer Serial, notify in MTU-3 chunks every 20ms |
| CHAR_PARTITION | WRITE+READ | `{"cmd":"BOOT_APP"}` → `esp_ota_set_boot_partition` + restart |

NimBLEOta handles actual binary OTA via its own GATT service (00008018-...).

**Partition table** (4MB flash, `partitions.csv`):
```
nvs,    data, nvs,   0x9000,  0x6000
otadata,data, ota,   0xf000,  0x2000
ota_0,  app,  ota_0, 0x10000, 0x1E0000
ota_1,  app,  ota_1, 0x1F0000,0x1E0000
```

**Safety:** 10s OTA watchdog — if `esp_ota_mark_app_valid_cancel_rollback()` not called on first boot from new image → rollback to OS partition.

Advertise as `ESP32-OS-<last4MAC>`.

Can start in parallel with Phase 2.

---

## Phase 5 — Build + Hardware Test

**App name: FlashLink** — finalized 2026-06-01. `android.package`: `com.parasjain.flashlink`.

**Build:**
```sh
npm install
expo prebuild --platform android
cd android && ./gradlew clean && ./gradlew assembleRelease
# Play Store: ./gradlew bundleRelease
```
Generate keystore, add `signingConfigs` to `android/app/build.gradle`.

**Hardware test matrix** (ESP32-C3 + ESP32 Classic):
- Scan + connect, auth (default pw + session token reconnect)
- BOARD_INFO, GPIO config/write/notify, ADC
- Serial TX + RX
- OTA small (~100KB) + large (~1MB)
- Partition switch both directions
- BLE drop + reconnect

**Watch for:**
- Android 12+ runtime BLE permissions
- MTU negotiation failure (log MTU, warn if <200 — OTA works but slow)
- ESP32-C3 GPIO18/19 are USB pins — refuse OUTPUT mode in firmware

---

## Phase 6 — Launch

**Play Store:**
- 2+ screenshots (1080×1920), feature graphic (1024×500)
- Short desc: "Control ESP32 GPIO, flash firmware, open a serial terminal — all over BLE"
- Privacy policy URL required (GitHub Pages one-pager)
- Target API 34 (Android 14) required for new submissions

**Open source Arduino library** (ecosystem moat):
```cpp
#include <FlashLinkOS.h>  // 1 line makes any sketch app-compatible
```

**Community seed:** r/esp32, r/arduino, Hackaday.io, Arduino Forum.

---

## WaterTank Reuse Map

| File | Action |
|---|---|
| `AuthService.ts` | Keep — rename 2 storage key strings |
| `FirmwareUpdateService.ts` | Keep — Phase 0 UUID fix unblocks it |
| `CrashReportService.ts` | Keep — rename storage key |
| `PairingSheet.tsx`, `DeviceScanSheet.tsx`, `DeviceSetupModal.tsx` | Keep as-is |
| `BLEService.ts` | Rewrite using as structural template |
| WaterTank firmware auth section | Port verbatim to `firmware/esp32-os/` |
| `models/Event.ts` | Delete |
| `storage/database.ts` | Delete |
| `services/IDeviceService.ts` | Delete |
