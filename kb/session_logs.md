# ESP32 Emulator — Session Logs

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
