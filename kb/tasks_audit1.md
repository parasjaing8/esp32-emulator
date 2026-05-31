# FlashLink — Task List (from audit1.md)

Execute in order. Each task is self-contained. Read the referenced file before editing.
After each task: commit → push → append session_logs.md → update status.md.

---

## TASK-001 — Fix OTA failure leaving progress UI frozen [CRITICAL C1]

**Files to edit:** `context/DeviceContext.tsx`

**What:** Wrap the real-BLE OTA path in `flashFirmware` with try/catch/finally.

**Exact change in `flashFirmware`:**
```ts
// BEFORE:
} else {
  const deviceId = getEsp32BleService().connectedDeviceId;
  if (!deviceId) throw new Error('Not connected');
  const b64 = await FileSystem.readAsStringAsync(uri, { encoding: 'base64' });
  const bytes = new Uint8Array(Buffer.from(b64, 'base64'));
  await performOtaTransfer(bytes, deviceId, (done, total) => {
    setOtaProgress(Math.round((done / total) * 100));
  });
  addRxLine('OTA DONE — board rebooting');
}
setFlashHistory((h) => [{ name, sizeKb, date: Date.now() }, ...h].slice(0, 5));
setOtaProgress(null);

// AFTER:
} else {
  const deviceId = getEsp32BleService().connectedDeviceId;
  if (!deviceId) throw new Error('Not connected');
  try {
    const b64 = await FileSystem.readAsStringAsync(uri, { encoding: 'base64' });
    const bytes = new Uint8Array(Buffer.from(b64, 'base64'));
    await performOtaTransfer(bytes, deviceId, (done, total) => {
      setOtaProgress(Math.round((done / total) * 100));
    });
    addRxLine('OTA DONE — board rebooting');
    setFlashHistory((h) => [{ name, sizeKb, date: Date.now() }, ...h].slice(0, 5));
  } catch (err) {
    addRxLine(`OTA FAILED: ${err instanceof Error ? err.message : String(err)}`);
    throw err;
  } finally {
    setOtaProgress(null);
  }
  return;
}
// remove the setFlashHistory and setOtaProgress lines that were after the if/else
```

Also wrap `confirmFlash` in `firmware.tsx`:
```ts
// BEFORE:
onPress: async () => {
  setStartTime(Date.now()); setElapsed(0); setFlashDone(false);
  await flashFirmware(selected.uri, selected.name, Math.round(selected.size / 1024));
  setFlashDone(true);
},

// AFTER:
onPress: async () => {
  setStartTime(Date.now()); setElapsed(0); setFlashDone(false);
  try {
    await flashFirmware(selected.uri, selected.name, Math.round(selected.size / 1024));
    setFlashDone(true);
  } catch (err) {
    Alert.alert('Flash Failed', err instanceof Error ? err.message : 'OTA transfer failed. Try again.');
  }
},
```

**Done when:** TypeScript compiles. OTA failure shows an Alert and clears the progress bar.

---

## TASK-002 — Fix `dismissAuth` leaving orphaned BLE connection [CRITICAL C2]

**File to edit:** `context/DeviceContext.tsx`

**What:** `dismissAuth` must call `disconnect()` so the BLE service is cleaned up.

**Exact change:**
```ts
// BEFORE:
const dismissAuth = useCallback(() => setAuthNeeded(null), []);

// AFTER:
const dismissAuth = useCallback(() => {
  setAuthNeeded(null);
  // If we're connected (BLE handshake happened) but have no boardInfo yet,
  // the BLE service is live but setup is incomplete — clean up fully.
  if (!simMode) {
    getEsp32BleService().disconnect();
  }
  setConnected(false);
  setBoardInfo(null);
  setSimMode(true);
}, [simMode]);
```

**Done when:** TypeScript compiles. Dismissing the auth/pairing sheet leaves the app in a clean disconnected state.

---

## TASK-003 — Fix wrong GitHub repo in FirmwareUpdateService [CRITICAL C3]

**File to edit:** `services/FirmwareUpdateService.ts`

**What:** Update `GITHUB_RELEASES_API` to point to the FlashLink repo. Add a comment explaining
the expected release tag format.

**Exact change:**
```ts
// BEFORE:
const GITHUB_RELEASES_API =
  "https://api.github.com/repos/parasjaing8/watertank-replit-build/releases/latest";

// AFTER:
// Expects GitHub releases tagged "fw-v1.2.3" with a manifest.json asset.
const GITHUB_RELEASES_API =
  "https://api.github.com/repos/parasjaing8/esp32-emulator/releases/latest";
```

**Done when:** File compiles. String is updated.

---

## TASK-004 — Guard ESP32-C3 USB pins against OUTPUT mode [HIGH H1]

**File to edit:** `constants/gpio.ts`

