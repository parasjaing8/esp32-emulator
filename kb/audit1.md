# FlashLink — Audit 1 (Sonnet 4.6, 2026-06-01)

## Scope
`services/BLEService.ts`, `services/FirmwareUpdateService.ts`, `services/AuthService.ts`,
`context/DeviceContext.tsx`, `constants/ble.ts`, `constants/gpio.ts`,
`app/(tabs)/firmware.tsx`, `app/(tabs)/gpio.tsx`, `app/(tabs)/index.tsx`

---

## CRITICAL

### C1 — OTA progress UI stuck on failure
**File:** `context/DeviceContext.tsx` — `flashFirmware` callback
**Problem:** If `performOtaTransfer()` throws (sector rejected, BLE timeout, disconnect),
the exception propagates up uncaught. `setOtaProgress(null)` is never called.
The progress bar stays frozen at whatever % it was. Flash button stays permanently disabled.
`firmware.tsx` `confirmFlash` also has no try/catch, so `setFlashDone(true)` never fires.
**Impact:** App requires force-kill to recover after any OTA failure.

### C2 — `dismissAuth` leaves orphaned BLE connection
**File:** `context/DeviceContext.tsx` — `dismissAuth` callback
**Problem:** `dismissAuth` only calls `setAuthNeeded(null)`. But at that point, the BLE service
is physically connected (`this.device` is set in BLEService), `connected` state is true,
and `simMode` is false. If the user dismisses auth and tries to reconnect, `connectToDevice`
calls `bleService.connect()` → `_doConnect()` on a new device without first cleaning up
the old live connection. The old `disconnectSub` subscription is still registered and will
fire unexpectedly.
**Impact:** Ghost BLE subscriptions, unpredictable disconnect events on next session.

### C3 — Wrong GitHub repo in `FirmwareUpdateService`
**File:** `services/FirmwareUpdateService.ts` line 10
**Problem:** `GITHUB_RELEASES_API` points to `parasjaing8/watertank-replit-build` — the WaterTank repo.
FlashLink will never have `fw-v*` tags there. `checkFirmwareUpdate()` always returns null.
Also, `checkFirmwareUpdate` and `downloadFirmware` are never called from any screen — the Firmware
screen has no "Check for OS Update" button. These are completely dead.
**Impact:** OTA update check feature is broken and points to wrong repo.

---

## HIGH

### H1 — ESP32-C3 USB pins (GPIO18/19) show as OUTPUT-capable
**File:** `constants/gpio.ts` lines for GPIO18 and GPIO19 on ESP32-C3
**Problem:** Both have `modes: INPUT_OUTPUT` which includes OUTPUT and PWM. The `plan1.md`
explicitly notes "refuse OUTPUT mode in firmware for GPIO18/19." But the UI lets users
select OUTPUT mode — the write goes to firmware (which may or may not block it) but the
UI gives no warning.
**Impact:** User can unknowingly try to drive USB data lines. `systemNote: 'USB D-/D+'` exists
but is only shown as a small label, not a guard.

### H2 — `bootPartition` updates UI optimistically before board confirms
**File:** `context/DeviceContext.tsx` — `bootPartition` callback
**Problem:** `setAppPartition(target)` and `setBoardInfo()` fire synchronously before the BLE
write even completes. If `bleService.bootPartition()` fails silently (the `.catch` only
`addRxLine`s the error), the UI shows the wrong active partition.
**Impact:** UI can display "RUNNING" badge on wrong partition after a BLE error.

### H3 — `_onAuthSuccess` reads `CHAR_BOARD_INFO` twice in one connection flow
**File:** `services/BLEService.ts` — `_onAuthSuccess` and `_runConnectionSetup`
**Problem:** `_onAuthSuccess` reads `CHAR_BOARD_INFO` to extract chip name for session storage.
Then immediately calls `_runConnectionSetup()` which reads `CHAR_BOARD_INFO` again to emit
to `onBoardInfo`. Two sequential reads of the same characteristic. On slow BLE links this
adds ~200-400ms to connection time unnecessarily.
**Impact:** Slower post-auth connection setup. Redundant BLE traffic.

---

## MEDIUM

### M1 — Dead OTA constants (`CHAR_OTA_CTRL`, `CHAR_OTA_DATA`)
**File:** `constants/ble.ts` lines for CHAR_OTA_CTRL and CHAR_OTA_DATA
**Problem:** These two UUIDs (e32f000a, e32f000b) describe a custom OTA protocol but are never
imported or used anywhere. The actual OTA uses NimBLEOta via `BLE_OTA_SERVICE_UUID` (00008018...).
**Impact:** Dead code that misleads future developers about which OTA protocol is in use.
The firmware also likely doesn't implement these custom OTA chars.

