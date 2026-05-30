// ESP32 Emulator OS Firmware v1.0.0
// Partition A — always preserved, never OTA-overwritten.
// Exposes: board info, GPIO control, ADC, BLE serial, OTA (partition B), auth.
//
// Auth protocol identical to WaterTank v1.4 (session tokens, salted SHA256).
// OTA uses NimBLEOta library (same as WaterTank) — FirmwareUpdateService.ts is the client.

#include <NimBLEDevice.h>
#include <Preferences.h>
#include "NimBLEOta.h"
#include <mbedtls/md.h>
#include <ArduinoJson.h>
#include <esp_ota_ops.h>
#include <esp_system.h>
#include <esp_mac.h>

#define FW_VERSION    "1.0.0"
#define PREFS_NS      "esp32os"
#define LED_PIN       8     // ESP32-C3 Mini onboard LED
#define BOOT_PIN      9     // Boot button (STRAPPING — INPUT_PULLUP)
#define SERIAL_POLL_MS  20  // how often to flush UART → BLE notify
#define GPIO_POLL_MS   100  // INPUT pin change detection interval
#define FACTORY_HOLD_MS 10000UL

// ── Service & characteristic UUIDs (must match constants/ble.ts) ──────────────
#define SVC_UUID       "e32f0001-b5a3-f393-e0a9-e50e24dcca9e"
#define C_BOARD_INFO   "e32f0002-b5a3-f393-e0a9-e50e24dcca9e"
#define C_GPIO_CONFIG  "e32f0003-b5a3-f393-e0a9-e50e24dcca9e"
#define C_GPIO_WRITE   "e32f0004-b5a3-f393-e0a9-e50e24dcca9e"
#define C_GPIO_STATE   "e32f0005-b5a3-f393-e0a9-e50e24dcca9e"
#define C_ADC_READ     "e32f0006-b5a3-f393-e0a9-e50e24dcca9e"
#define C_SERIAL_TX    "e32f0008-b5a3-f393-e0a9-e50e24dcca9e"
#define C_SERIAL_RX    "e32f0009-b5a3-f393-e0a9-e50e24dcca9e"
#define C_PARTITION    "e32f0011-b5a3-f393-e0a9-e50e24dcca9e"
#define C_AUTH         "e32f000c-b5a3-f393-e0a9-e50e24dcca9e"
#define C_SESSION      "e32f000d-b5a3-f393-e0a9-e50e24dcca9e"
#define C_SETUP        "e32f000e-b5a3-f393-e0a9-e50e24dcca9e"
#define C_VISIBILITY   "e32f000f-b5a3-f393-e0a9-e50e24dcca9e"
#define C_CLAIMED      "e32f0010-b5a3-f393-e0a9-e50e24dcca9e"

// ── GPIO management ───────────────────────────────────────────────────────────
// ESP32-C3 usable GPIOs: 0-10, 20-21
// Avoided: 11-17 (flash), 18-19 (USB D-/D+)
#define MAX_GPIO 22
static uint8_t gpioMode[MAX_GPIO]  = {};   // 0=INPUT 1=OUTPUT 2=INPUT_PULLUP 3=INPUT_PULLDOWN
static uint8_t gpioState[MAX_GPIO] = {};   // cached state for change detection
static uint8_t adcPin = 0;                 // last pin set for ADC read

// Pins that must not be reconfigured as OUTPUT
static bool isForbiddenOutput(uint8_t pin) {
  return pin == 11 || pin == 12 || pin == 13 || pin == 14 ||
         pin == 15 || pin == 16 || pin == 17 || pin == 18 || pin == 19;
}

// ── Auth ──────────────────────────────────────────────────────────────────────
#define SESSION_MAX  5
#define SESSION_LEN  16

static bool     claimed       = false;
static char     deviceName[32]= "ESP32-OS";
static uint8_t  passwordHash[32] = {};
static uint8_t  pwSalt[16]       = {};
static bool     pwSalted         = false;
static uint8_t  sessions[SESSION_MAX][SESSION_LEN] = {};
static uint8_t  sessionCount  = 0;
static bool     bleVisible     = true;
static unsigned long visibilityEnd = 0;
static bool     connAuthed     = false;
static unsigned long btnHoldStart = 0;