**What:** For ESP32-C3 GPIO18 and GPIO19, replace `INPUT_OUTPUT` modes with a restricted
set that excludes OUTPUT and PWM. Add a stronger `systemNote`.

**Exact change:**
```ts
// BEFORE:
{ gpio: 18, label: 'GPIO18', modes: INPUT_OUTPUT, defaultMode: 'INPUT', systemNote: 'USB D-' },
{ gpio: 19, label: 'GPIO19', modes: INPUT_OUTPUT, defaultMode: 'INPUT', systemNote: 'USB D+' },

// AFTER:
{ gpio: 18, label: 'GPIO18', modes: INPUT_ONLY, defaultMode: 'INPUT', systemNote: 'USB D- — OUTPUT unsafe' },
{ gpio: 19, label: 'GPIO19', modes: INPUT_ONLY, defaultMode: 'INPUT', systemNote: 'USB D+ — OUTPUT unsafe' },
```

`INPUT_ONLY` is already defined as `['INPUT', 'INPUT_PULLUP', 'INPUT_PULLDOWN']` at the top of the file.

**Done when:** TypeScript compiles. GPIO18/19 on C3 no longer offer OUTPUT or PWM modes in the mode picker.

---

## TASK-005 — Fix `bootPartition` optimistic UI update [HIGH H2]

**File to edit:** `context/DeviceContext.tsx`

**What:** Remove the optimistic `setAppPartition` / `setBoardInfo` calls. Let the board reconnect
after reboot and update partition state via `onBoardInfo`. Only update the serial log immediately.

**Exact change:**
```ts
// BEFORE:
const bootPartition = useCallback((target: 'os' | 'app') => {
  setAppPartition(target);
  setBoardInfo((b) => b ? { ...b, app_partition: target } : b);
  addRxLine(`Rebooting to ${target.toUpperCase()} partition…`);
  if (!simMode) {
    getEsp32BleService().bootPartition(target).catch((e) => addRxLine(`ERR: ${e}`));
  }
}, [addRxLine, simMode]);

// AFTER:
const bootPartition = useCallback((target: 'os' | 'app') => {
  addRxLine(`Rebooting to ${target.toUpperCase()} partition…`);
  if (simMode) {
    // Sim: update immediately since there's no real reboot
    setAppPartition(target);
    setBoardInfo((b) => b ? { ...b, app_partition: target } : b);
  } else {
    getEsp32BleService().bootPartition(target).catch((e) => addRxLine(`ERR: ${e}`));
    // Real board will disconnect, reboot, reconnect — onBoardInfo will update appPartition
  }
}, [addRxLine, simMode]);
```

**Done when:** TypeScript compiles. Real BLE partition switch no longer updates UI until board reconnects.

---

## TASK-006 — Eliminate double `CHAR_BOARD_INFO` read in auth flow [HIGH H3]

**File to edit:** `services/BLEService.ts`

**What:** In `_onAuthSuccess`, pass the chip name from CHAR_BOARD_INFO read to avoid reading it
again in `_runConnectionSetup`. Or simpler: don't read CHAR_BOARD_INFO in `_onAuthSuccess` at all
— just use a placeholder name for the session, and let `_runConnectionSetup` populate the real name.
The session can be updated after setup completes.

**Exact change — remove the BOARD_INFO read from `_onAuthSuccess`:**
```ts
// BEFORE in _onAuthSuccess:
const sessChar = await this.device.readCharacteristicForService(OS_SERVICE_UUID, CHAR_SESSION);
if (sessChar?.value) {
  const token = Buffer.from(sessChar.value, 'base64');
  const deviceNameChar = await this.device.readCharacteristicForService(OS_SERVICE_UUID, CHAR_BOARD_INFO).catch(() => null);
  let name = 'ESP32-OS';
  if (deviceNameChar?.value) {
    try {
      const info = JSON.parse(Buffer.from(deviceNameChar.value, 'base64').toString('utf8'));
      name = info.chip ?? 'ESP32-OS';
    } catch { }
  }
  await AuthService.storeSession(deviceId, token, name);
  await AuthService.setPreferredDevice(deviceId);
}

// AFTER in _onAuthSuccess:
const sessChar = await this.device.readCharacteristicForService(OS_SERVICE_UUID, CHAR_SESSION);
if (sessChar?.value) {
  const token = Buffer.from(sessChar.value, 'base64');
  // Store with placeholder name — _runConnectionSetup will read BOARD_INFO and can update
  await AuthService.storeSession(deviceId, token, 'FlashLink Device');
  await AuthService.setPreferredDevice(deviceId);
}
```

Then in `_runConnectionSetup`, after parsing boardInfo, update the stored session name:
```ts
// After emitting onBoardInfo:
const storedSession = await AuthService.getSession(deviceId);
if (storedSession && storedSession.deviceName === 'FlashLink Device') {
  const better = `${raw.chip ?? 'ESP32'} ${String(raw.mac ?? '').slice(-5)}`;
  await AuthService.storeSession(deviceId, Buffer.from(storedSession.token, 'hex'), better);
}
```

