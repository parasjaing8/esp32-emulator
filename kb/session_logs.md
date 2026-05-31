# ESP32 Emulator — Session Logs

## 2026-05-31 — Bug fix: blank Board screen + setup flow

### What happened
User reported: connected board shows blank Board tab + GPIO says "No board."  
Root cause: three separate bugs.

### Bugs fixed (commit cd0c0d2)
1. **BLEService.completeSetup()** — after firmware responds OK to first-time setup, `_runConnectionSetup()` was never called and the new session token was not stored. `boardInfo` was never set.
2. **Board screen blank state** — `connected && !boardInfo` rendered `null` instead of a spinner. Added `ActivityIndicator` + contextual message ("Enter your board password" vs "Reading board info").
3. **DeviceSetupModal not wired** — `PairingSheet.onSetupRequired` was a no-op comment. Wired it to `setShowSetup(true)`. Added `DeviceSetupModal` with `completeSetup()` callback.

### Build
- `./gradlew assembleRelease` — BUILD SUCCESSFUL 2m, 82MB APK
- `gradlew clean` fails on stale CMake cache (GLOB mismatch after clean) — workaround: skip clean, run assembleRelease directly
- APK: `android/app/build/outputs/apk/release/app-release.apk` (2026-05-31 06:39)

### Emulator validation (partial)
- Board disconnected state ✅
- Scan sheet + SIM device ✅ (location + BLE permissions prompted and granted)
- Board connected — board info, partitions, stats all rendered ✅
- GPIO tab — 15 pins, ADC bars drifting live, OUTPUT HIGH/LOW state ✅
- Pin toggle coordinate mapping issue in emulator driver (adb coordinate scaling) — visual confirmed correct from screenshots

## 2026-05-30 — Project scaffolded

### What was created
- Full project scaffold under `~/dev/apps/esp32-emulator/`
- 4-tab app: Board / GPIO / Terminal / Firmware
- BLE OS protocol defined: 14 characteristics (board info, GPIO, serial, OTA, auth, partition)
- GPIO pin maps for 5 chip variants (ESP32, C3, S3, C6, S2)
- All screens fully coded UI stubs — BLE calls are TODO stubs in DeviceContext
- Services + components copied from WaterTank as reference base

### Key design decisions
- "OS firmware" always stays in partition A — OTA only writes partition B
- Partition B = project firmware (WaterTank, custom, etc.) — switchable at runtime
- Auth model and OTA protocol identical to WaterTank — zero new protocol work needed
- GPIO JSON-over-BLE (not binary packing) for v1 simplicity

### Files created
```
app/_layout.tsx, app/(tabs)/_layout.tsx
app/(tabs)/index.tsx, gpio.tsx, terminal.tsx, firmware.tsx
constants/ble.ts, gpio.ts, theme.ts
context/DeviceContext.tsx
services/ (copied: BLEService, FirmwareUpdateService, AuthService, CrashReportService, NotificationService)
components/ (copied: DeviceScanSheet, PairingSheet, DeviceSetupModal, ErrorFallback)
kb/status.md, kb/session_logs.md
CLAUDE.md, package.json, app.json, tsconfig.json
```

## 2026-05-31 — Market research + Replit prompt

### Research findings
- Deep web search across Play Store, GitHub, Hackaday, Arduino/ESP32 communities
- No existing app combines all 4: GPIO control + BLE serial + BLE OTA + partition switch
- Closest competitor: Bluefruit LE Connect (Adafruit) — locked to Adafruit HW only
- Serial Bluetooth Terminal: 1M+ downloads — proves demand for BLE serial tools
- fbiego ESP32 OTA BLE: 262 GitHub stars — proves demand for local BLE OTA
- The dual-partition "OS firmware + project firmware" model has zero public precedent
- Gap is confirmed wide open. No direct competitor exists.

### Actions taken
- `kb/market.md` created — full competitive landscape table, demand signals, UVP, target segments, distribution strategy, moat analysis
- `kb/status.md` updated — added market position summary, UVP, Phase 2 go-to-market tasks
- Replit prompt written for full UX build (simulation mode + beautiful UI, all 4 tabs)
- GitHub repo created: https://github.com/parasjaing8/esp32-emulator