// ── BLE state ─────────────────────────────────────────────────────────────────
static NimBLECharacteristic *charSession, *charGpioState, *charSerialRx;
static NimBLEServer          *bleServer = nullptr;
static NimBLEOta              bleOta;
static Preferences            prefs;
static volatile bool bleConnected = false;
static bool otaActive    = false;
static bool pendingRestart = false;
static unsigned long restartAt = 0;

// ── SHA256 (mbedTLS) — copied verbatim from WaterTank ─────────────────────────

static void sha256(const uint8_t* data, size_t len, uint8_t out[32]) {
  mbedtls_md_context_t ctx;
  mbedtls_md_init(&ctx);
  mbedtls_md_setup(&ctx, mbedtls_md_info_from_type(MBEDTLS_MD_SHA256), 0);
  mbedtls_md_starts(&ctx);
  mbedtls_md_update(&ctx, data, len);
  mbedtls_md_finish(&ctx, out);
  mbedtls_md_free(&ctx);
}

static void saltedHash(const uint8_t* pw, size_t pwLen, uint8_t out[32]) {
  mbedtls_md_context_t ctx;
  mbedtls_md_init(&ctx);
  mbedtls_md_setup(&ctx, mbedtls_md_info_from_type(MBEDTLS_MD_SHA256), 0);
  mbedtls_md_starts(&ctx);
  mbedtls_md_update(&ctx, pwSalt, sizeof(pwSalt));
  mbedtls_md_update(&ctx, pw, pwLen);
  mbedtls_md_finish(&ctx, out);
  mbedtls_md_free(&ctx);
}

// ── NVS auth — copied structure from WaterTank ────────────────────────────────

static void nvsLoadAuth() {
  claimed = prefs.getBool("claimed", false);
  String n = prefs.getString("dev_name", "ESP32-OS");
  strncpy(deviceName, n.c_str(), sizeof(deviceName) - 1);

  size_t saltLen = prefs.getBytes("pw_salt", pwSalt, sizeof(pwSalt));
  if (saltLen != sizeof(pwSalt)) {
    esp_fill_random(pwSalt, sizeof(pwSalt));
    prefs.putBytes("pw_salt", pwSalt, sizeof(pwSalt));
    pwSalted = false;
  } else {
    pwSalted = prefs.getBool("pw_salted", false);
  }
  size_t got = prefs.getBytes("pw_hash", passwordHash, 32);
  if (got < 32) {
    saltedHash((const uint8_t*)"1234", 4, passwordHash);
    prefs.putBytes("pw_hash", passwordHash, 32);
    prefs.putBool("pw_salted", true);
    pwSalted = true;
  }
  sessionCount = prefs.getUChar("sess_count", 0);
  if (sessionCount > SESSION_MAX) sessionCount = 0;
  prefs.getBytes("sessions", sessions, sizeof(sessions));
  bleVisible = !claimed;
}

static bool sessionFind(const uint8_t* token) {
  for (int i = 0; i < sessionCount; i++)
    if (memcmp(sessions[i], token, SESSION_LEN) == 0) return true;
  return false;
}
static void sessionAdd(const uint8_t* token) {
  if (sessionCount < SESSION_MAX) {
    memcpy(sessions[sessionCount++], token, SESSION_LEN);
  } else {
    memmove(sessions[0], sessions[1], (SESSION_MAX - 1) * SESSION_LEN);
    memcpy(sessions[SESSION_MAX - 1], token, SESSION_LEN);
  }
  prefs.putBytes("sessions", sessions, sizeof(sessions));
  prefs.putUChar("sess_count", sessionCount);
}
static void sessionsClearAll() {
  memset(sessions, 0, sizeof(sessions));
  sessionCount = 0;
  prefs.putBytes("sessions", sessions, sizeof(sessions));
  prefs.putUChar("sess_count", 0);
}
static void genToken(uint8_t out[SESSION_LEN]) {
  for (int i = 0; i < SESSION_LEN; i++) out[i] = esp_random() & 0xFF;
}

