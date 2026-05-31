# FlashLink Firmware — Tasks from Audit 1
_Source: kb/audit_firmware1.md | Created: 2026-06-01_

## Priority: HIGH

### FW-T001 — Fix GpioStateCB.onRead spurious NOTIFY
**File:** `firmware/esp32-os/esp32-os.ino`

Extract JSON builder, separate read path from notify path:
```cpp
static size_t buildGpioStateJson(char* buf, size_t bufLen) {
  StaticJsonDocument<512> doc;
  JsonObject pins = doc.createNestedObject("pins");
  for (int i = 0; i < MAX_GPIO; i++) {
    if (!gpioConfigured[i]) continue;           // FW-T002 dependency
    char key[4]; snprintf(key, sizeof(key), "%d", i);
    pins[key] = (gpioMode[i] == 1) ? gpioState[i] : (uint8_t)digitalRead(i);
  }
  doc["ts"] = millis();
  return serializeJson(doc, buf, bufLen);
}
static void notifyGpioState() {
  if (!bleConnected || !charGpioState) return;
  char buf[512]; size_t len = buildGpioStateJson(buf, sizeof(buf));
  charGpioState->setValue((uint8_t*)buf, len);
  charGpioState->notify();
}
```
In `GpioStateCB.onRead`:
```cpp
void onRead(NimBLECharacteristic* c, NimBLEConnInfo&) override {
  char buf[512]; size_t len = buildGpioStateJson(buf, sizeof(buf));
  c->setValue((uint8_t*)buf, len);
}
```

---

### FW-T002 — Track configured pins; skip unconfigured + flash pins in notify
**File:** `firmware/esp32-os/esp32-os.ino`

Add after `gpioState` declaration:
```cpp
static bool gpioConfigured[MAX_GPIO] = {};
```

In `GpioConfigCB.onWrite`, after mode switch:
```cpp
gpioConfigured[pin] = true;
```

In `buildGpioStateJson` (FW-T001): skip pins where `!gpioConfigured[i]`.

---

## Priority: MEDIUM

### FW-T003 — Remove dead isForbiddenOutput check in GpioConfigCB (line 287)
**File:** `firmware/esp32-os/esp32-os.ino`

Delete lines 286-287:
```cpp
// DELETE THESE:
if (strcmp(mode, "OUTPUT") == 0) {
    if (isForbiddenOutput(pin)) return;   // ← dead, already checked at line 285
```
Change to:
```cpp
if (strcmp(mode, "OUTPUT") == 0) {
```

---

### FW-T004 — PartitionCB.onRead: use explicit ota_1 lookup
**File:** `firmware/esp32-os/esp32-os.ino`

Replace `esp_ota_get_next_update_partition(nullptr)` with:
```cpp
const esp_partition_t* appPart = esp_partition_find_first(
    ESP_PARTITION_TYPE_APP, ESP_PARTITION_SUBTYPE_APP_OTA_1, nullptr);
if (appPart && esp_ota_get_partition_description(appPart, &appDesc) == ESP_OK) {
  doc["app_name"]    = appDesc.project_name;
  doc["app_version"] = appDesc.version;
}
```

---

### FW-T005 — Bump BoardInfoCB StaticJsonDocument and buf to 384 bytes
**File:** `firmware/esp32-os/esp32-os.ino`

Line 403: `StaticJsonDocument<256>` → `StaticJsonDocument<384>`
Line 413: `char buf[256]` → `char buf[384]`

---

## Priority: LOW

### FW-T006 — Investigate bleOta.startAbortTimer(300) unit
**File:** `firmware/esp32-os/esp32-os.ino` | `firmware/esp32-os/NimBLEOta.h`

Check NimBLEOta source for unit. If ms → change to `30000`. If seconds → 300s is acceptable, add a comment clarifying.

---

### FW-T007 — Serial bridge: use safe MTU-based chunk size
**File:** `firmware/esp32-os/esp32-os.ino`

Add MTU accessor or use a safe conservative value. Simplest fix:
```cpp
// 244 = minimum guaranteed ATT payload for BLE 4.x compatibility
static const size_t SERIAL_BLE_CHUNK = 244;
```
Replace hardcoded `509` with `SERIAL_BLE_CHUNK`.

---

## Status
- [x] FW-T001 — buildGpioStateJson extracted; onRead no longer sends notify
- [x] FW-T002 — gpioConfigured[] array added; poll and notify skip unconfigured pins
- [x] FW-T003 — dead isForbiddenOutput check removed from OUTPUT branch
- [x] FW-T004 — PartitionCB.onRead uses esp_partition_find_first for ota_1
- [x] FW-T005 — StaticJsonDocument<384> + buf[384] in BoardInfoCB
- [ ] FW-T006 — verify bleOta.startAbortTimer unit (NimBLEOta.h not available locally)
- [x] FW-T007 — serial bridge uses SERIAL_BLE_CHUNK=244 for BLE 4.x compat