### M2 — `buildInitialPinModes` called twice in `onBoardInfo`
**File:** `context/DeviceContext.tsx` — `onBoardInfo` callback inside `connectToDevice`
**Problem:**
```ts
setPinModes(buildInitialPinModes(info.pins));
setPinStates(buildInitialPinStates(info.pins, buildInitialPinModes(info.pins)));
//                                             ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^ second call
```
`buildInitialPinModes` is called a second time as an argument. Both calls return the same result
(deterministic), but it's wasteful and the idiom implies the two state updates could diverge.
**Impact:** Minor — no bug, but code smell.

### M3 — Session stored with chip name instead of device name
**File:** `services/BLEService.ts` — `_onAuthSuccess`
**Problem:** When storing a session after password auth, the "device name" stored is `info.chip`
(e.g. "ESP32-C3") instead of a user-meaningful name. `completeSetup` correctly stores the
user-provided device name, but re-auth after a token expiry falls back to chip name.
**Impact:** `AuthService.listSessions()` shows "ESP32-C3" not "Kitchen Controller" in any session UI.

### M4 — `npm test` is broken
**File:** `package.json`
**Problem:** `"test": "jest"` script is defined but there is no jest config, no `@types/jest` in
devDependencies, and no test files in the repo. `npm test` exits with error immediately.
**Impact:** CI or contributors running `npm test` get a broken command.

### M5 — `CrashReportService` docstring says "WaterTank app"
**File:** `services/CrashReportService.ts` line 3
**Problem:** `* CrashReportService — structured diagnostic log for WaterTank app.`
Should say FlashLink.
**Impact:** Minor — cosmetic stale copy.

### M6 — `pinModes` not updated from real BLE pin state notifications
**File:** `context/DeviceContext.tsx` — `onPinStates` callback
**Problem:** `onPinStates` only updates `pinStates` (HIGH/LOW values) but not `pinModes`.
If a pin mode is changed from another source (another paired phone, serial command),
the app's `pinModes` state drifts from reality.
**Impact:** GPIO UI can show wrong mode for a pin that was reconfigured externally.

---

## LOW

### L1 — File picker accepts all file types then post-checks `.bin` extension
**File:** `app/(tabs)/firmware.tsx` — `pickFile` function
**Problem:** `DocumentPicker.getDocumentAsync({ type: '*/*' })` shows all files. Only after
selection does it check `f.name.endsWith('.bin')` and show an alert. Should filter at picker level.
**Impact:** Poor UX — user browses all files, selects something, gets rejected.

### L2 — `CHAR_ADC_READ` defined but ADC never read via real BLE
**File:** `constants/ble.ts` and `services/BLEService.ts`
**Problem:** `CHAR_ADC_READ` UUID is defined in ble.ts but BLEService has no `readAdcPin()` method.
ADC values only exist in simulation mode. Real BLE connection shows no ADC data.
**Impact:** ADC tab/mode is non-functional on real hardware.

### L3 — `OS_DEVICE_NAME_PREFIX` predates FlashLink brand
**File:** `constants/ble.ts`
**Problem:** `OS_DEVICE_NAME_PREFIX = 'ESP32-OS'` — the firmware advertises as `ESP32-OS-C5B8`.
This is the firmware's BLE advertising name, not the app name, so it's somewhat independent.
But if the firmware is updated, should consider `FL-` or `FlashLink-` prefix for clarity.
**Impact:** Cosmetic — only matters for branding consistency.

---

## Summary

| Severity | Count | Key Risk |
|---|---|---|
| CRITICAL | 3 | OTA UI freeze, orphaned BLE on auth dismiss, wrong OTA repo |
| HIGH | 3 | USB pin guard, partition UI optimism, double BLE read |
| MEDIUM | 6 | Dead constants, test breakage, stale docs, pin mode drift |
| LOW | 3 | UX nits, missing ADC BLE impl |

**Total: 15 findings**

Nothing here bricks hardware. The critical OTA repo issue (C3) breaks a future feature
but doesn't affect current functionality (no update check UI exists yet).
The most immediately harmful is C1 (OTA UI freeze on failure) — first real flash attempt
that fails will leave the app in a broken state requiring force-kill.