// ── Auth characteristic callbacks — identical protocol to WaterTank ───────────

class AuthCB : public NimBLECharacteristicCallbacks {
  void onWrite(NimBLECharacteristic* c, NimBLEConnInfo&) override {
    NimBLEAttValue v = c->getValue();
    bool ok = false;
    if (v.size() == SESSION_LEN) {
      ok = sessionFind(v.data());
    } else if (v.size() > 0) {
      uint8_t h[32];
      if (pwSalted) saltedHash(v.data(), v.size(), h);
      else          sha256(v.data(), v.size(), h);
      ok = (memcmp(h, passwordHash, 32) == 0);
      if (ok && !pwSalted) {
        saltedHash(v.data(), v.size(), passwordHash);
        prefs.putBytes("pw_hash", passwordHash, 32);
        prefs.putBool("pw_salted", true);
        pwSalted = true;
      }
    }
    if (ok) {
      uint8_t token[SESSION_LEN]; genToken(token);
      sessionAdd(token);
      charSession->setValue(token, SESSION_LEN);
      connAuthed = true;
      const char* resp = claimed ? "OK" : "SETUP_REQUIRED";
      c->setValue((uint8_t*)resp, strlen(resp));
      Serial.printf("Auth: %s\n", resp);
    } else {
      c->setValue((uint8_t*)"FAIL", 4);
      connAuthed = false;
      Serial.println("Auth: FAIL");
    }
  }
};

class SetupCB : public NimBLECharacteristicCallbacks {
  void onWrite(NimBLECharacteristic* c, NimBLEConnInfo&) override {
    if (!connAuthed) { c->setValue((uint8_t*)"FAIL", 4); return; }
    NimBLEAttValue v = c->getValue();
    const char* data = (const char*)v.data();
    const char* sep  = (const char*)memchr(data, '|', v.size());
    if (!sep) { c->setValue((uint8_t*)"FAIL", 4); return; }
    size_t nameLen = sep - data;
    size_t pwLen   = v.size() - nameLen - 1;
    if (nameLen == 0 || nameLen >= sizeof(deviceName) || pwLen == 0) {
      c->setValue((uint8_t*)"FAIL", 4); return;
    }
    memcpy(deviceName, data, nameLen);
    deviceName[nameLen] = 0;
    prefs.putString("dev_name", deviceName);
    uint8_t h[32];
    saltedHash((const uint8_t*)(sep + 1), pwLen, h);
    memcpy(passwordHash, h, 32);
    prefs.putBytes("pw_hash", passwordHash, 32);
    prefs.putBool("pw_salted", true);
    pwSalted = true;
    sessionsClearAll();
    uint8_t token[SESSION_LEN]; genToken(token);
    sessionAdd(token);
    charSession->setValue(token, SESSION_LEN);
    claimed       = true;
    bleVisible    = true;
    visibilityEnd = millis() + 30000UL;
    prefs.putBool("claimed", true);
    NimBLEAdvertisementData scanRsp;
    scanRsp.setName(deviceName);
    NimBLEDevice::getAdvertising()->setScanResponseData(scanRsp);
    NimBLEDevice::startAdvertising();
    c->setValue((uint8_t*)"OK", 2);
    Serial.printf("Setup: name='%s'\n", deviceName);
  }
};

class VisibilityCB : public NimBLECharacteristicCallbacks {
  void onWrite(NimBLECharacteristic* c, NimBLEConnInfo&) override {
    if (!connAuthed) return;
    NimBLEAttValue v = c->getValue();
    if (v.size() == 0) return;
    bool on = (v.data()[0] != 0);
    bleVisible = on;
    if (on) {
      visibilityEnd = millis() + (5UL * 60UL * 1000UL);
      if (!bleConnected) NimBLEDevice::startAdvertising();
    } else {
      visibilityEnd = 0;
      if (!bleConnected) NimBLEDevice::stopAdvertising();
    }
  }
};

