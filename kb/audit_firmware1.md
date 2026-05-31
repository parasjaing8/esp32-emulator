# FlashLink Firmware — Audit 1
_Date: 2026-06-01 | Reviewer: Claude Sonnet 4.6_
_File: `firmware/esp32-os/esp32-os.ino` (680 lines)_

## Summary

7 findings (2 HIGH, 3 MEDIUM, 2 LOW). No critical security issues. Firmware is
functionally sound — all bugs are correctness edge cases, not protocol failures.

---

## HIGH

### H1 — GpioStateCB.onRead sends spurious NOTIFY (line 320)

```cpp
void onRead(NimBLECharacteristic* c, NimBLEConnInfo&) override {
    notifyGpioState();  // also sends notify; read returns same data
}
```

`notifyGpioState()` calls `charGpioState->notify()` which sends a BLE notification
to **all subscribers**. A `onRead` callback should only populate the characteristic's
value for the reader — it has no business sending a NOTIFY to other connected peers.
The actual read response is also wrong: `c->setValue(...)` is never called inside
`onRead`, so the read response value is whatever was last set by `notifyGpioState`.

**Fix:** Extract `buildGpioStateJson()` that returns the JSON buffer. Call it from
both `onRead` (via `c->setValue`) and `notifyGpioState` (via `charGpioState->setValue`
+ `notify()`).

---

### H2 — notifyGpioState reports all 22 GPIOs including unconfigured flash pins (line 262)

```cpp
for (int i = 0; i < MAX_GPIO; i++) {
    if (gpioMode[i] == 1) { ... }
    else if (gpioMode[i] == 0 || ...) { digitalRead(i); }
}
```

`gpioMode` is zero-initialized — all 22 GPIOs default to mode 0 (INPUT). This means
every notification includes `digitalRead()` on flash-strapped pins 11–17 and the
BOOT pin (9), sending meaningless values to the app and polluting the GPIO state
display. The app renders all received pins, so the user sees 22 pins when they
configured 0.

**Fix:** Add a `gpioConfigured[MAX_GPIO]` boolean array, initialized false. Set it
true only inside `GpioConfigCB.onWrite`. Skip unconfigured pins in
`notifyGpioState`. Also skip `isForbiddenOutput` pins unconditionally.

---

## MEDIUM

### M1 — GpioConfigCB redundant isForbiddenOutput check (lines 285, 287)

```cpp
if (pin >= MAX_GPIO || isForbiddenOutput(pin)) return;   // line 285 — early exit
if (strcmp(mode, "OUTPUT") == 0) {
    if (isForbiddenOutput(pin)) return;                  // line 287 — dead code
```

The second `isForbiddenOutput` check is unreachable — line 285 already returns for
forbidden pins. Dead code, remove line 287.

---

### M2 — PartitionCB.onRead uses wrong partition reference (line 358)

```cpp
const esp_partition_t* next = esp_ota_get_next_update_partition(nullptr);
// ...
if (next && esp_ota_get_partition_description(next, &appDesc) == ESP_OK) {
```

`esp_ota_get_next_update_partition(nullptr)` returns the **next partition to write**
OTA data to — the one that is NOT currently running. If the device has just switched
to ota_1 (App) and the OS is running ota_0, "next" would be ota_1, which is correct.
But if the user just flashed ota_1 and booted it back to ota_0, "next" is again ota_1
— also OK in that case. However the intent is specifically to describe ota_1 (the app
partition). The correct and explicit approach:

```cpp
const esp_partition_t* appPart = esp_partition_find_first(
    ESP_PARTITION_TYPE_APP, ESP_PARTITION_SUBTYPE_APP_OTA_1, nullptr);
```

This is already done correctly in `PartitionCB.onWrite` (BOOT_APP branch, line 379).
Make `onRead` consistent.

---

### M3 — BoardInfoCB: buf[256] same size as StaticJsonDocument<256> (lines 403, 413)

```cpp
StaticJsonDocument<256> doc;
// ... 8 fields added ...
char buf[256]; size_t len = serializeJson(doc, buf);
```

`serializeJson(doc, buf)` writes a null terminator, so effective capacity is 255 bytes.
`StaticJsonDocument<256>` caps ArduinoJson's internal pool at 256 bytes; if JSON
overflows the doc silently truncates fields. The MAC string alone is 17 bytes
("AA:BB:CC:DD:EE:FF") + 8 fields + keys + separators easily consumes 180–220 bytes.
No overflow on ESP32-C3 in practice, but tight. Chip model strings vary — ESP32-S3
chips report "ESP32-S3" + package suffixes up to ~20 chars.

**Fix:** Bump to `StaticJsonDocument<384>` and `char buf[384]`.

---

## LOW

### L1 — Serial bridge uses hardcoded MTU-3=509 chunk size (line 499)

```cpp
size_t chunk = min((size_t)509, serialBufLen - offset);
```

`NimBLEDevice::setMTU(512)` sets the **requested** MTU. Android/iOS negotiate the
actual MTU — older Android devices may negotiate 244 (BLE 4.x default). Sending
509-byte notifications when MTU negotiated to 244 would fragment or be dropped by
the stack. NimBLE will silently truncate `notify()` to the negotiated ATT_MTU-3.

**Fix:** Use `bleServer->getPeerMTU(charSerialRx->getSubscribedList()[0])` or a safe
conservative default of 244 until MTU negotiation is known. Alternatively use
`min((size_t)(BLE_ATT_ATTR_MAX_LEN), serialBufLen - offset)` (NimBLE clamps anyway,
so the risk is only excessive fragmentation, not corruption).

---

### L2 — bleOta.startAbortTimer(300) — unit unclear (line 609)

```cpp
bleOta.startAbortTimer(300);
```

NimBLEOta's `startAbortTimer` takes a value — verify whether the unit is seconds
or milliseconds. If milliseconds, 300ms would abort OTA before the host can even
start writing packets (first sector takes ~500ms over BLE). If seconds, 300s = 5min
is reasonable.

**Fix:** Confirm against NimBLEOta source. If ms, change to `30000` (30s) or the
appropriate seconds value.

---

## Non-issues (investigated, ruled out)

- **PartitionCB.onWrite BOOT_OS/BOOT_APP**: uses `esp_partition_find_first` explicitly — correct.
- **Auth session LRU eviction**: memmove is correct for sliding window eviction.
- **OTA watchdog** (ESP_OTA_IMG_PENDING_VERIFY): correctly calls `esp_ota_mark_app_valid_cancel_rollback()` on first boot.
- **Factory reset**: clears prefs + bonds, then restarts — correct and complete.
- **Short BOOT press** → `vis_boot` flag + reboot: needed workaround for NimBLE advertising-after-connection bug; intentional.

---

## Task list

See `kb/tasks_firmware1.md`.
