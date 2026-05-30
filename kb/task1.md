# ESP32 Emulator — Atomic Task List

> For local LLM / DeepSeek execution. Work top-to-bottom. Mark each task DONE before moving to next.
> Always read a file before editing it. Never skip a task.

---

## Phase 0 — Cleanup

- [ ] **P0-1** Delete `models/Event.ts`
- [ ] **P0-2** Delete `storage/database.ts`
- [ ] **P0-3** Delete `services/IDeviceService.ts`
- [ ] **P0-4** In `services/AuthService.ts`: replace `@watertank_auth` → `@esp32emu_auth` and `@watertank_preferred_device` → `@esp32emu_preferred_device`
- [ ] **P0-5** In `services/CrashReportService.ts`: replace storage key `@watertank_diag` → `@esp32emu_diag` and fix any "WaterTank" string in export title
- [ ] **P0-6** In `constants/ble.ts`: add exports — `BLE_OTA_SERVICE_UUID`, `BLE_OTA_CHAR_RECV_FW`, `BLE_OTA_CHAR_COMMAND`, `BLE_RECONNECT_DELAYS`, `BLE_SCAN_TIMEOUT`, `BLE_MTU_SIZE` (values in `kb/plan1.md`)
- [ ] **P0-7** Fix any broken imports in files that previously imported from deleted files (search for `Event`, `database`, `IDeviceService`)
- [ ] **P0-8** Run `npm run typecheck` — must pass with zero errors
- [ ] **P0-9** Verify sim mode still works (`npx expo start --web`, open browser, confirm Board/GPIO/Terminal/Firmware screens render without errors)

---

## Phase 1 — BLE Core

### 1a — Rewrite BLEService

- [ ] **P1-1** Read `services/BLEService.ts` in full (WaterTank version) before editing
- [ ] **P1-2** Read `constants/ble.ts` to understand all ESP32 Emulator characteristic UUIDs
- [ ] **P1-3** Create new `services/BLEService.ts` — export `ESP32BLEService` class and `getESP32BleManager()` singleton. Keep file under 500 lines.
- [ ] **P1-4** Implement `getESP32BleManager()` — singleton BleManager instance, platform guard (return null on web)
- [ ] **P1-5** Implement `discoverDevices(timeoutMs)` — scan with null UUID filter (Android BLE quirk), filter results by device name starting with `OS_DEVICE_NAME_PREFIX` ("ESP32-OS"), return array on timeout or stop
- [ ] **P1-6** Implement `connectToDevice(deviceId)` — cancel any pending connection, connect, `requestMTU(512)`, `discoverAllServicesAndCharacteristics()`, register disconnect handler
- [ ] **P1-7** Implement `runAuthHandshake(device)` — read `CHAR_CLAIMED`, if already claimed try stored session token (from AuthService), if rejected prompt password via callback, on success store new token via AuthService. Port logic from WaterTank `BLEService.ts`.
- [ ] **P1-8** Implement `runConnectionSetup(device)` — after auth OK: read `CHAR_BOARD_INFO` (JSON parse), subscribe `CHAR_GPIO_STATE` notify, emit initial state to listeners
- [ ] **P1-9** Implement `writeGpioConfig(deviceId, pin, mode)` — write `{"pin":N,"mode":"OUTPUT"|"INPUT"}` JSON to `CHAR_GPIO_CONFIG`
- [ ] **P1-10** Implement `writeGpioPin(deviceId, pin, value)` — write `{"pin":N,"value":0|1}` JSON to `CHAR_GPIO_WRITE` using writeWithoutResponse
- [ ] **P1-11** Implement `scheduleReconnect(deviceId)` — exponential backoff reconnect using `BLE_RECONNECT_DELAYS`, cancel on explicit disconnect
- [ ] **P1-12** Implement `disconnect(deviceId)` — cancel reconnect, call `device.cancelConnection()`, cleanup subscriptions
- [ ] **P1-13** Export state callback types: `ESP32DeviceState` (boardInfo, pinStates, connected, etc.)
- [ ] **P1-14** Run `npm run typecheck` — BLEService must compile clean

### 1b — Wire DeviceContext

- [ ] **P1-15** Read `context/DeviceContext.tsx` in full before editing
- [ ] **P1-16** Add `esp32Service` ref (`useRef<ESP32BLEService>`) inside `DeviceProvider`, instantiate on mount
- [ ] **P1-17** In `scanForDevices()`: add real-path branch — call `esp32Service.current.discoverDevices(BLE_SCAN_TIMEOUT)` when not in sim mode. Keep existing sim path (`[SIM_DEVICE]`) untouched.
- [ ] **P1-18** In `connectToDevice(device)`: add real-path branch — call `esp32Service.current.connectToDevice(device.id)`, subscribe to state events (`boardInfo`, `pinStates`, `appPartition`)
- [ ] **P1-19** In `setPinMode(pin, mode)`: add real-path branch — call `esp32Service.current.writeGpioConfig(deviceId, pin, mode)`
- [ ] **P1-20** In `writePin(pin, value)`: add real-path branch — call `esp32Service.current.writeGpioPin(deviceId, pin, value)`
- [ ] **P1-21** Add Android BLE runtime permission request (`BLUETOOTH_SCAN` + `BLUETOOTH_CONNECT`) before first scan — use `PermissionsAndroid.requestMultiple()`
- [ ] **P1-22** Run `npm run typecheck` — must pass
- [ ] **P1-23** Test sim mode still works end-to-end in browser