class ClaimedCB : public NimBLECharacteristicCallbacks {
  void onRead(NimBLECharacteristic* c, NimBLEConnInfo&) override {
    uint8_t v = claimed ? 1 : 0;
    c->setValue(&v, 1);
  }
};

// ── GPIO characteristic callbacks ─────────────────────────────────────────────

// Notify current GPIO state as JSON
static void notifyGpioState() {
  if (!bleConnected || !charGpioState) return;
  StaticJsonDocument<512> doc;
  JsonObject pins = doc.createNestedObject("pins");
  for (int i = 0; i < MAX_GPIO; i++) {
    if (gpioMode[i] == 1) { // OUTPUT
      char key[4]; snprintf(key, sizeof(key), "%d", i);
      pins[key] = gpioState[i];
    } else if (gpioMode[i] == 0 || gpioMode[i] == 2 || gpioMode[i] == 3) { // INPUT
      char key[4]; snprintf(key, sizeof(key), "%d", i);
      pins[key] = (uint8_t)digitalRead(i);
    }
  }
  doc["ts"] = millis();
  char buf[512]; size_t len = serializeJson(doc, buf);
  charGpioState->setValue((uint8_t*)buf, len);
  charGpioState->notify();
}

class GpioConfigCB : public NimBLECharacteristicCallbacks {
  void onWrite(NimBLECharacteristic* c, NimBLEConnInfo&) override {
    NimBLEAttValue v = c->getValue();
    if (v.size() == 0) return;
    StaticJsonDocument<64> doc;
    if (deserializeJson(doc, v.data(), v.size()) != DeserializationError::Ok) return;
    uint8_t pin = doc["pin"] | 255;
    const char* mode = doc["mode"] | "INPUT";
    if (pin >= MAX_GPIO || isForbiddenOutput(pin)) return;
    if (strcmp(mode, "OUTPUT") == 0) {
      if (isForbiddenOutput(pin)) return;
      gpioMode[pin] = 1; pinMode(pin, OUTPUT);
    } else if (strcmp(mode, "INPUT_PULLUP") == 0) {
      gpioMode[pin] = 2; pinMode(pin, INPUT_PULLUP);
    } else if (strcmp(mode, "INPUT_PULLDOWN") == 0) {
      gpioMode[pin] = 3; pinMode(pin, INPUT_PULLDOWN);
    } else {
      gpioMode[pin] = 0; pinMode(pin, INPUT);
    }
    Serial.printf("GPIO%d mode → %s\n", pin, mode);
    notifyGpioState();
  }
};

class GpioWriteCB : public NimBLECharacteristicCallbacks {
  void onWrite(NimBLECharacteristic* c, NimBLEConnInfo&) override {
    NimBLEAttValue v = c->getValue();
    if (v.size() == 0) return;
    StaticJsonDocument<32> doc;
    if (deserializeJson(doc, v.data(), v.size()) != DeserializationError::Ok) return;
    uint8_t pin = doc["pin"] | 255;
    uint8_t val = doc["value"] | 0;
    if (pin >= MAX_GPIO || gpioMode[pin] != 1) return;
    gpioState[pin] = val;
    digitalWrite(pin, val);
    Serial.printf("GPIO%d → %s\n", pin, val ? "HIGH" : "LOW");
    notifyGpioState();
  }
};

class GpioStateCB : public NimBLECharacteristicCallbacks {
  void onRead(NimBLECharacteristic* c, NimBLEConnInfo&) override {
    // Inline: build state JSON and return it
    notifyGpioState();  // also sends notify; read returns same data
  }
  void onSubscribe(NimBLECharacteristic*, NimBLEConnInfo&, uint16_t subVal) override {
    if (subVal > 0) notifyGpioState();
  }
};

