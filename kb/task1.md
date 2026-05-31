# ESP32 Emulator — Atomic Task List

> For local LLM / DeepSeek execution. Work top-to-bottom. Mark each task DONE before moving to next.
> Always read a file before editing it. Never skip a task.
> Last updated: 2026-05-31 (Phase 0 + Phase 1 + Phase 4 complete)

---

## Phase 0 — Cleanup ✅ COMPLETE

- [x] **P0-1** Delete `models/Event.ts`
- [x] **P0-2** Delete `storage/database.ts`
- [x] **P0-3** Delete `services/IDeviceService.ts`
- [x] **P0-4** In `services/AuthService.ts`: replace `@watertank_auth` → `@esp32emu_auth` and `@watertank_preferred_device` → `@esp32emu_preferred_device`
- [x] **P0-5** In `services/CrashReportService.ts`: replace storage key `@watertank_diag` → `@esp32emu_diag` and fix "WaterTank" strings
- [x] **P0-6** In `constants/ble.ts`: add `BLE_OTA_SERVICE_UUID`, `BLE_OTA_CHAR_RECV_FW`, `BLE_OTA_CHAR_COMMAND`, `BLE_RECONNECT_DELAYS`, `BLE_SCAN_TIMEOUT`, `BLE_MTU_SIZE`
- [x] **P0-7** Fix broken imports (NotificationService.ts deleted — was unused)
- [x] **P0-8** TypeScript typecheck — zero errors ✓
- [x] **P0-9** Sim mode verified working in web browser ✓

---

## Phase 1 — BLE Core ✅ COMPLETE

### 1a — Rewrite BLEService ✅

- [x] **P1-1** Read WaterTank BLEService.ts
- [x] **P1-2** Read constants/ble.ts UUIDs
- [x] **P1-3** New `services/BLEService.ts` — exports `ESP32BLEService` class + `getBleManager()` singleton + `getEsp32BleService()` singleton
- [x] **P1-4** `getBleManager()` — platform guard, singleton
- [x] **P1-5** `discoverDevices(timeoutMs)` — null UUID scan, filter by `ESP32-OS` prefix
- [x] **P1-6** `connect(deviceId, callbacks)` — MTU 512, discover services, disconnect handler
- [x] **P1-7** `_runAuthHandshake()` — CHAR_CLAIMED → stored token → password fallback via onAuthNeeded callback
- [x] **P1-8** `_runConnectionSetup()` — read CHAR_BOARD_INFO, subscribe CHAR_GPIO_STATE notify, subscribe CHAR_SERIAL_RX notify
- [x] **P1-9** `writeGpioConfig(pin, mode)` — JSON to CHAR_GPIO_CONFIG (write-without-response)
- [x] **P1-10** `writeGpioPin(pin, value)` — JSON to CHAR_GPIO_WRITE (write-without-response)
- [x] **P1-11** `_scheduleReconnect()` — exponential backoff via BLE_RECONNECT_DELAYS
- [x] **P1-12** `disconnect()` — cancel reconnect timer, cleanup subscriptions, cancelConnection
- [x] **P1-13** `submitPassword()`, `completeSetup()`, `bootPartition()`, `sendSerial()` methods
- [x] **P1-14** TypeScript clean ✓

### 1b — Wire DeviceContext ✅

- [x] **P1-15** Read DeviceContext.tsx
- [x] **P1-16** `getEsp32BleService()` called inline (no useRef needed — singleton)
- [x] **P1-17** `scanForDevices()` — real BLE path via `getEsp32BleService().discoverDevices()`
- [x] **P1-18** `connectToDevice()` — real BLE path with all 5 callbacks wired
- [x] **P1-19** `setPinMode()` — real-path calls `writeGpioConfig()`
- [x] **P1-20** `writePin()` — real-path calls `writeGpioPin()`
- [x] **P1-21** Android BLE permissions — `PermissionsAndroid.requestMultiple()` inside `discoverDevices()` in BLEService
- [x] **P1-22** TypeScript clean ✓
- [x] **P1-23** Auth state (`authNeeded`) + `submitPassword` / `completeSetup` / `dismissAuth` added to context. PairingSheet wired in Board screen.

