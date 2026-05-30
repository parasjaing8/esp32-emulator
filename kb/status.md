# ESP32 Emulator — Project Status
_Last updated: 2026-05-31_

## App Version
`1.0.0` — Phase 0-1 complete. Real BLE wired. ESP32 OS firmware flashed and advertising.

## Stack
Expo SDK ~54 | RN 0.81.5 | React 19 | TypeScript strict

## Market Position (see kb/market.md for full research)
**No existing app combines GPIO control + BLE serial + BLE OTA + partition switch.**
Closest competitor: Bluefruit LE Connect (Adafruit) — locked to Adafruit HW only.
Serial Bluetooth Terminal has 1M+ downloads — proves demand. Gap is wide open.
The dual-partition "OS + app firmware" model has no public precedent.

## UVP
> "Control every pin, open a serial terminal, flash firmware, switch projects — all over Bluetooth. No cloud. No USB cable. No account."

## What's done (as of 2026-05-31)
- [x] Full UI — Board, GPIO, Terminal, Firmware (simulation mode working)
- [x] Phase 0: WaterTank cleanup — deleted Event.ts, database.ts, IDeviceService.ts, NotificationService.ts
- [x] Phase 0: AuthService/CrashReportService storage keys renamed @esp32emu_*
- [x] Phase 0: BLE constants + NimBLEOta UUIDs added to constants/ble.ts
- [x] Phase 1: BLEService.ts rewritten as ESP32BLEService (scan, connect, auth, GPIO, serial)
- [x] Phase 1: DeviceContext wired for real BLE — all actions have real + sim paths
- [x] Phase 1: Auth flow wired — PairingSheet shown on auth needed
- [x] Phase 1: OTA flash via FirmwareUpdateService.performOtaTransfer (real BLE path)
- [x] Firmware: esp32-os.ino compiled and flashed to ESP32-C3 Mini
- [x] Firmware: advertising as ESP32-OS-C5B8, BLE confirmed working
- [x] Firmware: auth (SHA256 salted, session tokens, NVS persistence) ← WaterTank port
- [x] Firmware: GPIO config/write/state (notify), ADC read, serial bridge
- [x] Firmware: NimBLEOta OTA (same protocol as FirmwareUpdateService.ts)
- [x] Firmware: partition control (BOOT_OS / BOOT_APP + restart)
- [x] expo prebuild run, android/ generated
- [x] APK: app-release.apk built (82MB, unsigned debug) ✓
- [x] kb/plan1.md + kb/task1.md created

## What's next

### Phase 2 — Serial + OTA wiring
- [ ] Test real BLE connection on Android phone
- [ ] Verify serial terminal receives real UART0 output
- [ ] Test OTA flash with a real .bin file
- [ ] Test partition switch (Boot App → Boot OS)

### Phase 3 — UI Polish
- [ ] GPIO screen: stronger HIGH glow, gradient ADC bars ← partial done
- [ ] Firmware screen: animated progress bar
- [ ] Terminal: polish
- [ ] `/frontend-design` skill run on key screens

### Phase 4 — Hardware test matrix (task1.md P5-8 through P5-20)
- [ ] Run through full test matrix on ESP32-C3

### Phase 5 — Build & Ship
- [ ] Generate release keystore + sign APK
- [ ] Decide app name (ESP32 Emulator is a misnomer)
- [ ] Play Store listing

## Architecture decisions
- OS partition (A) = always preserved. OTA only writes to partition B.
- CHAR_PARTITION switches boot target. User can always go back to OS.
- Auth model identical to WaterTank (claim/session tokens, SHA256 salted).
- OTA protocol = NimBLEOta (proven 24/26 WaterTank bench tests).
- DeviceContext is single BLE state owner.
- Simulation mode on by default — full app usable without hardware.

## Board
- ESP32-C3 Mini (connected at /dev/cu.usbmodem1101, MAC 90:70:69:c2:c5:b8)
- BLE MAC suffix: C5B8 → advertising as ESP32-OS-C5B8
- Flash firmware: espressif/arduino-esp32 3.3.8, CDCOnBoot=cdc

## Open questions
- Naming: "ESP32 Emulator" is a misnomer. Decide before Play Store launch.
- PWM: expose in v1 or defer? → Defer to v1.1.
- iOS: defer until Android proven.
- Open source the app? → Yes, MIT.