### What's next
1. `expo prebuild` to generate android/ native code
2. Wire DeviceContext BLE calls (read BOARD_INFO, subscribe GPIO_STATE)
3. Adapt BLEService.ts for the new OS service UUID
4. Write ESP32 OS firmware (`firmware/esp32-os/`)
5. First APK + real hardware test on ESP32-C3

## 2026-05-31 — Phase 0-1 complete, firmware flashed, APK built

### What was done
- Phase 0: Deleted WaterTank artifacts (Event.ts, database.ts, IDeviceService.ts, NotificationService.ts)
- Phase 0: Renamed storage keys @watertank_* → @esp32emu_* in AuthService, CrashReportService
- Phase 0: Added NimBLEOta UUIDs + BLE tuning constants to constants/ble.ts
- Phase 0: Removed reanimated babel plugin (not needed, was blocking Android build)
- Phase 1: Rewrote BLEService.ts as ESP32BLEService — scan, connect, auth handshake, GPIO, serial, OTA, partition
- Phase 1: DeviceContext wired — all 6 actions (setPinMode, writePin, sendSerial, flashFirmware, bootPartition, disconnect) have real BLE + sim paths
- Phase 1: Auth flow wired — PairingSheet shown when real device needs password
- Firmware: esp32-os.ino written (453 lines) — full NimBLE server with auth, GPIO notify, serial bridge, NimBLEOta, partition switch
- Firmware: partitions.csv — dual OTA (ota_0 OS + ota_1 app, 1.9MB each, 4MB flash)
- Firmware: compiled (632KB/1.9MB, 7% RAM), flashed to ESP32-C3 Mini at /dev/cu.usbmodem1101
- Firmware confirmed: BLE advertising as ESP32-OS-C5B8, auth working, boot output seen via serial
- expo prebuild run → android/ directory generated
- APK: assembleRelease succeeded → app-release.apk 82MB (unsigned/debug-signed)
- kb/plan1.md + kb/task1.md created for local LLM execution reference
- TypeScript: zero errors after all changes

### Key decisions
- CDCOnBoot=cdc required for serial monitor on ESP32-C3 built-in USB JTAG
- reanimated removed from babel.config.js (expo-router only uses it in test mocks)
- NimBLEOta used for OTA (same library as WaterTank, proven protocol)
- BLE serial RX: buffer per-newline, notify in MTU-3 byte chunks every 20ms
- OTA watchdog: validates firmware on first boot from OTA image

### What's next
1. Install APK on Android phone, test real BLE connection to ESP32-OS-C5B8
2. Verify GPIO write changes physical pin (LED test)
3. Verify serial terminal shows UART0 output
4. Test OTA flash with WaterTank .bin → partition B → boot app
5. UI polish run on GPIO + firmware screens
6. Generate release keystore, sign APK for Play Store

## 2026-05-31 — Session 2: GPIO flicker fix + full hardware pin verification

### Fixes shipped
- `fix: sim GPIO no longer fights user taps` (v1.1.1) — userSetPins ref, interval 2s→4s, prob 30%→10%

### Hardware test results (BLE + serial readback, board ESP32-OS-C5B8)
All 10 GPIO output pins verified HIGH/LOW via BLE notify. ADC 0–4 all valid. Serial bridge confirmed. Auth OK with board password.
Serial echo timing is flaky (BLE WRITE_NR → UART jitter) — not a hardware issue. All BLE-level checks passed.

### Lessons
- Claimed boards don't advertise on boot — short press BOOT for 60s window
- `./gradlew clean` breaks on stale CMake cache — skip it, run assembleRelease directly
- Serial echo in BLE tests unreliable at 600ms window — need 1.2s+ and GPIO8 (LED_PIN) must be excluded (background blink loop races with test writes)
- Test venv: `python3 -m venv /tmp/esp32test && pip install bleak pyserial`

### Releases
- v1.1.0: blank Board screen fix + DeviceSetupModal wired
- v1.1.1: GPIO flicker fix