class AdcReadCB : public NimBLECharacteristicCallbacks {
  void onWrite(NimBLECharacteristic* c, NimBLEConnInfo&) override {
    NimBLEAttValue v = c->getValue();
    if (v.size() == 0) return;
    adcPin = v.data()[0];
    uint16_t val = (adcPin < MAX_GPIO) ? (uint16_t)analogRead(adcPin) : 0;
    uint8_t resp[2] = { (uint8_t)(val & 0xFF), (uint8_t)(val >> 8) };
    c->setValue(resp, 2);
    Serial.printf("ADC%d = %u\n", adcPin, val);
  }
  void onRead(NimBLECharacteristic* c, NimBLEConnInfo&) override {
    uint16_t val = (adcPin < MAX_GPIO) ? (uint16_t)analogRead(adcPin) : 0;
    uint8_t resp[2] = { (uint8_t)(val & 0xFF), (uint8_t)(val >> 8) };
    c->setValue(resp, 2);
  }
};

// ── Serial callbacks ──────────────────────────────────────────────────────────

class SerialTxCB : public NimBLECharacteristicCallbacks {
  void onWrite(NimBLECharacteristic* c, NimBLEConnInfo&) override {
    NimBLEAttValue v = c->getValue();
    if (v.size() > 0) Serial.write(v.data(), v.size());
  }
};

// ── Partition callbacks ───────────────────────────────────────────────────────

class PartitionCB : public NimBLECharacteristicCallbacks {
  void onRead(NimBLECharacteristic* c, NimBLEConnInfo&) override {
    const esp_partition_t* running = esp_ota_get_running_partition();
    const esp_partition_t* next    = esp_ota_get_next_update_partition(nullptr);
    StaticJsonDocument<128> doc;
    // Determine if we're running OS (ota_0) or App (ota_1)
    doc["active"] = (running->subtype == ESP_PARTITION_SUBTYPE_APP_OTA_0) ? "os" : "app";
    // Check if app partition has anything valid
    esp_app_desc_t appDesc;
    if (next && esp_ota_get_partition_description(next, &appDesc) == ESP_OK) {
      doc["app_name"]    = appDesc.project_name;
      doc["app_version"] = appDesc.version;
    }
    char buf[128]; size_t len = serializeJson(doc, buf);
    c->setValue((uint8_t*)buf, len);
  }
  void onWrite(NimBLECharacteristic* c, NimBLEConnInfo&) override {
    if (!connAuthed) { c->setValue((uint8_t*)"FAIL", 4); return; }
    NimBLEAttValue v = c->getValue();
    if (v.size() == 0) return;
    StaticJsonDocument<32> doc;
    if (deserializeJson(doc, v.data(), v.size()) != DeserializationError::Ok) return;
    const char* cmd = doc["cmd"] | "";
    if (strcmp(cmd, "BOOT_APP") == 0) {
      const esp_partition_t* appPart = esp_partition_find_first(
        ESP_PARTITION_TYPE_APP, ESP_PARTITION_SUBTYPE_APP_OTA_1, nullptr);
      if (appPart) {
        esp_ota_set_boot_partition(appPart);
        Serial.println("Partition: boot → app (ota_1), restarting");
        pendingRestart = true; restartAt = millis() + 500;
      }
    } else if (strcmp(cmd, "BOOT_OS") == 0) {
      const esp_partition_t* osPart = esp_partition_find_first(
        ESP_PARTITION_TYPE_APP, ESP_PARTITION_SUBTYPE_APP_OTA_0, nullptr);
      if (osPart) {
        esp_ota_set_boot_partition(osPart);
        Serial.println("Partition: boot → os (ota_0), restarting");
        pendingRestart = true; restartAt = millis() + 500;
      }
    }
  }
};

// ── Board info characteristic ──────────────────────────────────────────────────

