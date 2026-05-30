# ESP32 Emulator — Project Status
_Created: 2026-05-30_

## App Version
`1.0.0` — scaffolding complete, BLE stubs in place

## Stack
Expo SDK ~54 | RN 0.81.5 | React 19 | TypeScript strict

## What's done
- [x] Project scaffold (`expo prebuild` not yet run)
- [x] Tab layout: Board / GPIO / Terminal / Firmware
- [x] `constants/ble.ts` — full OS BLE protocol defined (14 characteristics)
- [x] `constants/gpio.ts` — pin maps for ESP32, ESP32-C3, ESP32-S3, C6, S2
- [x] `constants/theme.ts` — dark theme (same as WaterTank)
- [x] `context/DeviceContext.tsx` — state + stubs for connect/GPIO/serial/OTA/partition
- [x] `app/(tabs)/index.tsx` — Board info card + partition status
- [x] `app/(tabs)/gpio.tsx` — GPIO grid with toggle buttons
- [x] `app/(tabs)/terminal.tsx` — Serial terminal UI
- [x] `app/(tabs)/firmware.tsx` — Firmware picker + OTA flash UI + partition switcher
- [x] Services copied from WaterTank: BLEService, FirmwareUpdateService, AuthService
- [x] Components copied: DeviceScanSheet, PairingSheet, DeviceSetupModal, ErrorFallback
- [x] CLAUDE.md with full project context

## What's next (Phase 1)
- [ ] `npm install` / `expo prebuild`
- [ ] Wire real BLE in DeviceContext (read BOARD_INFO, subscribe GPIO_STATE)
- [ ] Adapt BLEService.ts for OS service UUID + new characteristics
- [ ] Implement OTA in flashFirmware() using FirmwareUpdateService pattern
- [ ] ESP32 OS firmware: `firmware/esp32-os/` sketch with all 14 characteristics
- [ ] First APK build + test on real ESP32-C3

## Architecture decisions
- OS partition (A) = always preserved. OTA only writes to partition B.
- CHAR_PARTITION switches boot target. Lets user go back to OS at any time.
- Auth model identical to WaterTank (claim/session tokens). Reuses AuthService.ts as-is.
- OTA protocol identical to WaterTank bleOTA (proven 24/26 bench tests). Minor UUID change only.
- DeviceContext is single BLE state owner — no BleManager created outside it.

## Open questions
- Should OS firmware auto-detect chip and return correct pin map, or hardcode per device?
  → Auto-detect via `esp_chip_info()` in firmware, return in CHAR_BOARD_INFO JSON.
- PWM: expose in v1 or defer?
  → Defer to v1.1 — GPIO read/write covers the primary use case.