**Done when:** TypeScript compiles. Only one CHAR_BOARD_INFO read per connection flow.

---

## TASK-007 — Remove dead OTA constants from ble.ts [MEDIUM M1]

**File to edit:** `constants/ble.ts`

**What:** Delete `CHAR_OTA_CTRL` and `CHAR_OTA_DATA` (e32f000a and e32f000b). These are not
used anywhere — the actual OTA uses NimBLEOta via `BLE_OTA_SERVICE_UUID`. Add a comment
clarifying which OTA system is in use.

**Exact change:**
```ts
// DELETE these two lines entirely:
export const CHAR_OTA_CTRL     = 'e32f000a-b5a3-f393-e0a9-e50e24dcca9e'; // WRITE + NOTIFY
// Write: JSON { cmd: "START", size, sha256 } | { cmd: "ABORT" }
// Notify: JSON { status: "READY" | "PROGRESS" | "DONE" | "ERROR", pct? }

export const CHAR_OTA_DATA     = 'e32f000b-b5a3-f393-e0a9-e50e24dcca9e'; // WRITE
// Raw binary firmware chunks (512B each)
```

In the NimBLEOta section, update comment to:
```ts
// ── OTA firmware flash ────────────────────────────────────────────────────────
// OTA uses the NimBLEOta library's separate GATT service (not the OS service above).
// FirmwareUpdateService.ts implements the full NimBLEOta protocol.
```

**Done when:** TypeScript compiles with no "unused export" warnings. Verify nothing imports CHAR_OTA_CTRL or CHAR_OTA_DATA by running `grep -r "CHAR_OTA_CTRL\|CHAR_OTA_DATA" src/` — should find nothing.

---

## TASK-008 — Fix double `buildInitialPinModes` call [MEDIUM M2]

**File to edit:** `context/DeviceContext.tsx`

**What:** In the `onBoardInfo` callback, store `buildInitialPinModes` result in a local variable.

**Exact change:**
```ts
// BEFORE:
onBoardInfo: (info) => {
  setBoardInfo(info);
  setAppPartition(info.app_partition);
  if (info.pins?.length) {
    setPinModes(buildInitialPinModes(info.pins));
    setPinStates(buildInitialPinStates(info.pins, buildInitialPinModes(info.pins)));
  }
  ...

// AFTER:
onBoardInfo: (info) => {
  setBoardInfo(info);
  setAppPartition(info.app_partition);
  if (info.pins?.length) {
    const modes = buildInitialPinModes(info.pins);
    setPinModes(modes);
    setPinStates(buildInitialPinStates(info.pins, modes));
  }
  ...
```

**Done when:** TypeScript compiles. One call to `buildInitialPinModes` per `onBoardInfo` event.

---

## TASK-009 — Fix stale docstring in CrashReportService [MEDIUM M5]

**File to edit:** `services/CrashReportService.ts`

**Exact change:**
```ts
// BEFORE:
 * CrashReportService — structured diagnostic log for WaterTank app.

// AFTER:
 * CrashReportService — structured diagnostic log for FlashLink app.
```

**Done when:** File compiles.

---

## TASK-010 — Fix file picker to filter `.bin` files only [LOW L1]

**File to edit:** `app/(tabs)/firmware.tsx`

**What:** Change `DocumentPicker.getDocumentAsync` to use a MIME type that limits to binary files,
or use the `mimeTypes` parameter. On Android, `.bin` files typically have `application/octet-stream`.

**Exact change:**
```ts
// BEFORE:
const result = await DocumentPicker.getDocumentAsync({
  type: '*/*',
  copyToCacheDirectory: true,
});

// AFTER:
const result = await DocumentPicker.getDocumentAsync({
  type: 'application/octet-stream',
  copyToCacheDirectory: true,
});
```

Keep the `.bin` extension check as a second-line guard (some files may have wrong MIME type).

**Done when:** TypeScript compiles.

---

## Task execution order

| Priority | Task | File(s) | Risk |
|---|---|---|---|
| 1 | TASK-001 | DeviceContext, firmware.tsx | Medium — logic change |
| 2 | TASK-002 | DeviceContext | Low — adds cleanup |
| 3 | TASK-003 | FirmwareUpdateService | Trivial — string change |
| 4 | TASK-004 | gpio.ts | Trivial — array change |
| 5 | TASK-005 | DeviceContext | Low — removes optimistic update |
| 6 | TASK-006 | BLEService | Medium — auth flow change |
| 7 | TASK-007 | ble.ts | Low — delete dead code |
| 8 | TASK-008 | DeviceContext | Trivial — local var |
| 9 | TASK-009 | CrashReportService | Trivial — docstring |
| 10 | TASK-010 | firmware.tsx | Trivial — string change |