class BoardInfoCB : public NimBLECharacteristicCallbacks {
  void onRead(NimBLECharacteristic* c, NimBLEConnInfo&) override {
    const esp_partition_t* running = esp_ota_get_running_partition();
    StaticJsonDocument<256> doc;
    doc["chip"]          = ESP.getChipModel();
    doc["revision"]      = String("v") + String(ESP.getChipRevision() / 100) + "." + String(ESP.getChipRevision() % 100);
    // Format MAC as AA:BB:CC:DD:EE:FF
    String bleAddr = NimBLEDevice::getAddress().toString().c_str();
    doc["mac"]           = bleAddr;
    doc["flash_mb"]      = ESP.getFlashChipSize() / (1024 * 1024);
    doc["psram_mb"]      = ESP.getPsramSize() / (1024 * 1024);
    doc["fw_version"]    = FW_VERSION;
    doc["app_partition"] = (running->subtype == ESP_PARTITION_SUBTYPE_APP_OTA_0) ? "os" : "app";
    char buf[256]; size_t len = serializeJson(doc, buf);
    c->setValue((uint8_t*)buf, len);
  }
};

// ── BLE server callbacks ───────────────────────────────────────────────────────

class ConnCB : public NimBLEServerCallbacks {
  void onConnect(NimBLEServer*, NimBLEConnInfo& info) override {
    bleConnected = true;
    connAuthed   = false;
    Serial.printf("BLE: connected — peer=%s\n", info.getAddress().toString().c_str());
  }
  void onDisconnect(NimBLEServer*, NimBLEConnInfo& info, int reason) override {
    bleConnected = false;
    connAuthed   = false;
    Serial.printf("BLE: disconnected (0x%02X)\n", reason);
    if (claimed) {
      bleVisible    = true;
      visibilityEnd = millis() + 60000UL;
    }
  }
};

// ── OTA callbacks ─────────────────────────────────────────────────────────────

class OtaCB : public NimBLEOtaCallbacks {
  void onStart(NimBLEOta*, uint32_t size, NimBLEOta::Reason r) override {
    Serial.printf("OTA: start size=%u\n", size); otaActive = true;
  }
  void onProgress(NimBLEOta*, uint32_t cur, uint32_t total) override {
    Serial.printf("OTA: %u/%u (%.0f%%)\n", cur, total, 100.f * cur / total);
  }
  void onStop(NimBLEOta*, NimBLEOta::Reason r) override {
    Serial.printf("OTA: stopped reason=%d\n", r); otaActive = false;
  }
  void onComplete(NimBLEOta*) override {
    Serial.println("OTA: complete — restarting in 2s");
    pendingRestart = true; restartAt = millis() + 2000;
  }
  void onError(NimBLEOta*, esp_err_t err, NimBLEOta::Reason r) override {
    Serial.printf("OTA: error 0x%x reason=%d\n", err, r); otaActive = false;
  }
};

// ── GPIO polling (INPUT pin change detection) ─────────────────────────────────

static unsigned long lastGpioPoll = 0;
static bool gpioChangedSinceNotify = false;

void pollGpioInputs() {
  unsigned long now = millis();
  if (now - lastGpioPoll < GPIO_POLL_MS) return;
  lastGpioPoll = now;
  for (int i = 0; i < MAX_GPIO; i++) {
    if (gpioMode[i] == 0 || gpioMode[i] == 2 || gpioMode[i] == 3) { // any INPUT
      uint8_t cur = (uint8_t)digitalRead(i);
      if (cur != gpioState[i]) {
        gpioState[i] = cur;
        gpioChangedSinceNotify = true;
      }
    }
  }
  if (gpioChangedSinceNotify && bleConnected) {
    notifyGpioState();
    gpioChangedSinceNotify = false;
  }
}

// ── Serial RX bridge (UART0 → BLE notify) ────────────────────────────────────

static unsigned long lastSerialPoll = 0;
static uint8_t serialBuf[512];
static size_t  serialBufLen = 0;

void pollSerialRx() {
  while (Serial.available() && serialBufLen < sizeof(serialBuf)) {
    serialBuf[serialBufLen++] = Serial.read();
  }
  unsigned long now = millis();
  if (now - lastSerialPoll < SERIAL_POLL_MS) return;
  lastSerialPoll = now;
  if (serialBufLen == 0 || !bleConnected || !charSerialRx) return;
  // Split into BLE-MTU-sized chunks (MTU=512, ATT payload = MTU-3 = 509)
  size_t offset = 0;
  while (offset < serialBufLen) {
    size_t chunk = min((size_t)509, serialBufLen - offset);
    charSerialRx->setValue(serialBuf + offset, chunk);
    charSerialRx->notify();
    offset += chunk;
  }
  serialBufLen = 0;
}