---

## Phase 2 — Serial Terminal + OTA ✅ CODED (needs hardware test)

### 2a — Serial ✅

- [x] **P2-1** `subscribeSerialRx` — in `_runConnectionSetup()`, CHAR_SERIAL_RX notify → buffer per-newline → `onSerialLine()`
- [x] **P2-2** `sendSerial(text)` — UTF-8 bytes to CHAR_SERIAL_TX write-without-response
- [x] **P2-3** `DeviceContext.sendSerial()` real-path → `getEsp32BleService().sendSerial(text + '\n')`
- [x] **P2-4** Serial RX subscription wired in `connectToDevice()` via `onSerialLine` callback

### 2b — OTA Flash ✅

- [x] **P2-5** FirmwareUpdateService.ts read — `performOtaTransfer(bytes, deviceId, onProgress, signal)`
- [x] **P2-6** `DeviceContext.flashFirmware()` real-path — FileSystem.readAsStringAsync → Uint8Array → performOtaTransfer → setOtaProgress
- [x] **P2-7** `DeviceContext.bootPartition()` real-path — write BOOT_OS/BOOT_APP JSON to CHAR_PARTITION
- [x] **P2-8** TypeScript clean ✓

---

## Phase 3 — UI Polish 🔲 PARTIAL

- [x] **P3-1** GPIO screen: HIGH pin glow (green shadow + 2px border + stronger bg), larger dot (9px), taller ADC bars (5px)
- [ ] **P3-2** `/frontend-design` on `app/(tabs)/firmware.tsx` — pulsing OTA progress bar, slide-in flash history
- [ ] **P3-3** `/frontend-design` on `app/(tabs)/index.tsx` — animated connection indicator, gradient partition bars
- [ ] **P3-4** `/frontend-design` on `app/(tabs)/terminal.tsx` — line slide-in, CRT texture
- [ ] **P3-5** `/frontend-design` on `components/DeviceScanSheet.tsx` — vivid RSSI bars
- [ ] **P3-6** Verify color changes are in `constants/theme.ts` / `constants/colors.ts`
- [ ] **P3-7** TypeScript clean
- [ ] **P3-8** Web sim mode render check

---

## Phase 4 — ESP32 OS Firmware ✅ COMPLETE + FLASHED

- [x] **P4-1** `firmware/esp32-os/` directory created
- [x] **P4-2** `firmware/esp32-os/partitions.csv` — correct dual-OTA offsets (nvs 0x9000/0x5000, otadata 0xe000/0x2000, ota_0 0x10000/0x1F0000, ota_1 0x200000/0x1F0000)
- [x] **P4-3** WaterTank firmware auth pattern studied
- [x] **P4-4** `firmware/esp32-os/esp32-os.ino` — full sketch created (note: filename must match folder)
- [x] **P4-5** NimBLE server init, MTU 512, advertise as `ESP32-OS-<last4MAC>`
- [x] **P4-6** Auth characteristics ported from WaterTank: AuthCB, SetupCB, VisibilityCB, ClaimedCB
- [x] **P4-7** NVS helpers ported: nvsLoadAuth, sessionFind, sessionAdd, sessionsClearAll, genToken, SHA256 salted
- [x] **P4-8** CHAR_BOARD_INFO READ — chip/MAC/flash/fw_version/app_partition JSON
- [x] **P4-9** CHAR_GPIO_CONFIG WRITE — pinMode(), gpioMode[] array
- [x] **P4-10** CHAR_GPIO_WRITE WRITE — digitalWrite(), notify GPIO_STATE
- [x] **P4-11** CHAR_GPIO_STATE READ+NOTIFY — 100ms INPUT poll, notify on change
- [x] **P4-12** CHAR_ADC_READ — write pin, read uint16 LE
- [x] **P4-13** CHAR_SERIAL_TX WRITE — Serial.write()
- [x] **P4-14** CHAR_SERIAL_RX NOTIFY — buffer 20ms, notify MTU-3 chunks
- [x] **P4-15** CHAR_PARTITION WRITE+READ — BOOT_OS/BOOT_APP + esp_ota_set_boot_partition + esp_restart
- [x] **P4-16** NimBLEOta init — `bleOta.start(new OtaCB())`
- [x] **P4-17** OTA watchdog — `esp_ota_mark_app_valid_cancel_rollback()` on first boot
- [ ] **P4-18** `firmware/esp32-os/README.md` — build instructions
- [x] **P4-19** Compiled: 632KB/1.9MB (48%), 7% RAM ✓
- [x] **P4-20** Flashed to ESP32-C3 at /dev/cu.usbmodem1101 ✓
- [x] **P4-21** Verified: advertising as ESP32-OS-C5B8, boot confirmed via serial ✓

