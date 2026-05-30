# ESP32 Emulator — Project Status
_Last updated: 2026-05-31_

## App Version
`1.0.0` — scaffolding complete, BLE stubs in place

## Stack
Expo SDK ~54 | RN 0.81.5 | React 19 | TypeScript strict

## Market Position (see kb/market.md for full research)
**No existing app combines GPIO control + BLE serial + BLE OTA + partition switch.**
Closest competitor: Bluefruit LE Connect (Adafruit) — locked to Adafruit HW only.
Serial Bluetooth Terminal has 1M+ downloads — proves demand. Gap is wide open.
The dual-partition "OS + app firmware" model has no public precedent.

## UVP
> "Control every pin, open a serial terminal, flash firmware, switch projects — all over Bluetooth. No cloud. No USB cable. No account."

## What's done
- [x] Project scaffold (`expo prebuild` not yet run)
- [x] Tab layout: Board / GPIO / Terminal / Firmware
- [x] `constants/ble.ts` — full OS BLE protocol defined (14 characteristics)
- [x] `constants/gpio.ts` — pin maps for ESP32, ESP32-C3, ESP32-S3, C6, S2
- [x] `constants/theme.ts` — dark theme (same as WaterTank)
- [x] `context/DeviceContext.tsx` — state + stubs for connect/GPIO/serial/OTA/partition
- [x] All 4 tab screens — Board, GPIO, Terminal, Firmware (UI stubs)
- [x] Services copied from WaterTank: BLEService, FirmwareUpdateService, AuthService
- [x] Components copied: DeviceScanSheet, PairingSheet, DeviceSetupModal, ErrorFallback
- [x] CLAUDE.md with full project context
- [x] GitHub repo: https://github.com/parasjaing8/esp32-emulator
- [x] Market research complete — gap confirmed, no direct competitor
- [x] kb/market.md — full competitive landscape, positioning, distribution strategy

## What's next (Phase 1 — Build)
- [ ] Replit UX build (prompted 2026-05-31) — simulation mode + beautiful UI
- [ ] `npm install` / `expo prebuild`
- [ ] Wire real BLE in DeviceContext (read BOARD_INFO, subscribe GPIO_STATE)
- [ ] Adapt BLEService.ts for OS service UUID + new characteristics
- [ ] Implement OTA in flashFirmware() using FirmwareUpdateService pattern
- [ ] ESP32 OS firmware: `firmware/esp32-os/` sketch with all 14 characteristics
- [ ] First APK build + test on real ESP32-C3

## Phase 2 — Go to Market
- [ ] Google Play Store listing (free, no account)
- [ ] Open source Arduino library: "ESP32EmulatorOS" — 1 #include makes any sketch app-compatible
- [ ] Post on r/esp32, r/arduino, Hackaday
- [ ] Consider renaming: "ESP32 Commander" / "BLE Toolbox" / "BoardLink"

## Architecture decisions
- OS partition (A) = always preserved. OTA only writes to partition B.
- CHAR_PARTITION switches boot target. User can always go back to OS.
- Auth model identical to WaterTank (claim/session tokens). Reuses AuthService.ts as-is.
- OTA protocol identical to WaterTank bleOTA (proven 24/26 bench tests). UUID change only.
- DeviceContext is single BLE state owner — no BleManager created outside it.
- Simulation mode on by default — full app usable without hardware.

## Open questions
- Naming: "ESP32 Emulator" is a misnomer. Decide before Play Store launch.
- PWM: expose in v1 or defer? → Defer to v1.1.
- iOS: defer until Android proven. BLE + document picker permissions simpler on Android.
- Open source the app itself? → Yes, MIT license increases community adoption / ecosystem play.
