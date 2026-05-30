# ESP32 Emulator — Claude Code Instructions

## What this is
Android app that connects to any ESP32 board over BLE and provides:
- Live GPIO read/write dashboard (all pins)
- BLE serial terminal (UART0 passthrough)
- OTA firmware flash (app partition only — OS partition always preserved)
- Partition switcher (OS firmware ↔ project firmware)

The ESP32 runs a "OS firmware" in partition A that exposes all BLE characteristics.
Project firmware (WaterTank, custom sketches, etc.) lives in partition B.
Think: ESP32 OS firmware = Windows, project firmware = installed app.

## Model Routing

### Always Claude (Sonnet/Opus)
- `context/DeviceContext.tsx` — BLE state machine
- `services/BLEService.ts` — BLE API, easy to hallucinate methods
- `services/FirmwareUpdateService.ts` — OTA protocol, binary handling
- `firmware/esp32-os/` — NimBLE 2.x API subtleties
- Any change touching 3+ files

### Local model OK
- Screen UI additions (isolated, known component props)
- `constants/gpio.ts` — pin map data entry
- `constants/theme.ts` — color changes
- Tests, translations

## Stack
- Expo SDK ~54 / React Native 0.81.5 / React 19
- expo-router (file-based routing)
- react-native-ble-plx — BLE
- expo-document-picker + expo-file-system — firmware .bin loading
- TypeScript strict mode

## Build Protocol
- Android release: `expo prebuild` → `cd android && ./gradlew clean && ./gradlew assembleRelease`
- Never use `eas build`
- APK at `android/app/build/outputs/apk/release/app-release.apk`

## Commit Protocol
Commit → push → append `kb/session_logs.md` → update `kb/status.md`. Never batch.

## BLE Protocol
Full spec in `constants/ble.ts`. Service UUID: `e32f0001-b5a3-f393-e0a9-e50e24dcca9e`.
Auth model identical to WaterTank (claim/session tokens, same firmware pattern).
OTA protocol identical to WaterTank bleOTA branch (proven 24/26 bench tests).

## Key Invariants
- OS partition (A) is NEVER overwritten by the OTA flash flow in this app
- Only CHAR_OTA_DATA writes go to partition B (app slot)
- CHAR_PARTITION controls which partition boots on next reset
- `DeviceContext.tsx` is the single source of truth for all device state — no BleManager instances outside it

## Reference Projects
- WaterTank BLE auth: `../watertank-replit-build/services/AuthService.ts`
- WaterTank OTA: `../watertank-replit-build/services/FirmwareUpdateService.ts`
- WaterTank BLE: `../watertank-replit-build/services/BLEService.ts`
- BLE OTA protocol spec: `../watertank-replit-build/kb/ble_ota.md`

## Development Status
See `kb/status.md` for current build/feature status.