---

## Phase 2 — Serial Terminal + OTA

### 2a — Serial

- [ ] **P2-1** In `services/BLEService.ts`: add `subscribeSerialRx(deviceId, cb)` — monitor `CHAR_SERIAL_RX` notify, buffer incoming bytes, split on `\n`, emit complete lines via `cb`
- [ ] **P2-2** In `services/BLEService.ts`: add `sendSerialTx(deviceId, text)` — write UTF-8 encoded text to `CHAR_SERIAL_TX` write-without-response
- [ ] **P2-3** In `context/DeviceContext.tsx`: wire `sendSerial(text)` real-path — call `esp32Service.current.sendSerialTx(deviceId, text)`
- [ ] **P2-4** In `context/DeviceContext.tsx`: subscribe `CHAR_SERIAL_RX` on connection (call `subscribeSerialRx`), append lines to `serialLines` state (cap at 300), unsubscribe on disconnect

### 2b — OTA Flash

- [ ] **P2-5** Read `services/FirmwareUpdateService.ts` in full — understand `performOtaTransfer` signature and what it expects
- [ ] **P2-6** In `context/DeviceContext.tsx`: wire `flashFirmware(uri, name, sizeKb)` real-path:
  - Read file bytes: `FileSystem.readAsStringAsync(uri, { encoding: 'base64' })` → decode to `Uint8Array`
  - Call `performOtaTransfer(bytes, connectedDeviceId, onProgress, abortSignal)`
  - Pipe `onProgress(pct)` → `setOtaProgress(pct)`
  - On success: append to `flashHistory`, `setOtaProgress(null)`
- [ ] **P2-7** In `context/DeviceContext.tsx`: wire `bootPartition(target)` real-path — write `{ cmd: "BOOT_OS" | "BOOT_APP" }` JSON to `CHAR_PARTITION` via `esp32Service.current` (use `writeCharacteristicWithResponseForService`)
- [ ] **P2-8** Run `npm run typecheck` — must pass

---

## Phase 3 — UI Polish

- [ ] **P3-1** Invoke `/frontend-design` skill on `app/(tabs)/gpio.tsx` — target: HIGH pin green glow, gradient ADC bars, tighter 3-column layout option for boards with 20+ pins
- [ ] **P3-2** Invoke `/frontend-design` skill on `app/(tabs)/firmware.tsx` — target: pulsing OTA progress bar during transfer, slide-in animation for flash history items
- [ ] **P3-3** Invoke `/frontend-design` skill on `app/(tabs)/index.tsx` — target: animated connection status indicator, partition fill bars with gradient
- [ ] **P3-4** Invoke `/frontend-design` skill on `app/(tabs)/terminal.tsx` — target: new lines slide in from bottom, subtle CRT scanline texture on log area
- [ ] **P3-5** Invoke `/frontend-design` skill on `components/DeviceScanSheet.tsx` — target: vivid RSSI signal bar indicator
- [ ] **P3-6** Verify all color changes are in `constants/theme.ts` or `constants/colors.ts` — no hardcoded hex values in screen files
- [ ] **P3-7** Run `npm run typecheck` — must pass
- [ ] **P3-8** Run in web sim mode, verify all 4 screens render with new styles

---

## Phase 4 — ESP32 OS Firmware