// ── setup ─────────────────────────────────────────────────────────────────────

void setup() {
  // 2s unconditional delay for USB CDC to enumerate on host
  delay(2000);
  Serial.begin(115200);
  pinMode(LED_PIN, OUTPUT);
  pinMode(BOOT_PIN, INPUT_PULLUP);

  // 3 blinks — OS firmware boot indicator
  for (int i = 0; i < 3; i++) {
    digitalWrite(LED_PIN, HIGH); delay(150);
    digitalWrite(LED_PIN, LOW);  delay(150);
  }

  prefs.begin(PREFS_NS, false);
  nvsLoadAuth();
  Serial.printf("ESP32-OS v%s boot: claimed=%s name='%s' sessions=%d\n",
                FW_VERSION, claimed ? "yes" : "no", deviceName, sessionCount);

  // OTA watchdog: validate firmware on first boot
  const esp_partition_t* running = esp_ota_get_running_partition();
  esp_ota_img_states_t state;
  if (esp_ota_get_state_partition(running, &state) == ESP_OK &&
      state == ESP_OTA_IMG_PENDING_VERIFY) {
    esp_ota_mark_app_valid_cancel_rollback();
    Serial.println("OTA: firmware validated");
  }

  // BLE init
  char advName[24];
  uint8_t mac[6]; esp_read_mac(mac, ESP_MAC_WIFI_STA);
  snprintf(advName, sizeof(advName), "ESP32-OS-%02X%02X", mac[4], mac[5]);

  NimBLEDevice::setSecurityAuth(true, false, true);
  NimBLEDevice::setSecurityIOCap(BLE_HS_IO_NO_INPUT_OUTPUT);
  NimBLEDevice::init(claimed ? deviceName : advName);
  NimBLEDevice::setMTU(512);

  bleServer = NimBLEDevice::createServer();
  bleServer->setCallbacks(new ConnCB());
  bleServer->advertiseOnDisconnect(true);

  NimBLEService* svc = bleServer->createService(SVC_UUID);

  // Board info
  NimBLECharacteristic* boardInfo = svc->createCharacteristic(C_BOARD_INFO, NIMBLE_PROPERTY::READ);
  boardInfo->setCallbacks(new BoardInfoCB());

  // GPIO
  NimBLECharacteristic* gpioCfg = svc->createCharacteristic(C_GPIO_CONFIG,
    NIMBLE_PROPERTY::WRITE | NIMBLE_PROPERTY::WRITE_NR);
  gpioCfg->setCallbacks(new GpioConfigCB());

  NimBLECharacteristic* gpioWr = svc->createCharacteristic(C_GPIO_WRITE,
    NIMBLE_PROPERTY::WRITE | NIMBLE_PROPERTY::WRITE_NR);
  gpioWr->setCallbacks(new GpioWriteCB());

  charGpioState = svc->createCharacteristic(C_GPIO_STATE,
    NIMBLE_PROPERTY::READ | NIMBLE_PROPERTY::NOTIFY);
  charGpioState->setCallbacks(new GpioStateCB());

  // ADC
  NimBLECharacteristic* adcChar = svc->createCharacteristic(C_ADC_READ,
    NIMBLE_PROPERTY::READ | NIMBLE_PROPERTY::WRITE);
  adcChar->setCallbacks(new AdcReadCB());

  // Serial bridge
  NimBLECharacteristic* serialTx = svc->createCharacteristic(C_SERIAL_TX,
    NIMBLE_PROPERTY::WRITE | NIMBLE_PROPERTY::WRITE_NR);
  serialTx->setCallbacks(new SerialTxCB());

  charSerialRx = svc->createCharacteristic(C_SERIAL_RX, NIMBLE_PROPERTY::NOTIFY);

  // Partition
  NimBLECharacteristic* partChar = svc->createCharacteristic(C_PARTITION,
    NIMBLE_PROPERTY::READ | NIMBLE_PROPERTY::WRITE);
  partChar->setCallbacks(new PartitionCB());

  // Auth
  NimBLECharacteristic* authChar = svc->createCharacteristic(C_AUTH,
    NIMBLE_PROPERTY::WRITE | NIMBLE_PROPERTY::READ);
  authChar->setCallbacks(new AuthCB());
  authChar->setValue((uint8_t*)"", 0);

  charSession = svc->createCharacteristic(C_SESSION, NIMBLE_PROPERTY::READ);
  charSession->setValue((uint8_t*)"", 0);

  NimBLECharacteristic* setupChar = svc->createCharacteristic(C_SETUP,
    NIMBLE_PROPERTY::WRITE | NIMBLE_PROPERTY::READ);
  setupChar->setCallbacks(new SetupCB());
  setupChar->setValue((uint8_t*)"", 0);

  NimBLECharacteristic* visChar = svc->createCharacteristic(C_VISIBILITY,
    NIMBLE_PROPERTY::WRITE);
  visChar->setCallbacks(new VisibilityCB());

  NimBLECharacteristic* clmd = svc->createCharacteristic(C_CLAIMED, NIMBLE_PROPERTY::READ);
  clmd->setCallbacks(new ClaimedCB());

  svc->start();
  bleOta.start(new OtaCB());
  bleOta.startAbortTimer(300);

  // Advertising
  NimBLEAdvertisementData scanRsp;
  scanRsp.setName(claimed ? deviceName : advName);
  NimBLEAdvertising* adv = NimBLEDevice::getAdvertising();
  adv->addServiceUUID(SVC_UUID);
  adv->enableScanResponse(true);
  adv->setScanResponseData(scanRsp);

  if (prefs.getBool("vis_boot", false)) {
    prefs.remove("vis_boot");
    bleVisible    = true;
    visibilityEnd = millis() + 60000UL;
  }

  if (bleVisible) {
    adv->start();
    Serial.printf("BLE: advertising as '%s'\n", claimed ? deviceName : advName);
  }
}