---

## Phase 5 — Build + Hardware Test 🔲 IN PROGRESS

- [ ] **P5-1** Decide final app name — `android.package` cannot change post-Play Store submission
- [x] **P5-2** `npm install` ✓
- [x] **P5-3** `expo prebuild --platform android` — `android/` generated ✓
- [x] **P5-4** `cd android && ./gradlew clean && ./gradlew assembleRelease` ✓
- [ ] **P5-5** Generate release keystore: `keytool -genkey -v -keystore esp32-emulator-release.keystore -alias esp32emu -keyalg RSA -keysize 2048 -validity 10000`
- [ ] **P5-6** Add `signingConfigs` to `android/app/build.gradle`
- [x] **P5-7** APK at `release/esp32OSv1.apk` (82MB, debug-signed) ✓
- [x] **P5-7b** GitHub release: https://github.com/parasjaing8/esp32-emulator/releases/tag/v1.0.0 ✓
- [ ] **P5-8** Flash ESP32 OS firmware to ESP32-C3 (already done — reconnect USB if needed)
- [ ] **P5-9** Install APK on Android phone: `adb install -r release/esp32OSv1.apk`
- [ ] **P5-10** Hardware test: scan + connect, verify board info shows ESP32-C3 + real MAC
- [ ] **P5-11** Hardware test: auth with default password "1234", verify session token persists
- [ ] **P5-12** Hardware test: GPIO5 → OUTPUT, toggle HIGH/LOW, verify physical LED changes
- [ ] **P5-13** Hardware test: GPIO5 → INPUT, press button, verify GPIO_STATE notify updates
- [ ] **P5-14** Hardware test: ADC — potentiometer on GPIO4, verify value changes
- [ ] **P5-15** Hardware test: serial RX — `Serial.println("hello")` loop, verify in terminal screen
- [ ] **P5-16** Hardware test: serial TX — type command in app, verify on Serial Monitor
- [ ] **P5-17** Hardware test: OTA — flash small .bin (~100KB), verify progress + board reboots to partition B
- [ ] **P5-18** Hardware test: OTA — flash large .bin (~1MB), verify completes
- [ ] **P5-19** Hardware test: partition switch — BOOT_APP → verify partition B firmware runs; BOOT_OS → back to OS
- [ ] **P5-20** Hardware test: BLE drop — force disconnect, verify reconnect with backoff
- [ ] **P5-21** Log negotiated MTU — if below 200, show warning (OTA will be slow)

---

## Phase 6 — Launch 🔲 NOT STARTED

- [ ] **P6-1** `./gradlew bundleRelease` → `.aab` for Play Store
- [ ] **P6-2** Google Play developer account setup
- [ ] **P6-3** Screenshots (1080×1920) — Board, GPIO, Terminal, Firmware screens
- [ ] **P6-4** Feature graphic (1024×500)
- [ ] **P6-5** Privacy policy GitHub Pages one-pager
- [ ] **P6-6** Play Store listing: short desc, full desc (from kb/market.md UVP)
- [ ] **P6-7** Submit for review
- [ ] **P6-8** GitHub repo: `ESP32EmulatorOS` Arduino library (`#include <ESP32EmulatorOS.h>`)
- [ ] **P6-9** Post r/esp32 — "no USB cable" hook
- [ ] **P6-10** Post r/arduino
- [ ] **P6-11** Hackaday.io project page
- [ ] **P6-12** Arduino Forum → ESP32 section