- [ ] **P4-1** Create directory `firmware/esp32-os/`
- [ ] **P4-2** Create `firmware/esp32-os/partitions.csv` with dual OTA partition table (values in `kb/plan1.md`)
- [ ] **P4-3** Read WaterTank firmware at `../watertank-replit-build/` to understand auth/session pattern before writing
- [ ] **P4-4** Create `firmware/esp32-os/esp32_os.ino` — scaffold: includes, global vars, `setup()`, `loop()`
- [ ] **P4-5** Add NimBLE server init in `setup()` — advertise as `ESP32-OS-<last4MAC>`, set MTU 512
- [ ] **P4-6** Port auth characteristics from WaterTank: `AuthCB`, `SetupCB`, `VisibilityCB`, `ClaimedCB`, `SessionCB` — copy callback class structure verbatim, change nothing except UUIDs (use values from `constants/ble.ts`)
- [ ] **P4-7** Port NVS helpers verbatim: `nvsLoadAuth`, `nvsWriteAuth`, `sessionFind`, `sessionAdd`, `sessionsClearAll`, `genToken`, `sha256hex`
- [ ] **P4-8** Implement `CHAR_BOARD_INFO` READ handler — return JSON with chip, MAC, flash_mb, fw_version, app_partition (use `esp_ota_get_running_partition()`)
- [ ] **P4-9** Implement `CHAR_GPIO_CONFIG` WRITE handler — parse JSON, call `pinMode()`, store mode in `gpioMode[]` array
- [ ] **P4-10** Implement `CHAR_GPIO_WRITE` WRITE handler — parse JSON, `digitalWrite()`, update `gpioState[]`, trigger GPIO_STATE notify
- [ ] **P4-11** Implement `CHAR_GPIO_STATE` READ + NOTIFY — return current `gpioState[]` as JSON. In `loop()`: poll INPUT pins every 100ms, notify on change.
- [ ] **P4-12** Implement `CHAR_ADC_READ` — WRITE sets target pin, READ returns `analogRead(pin)` as uint16 LE bytes
- [ ] **P4-13** Implement `CHAR_SERIAL_TX` WRITE — `Serial.write(data, len)`
- [ ] **P4-14** Implement `CHAR_SERIAL_RX` NOTIFY — in `loop()`: if `Serial.available()`, read up to `(MTU-3)` bytes every 20ms, notify
- [ ] **P4-15** Implement `CHAR_PARTITION` WRITE — parse `{"cmd":"BOOT_APP"|"BOOT_OS"}`, call `esp_ota_set_boot_partition()` + `esp_restart()`. READ returns active partition JSON.
- [ ] **P4-16** Add NimBLEOta init in `setup()` — call `bleOta.begin(&bleServer)`. OTA data transfer is fully handled by NimBLEOta library.
- [ ] **P4-17** Add OTA watchdog: on first boot from new OTA image, if `esp_ota_mark_app_valid_cancel_rollback()` not called within 10s → rollback
- [ ] **P4-18** Add `firmware/esp32-os/README.md` — build instructions (Arduino IDE, board: ESP32-C3, partition scheme: custom CSV, libraries needed)
- [ ] **P4-19** Compile test in Arduino IDE for ESP32-C3 — must compile with zero errors

---

## Phase 5 — Build + Hardware Test

- [ ] **P5-1** Decide final app name and update `app.json` (`name`, `slug`) — `android.package` cannot change post-submission
- [ ] **P5-2** Run `npm install`
- [ ] **P5-3** Run `expo prebuild --platform android` — verify `android/` directory generated
- [ ] **P5-4** Run `cd android && ./gradlew clean`
- [ ] **P5-5** Generate release keystore: `keytool -genkey -v -keystore esp32-emulator-release.keystore -alias esp32emu -keyalg RSA -keysize 2048 -validity 10000`
- [ ] **P5-6** Add `signingConfigs` block to `android/app/build.gradle` pointing to keystore
- [ ] **P5-7** Run `./gradlew assembleRelease` — APK at `android/app/build/outputs/apk/release/`
- [ ] **P5-8** Flash ESP32 OS firmware to ESP32-C3 via USB (one-time bootstrap)
- [ ] **P5-9** Hardware test: scan + connect, verify board info shows real chip/MAC
- [ ] **P5-10** Hardware test: auth with default password "1234", verify session token persists after reconnect
- [ ] **P5-11** Hardware test: set GPIO5 to OUTPUT, toggle HIGH/LOW, verify physical pin changes with multimeter/LED
- [ ] **P5-12** Hardware test: set GPIO5 to INPUT, press button, verify GPIO_STATE notify updates in app
- [ ] **P5-13** Hardware test: ADC — connect potentiometer to GPIO4, verify value changes in app
- [ ] **P5-14** Hardware test: serial RX — `Serial.println("hello")` in firmware loop, verify text appears in terminal screen
- [ ] **P5-15** Hardware test: serial TX — type command in app, verify on Serial Monitor
- [ ] **P5-16** Hardware test: OTA — flash small .bin (~100KB), verify progress bar, verify board reboots to partition B
- [ ] **P5-17** Hardware test: OTA — flash large .bin (~1MB), verify completes successfully
- [ ] **P5-18** Hardware test: partition switch — boot to App, verify partition B firmware runs; boot back to OS, verify OS firmware
- [ ] **P5-19** Hardware test: BLE drop — force disconnect, verify reconnect with backoff
- [ ] **P5-20** Log negotiated MTU — if below 200, show warning in app (OTA will be very slow)

---

## Phase 6 — Launch

- [ ] **P6-1** Run `./gradlew bundleRelease` — generate `.aab` for Play Store (required for new app submissions)
- [ ] **P6-2** Create Google Play developer account if not exists
- [ ] **P6-3** Take 2+ Play Store screenshots (1080×1920) of Board, GPIO, Terminal, Firmware screens
- [ ] **P6-4** Create feature graphic (1024×500)
- [ ] **P6-5** Create privacy policy page (GitHub Pages one-pager — app collects no user data)
- [ ] **P6-6** Fill Play Store listing: short desc, full desc (use UVP from `kb/market.md`), content rating
- [ ] **P6-7** Submit for review
- [ ] **P6-8** Create separate GitHub repo for Arduino library `ESP32EmulatorOS` — extract CHAR definitions and auth scaffold into installable library
- [ ] **P6-9** Post on r/esp32 with "no USB cable" hook
- [ ] **P6-10** Post on r/arduino
- [ ] **P6-11** Create Hackaday.io project page
- [ ] **P6-12** Post on Arduino Forum → ESP32 board section