// ── loop ──────────────────────────────────────────────────────────────────────

void loop() {
  if (pendingRestart && millis() >= restartAt) {
    Serial.println("Restarting...");
    esp_restart();
  }

  unsigned long now = millis();

  // Factory reset: hold BOOT for 10s
  if (digitalRead(BOOT_PIN) == LOW) {
    if (btnHoldStart == 0) btnHoldStart = now;
    else if (now - btnHoldStart >= FACTORY_HOLD_MS) {
      Serial.println("Factory reset: clearing NVS, restarting");
      prefs.clear();
      NimBLEDevice::deleteAllBonds();
      delay(500); esp_restart();
    }
  } else {
    if (btnHoldStart > 0 && (now - btnHoldStart) >= 100 && (now - btnHoldStart) < FACTORY_HOLD_MS) {
      // Short press: open 60s visibility window (reboot to avoid NimBLE adv bug)
      for (int i = 0; i < 3; i++) {
        digitalWrite(LED_PIN, HIGH); delay(100);
        digitalWrite(LED_PIN, LOW);  delay(100);
      }
      prefs.putBool("vis_boot", true);
      delay(200); esp_restart();
    }
    btnHoldStart = 0;
  }

  // Visibility window expiry
  if (visibilityEnd > 0 && now >= visibilityEnd) {
    visibilityEnd = 0; bleVisible = false;
    if (!bleConnected) NimBLEDevice::stopAdvertising();
  }
  if (claimed && !bleVisible && !bleConnected) NimBLEDevice::stopAdvertising();

  // LED blink when connected
  static unsigned long lastBlink = 0;
  if (bleConnected && now - lastBlink > 1000) {
    lastBlink = now;
    digitalWrite(LED_PIN, !digitalRead(LED_PIN));
  }

  pollGpioInputs();
  pollSerialRx();
}
