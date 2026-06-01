# FlashLink

Control every pin, open a serial terminal, flash firmware, and switch projects — all over Bluetooth. No cloud. No USB cable. No account.

Android app + ESP32 OS firmware for complete wireless control of ESP32 microcontrollers.

---

## What it does

| Feature | Description |
|---|---|
| **GPIO control** | Set pin modes (INPUT/OUTPUT/PULLUP/PULLDOWN), write HIGH/LOW, read state |
| **ADC** | Read analog pins live |
| **Serial terminal** | Full UART0 bridge over BLE — send commands, see output |
| **OTA firmware flash** | Flash `.bin` files directly from your phone to partition B |
| **Partition switch** | Boot your app firmware or return to the OS partition at any time |

---

## Architecture

```
Phone (FlashLink app)
  │
  │  BLE (react-native-ble-plx)
  │
ESP32 running esp32-os (partition A / ota_0)
  │
  ├── GPIO 0-10, 20-21 (configurable)
  ├── UART0 serial bridge
  ├── NimBLEOta → writes partition B (ota_1)
  └── Partition switch → boot app / boot OS
```

The OS firmware lives in partition A (ota_0) and is **never overwritten by OTA**. OTA only writes partition B (ota_1). The user can always return to the OS by writing `{"cmd":"BOOT_OS"}` to CHAR_PARTITION — via the app's Firmware tab.

---

## Hardware support

Tested on **ESP32-C3 Mini**. GPIO pin maps are defined for:

- ESP32 (original) — 34 pins
- ESP32-C3 — 22 pins (GPIO 11-19 restricted)
- ESP32-S3 — 48 pins
- ESP32-C6 — 30 pins
- ESP32-S2 — 43 pins

The app auto-selects the pin map based on chip model reported by the firmware.

---

## App setup

### Prerequisites

- Node.js 18+
- Android Studio (for Android build)
- Expo CLI: `npm install -g expo-cli`

### Build

```bash
npm install
expo prebuild
cd android && ./gradlew assembleRelease
```

APK: `android/app/build/outputs/apk/release/app-release.apk`

### Simulation mode

The app runs fully in simulation mode without hardware. Tap **Scan** from the Board tab to see the simulated device.

---

## Firmware setup

### Flash the OS firmware

1. Open `firmware/esp32-os/esp32-os.ino` in Arduino IDE
2. Install boards: **esp32 by Espressif** ≥ 3.3.8
3. Install libraries: **NimBLE-Arduino**, **NimBLEOta**, **ArduinoJson**
4. Board settings (ESP32-C3 Mini):
   - Board: ESP32C3 Dev Module
   - Flash size: 4MB
   - Partition scheme: use `firmware/esp32-os/partitions.csv`
   - CDC on Boot: Enabled
5. Flash via USB

### First connection

1. Open the app → tap **Scan** → select your ESP32 device
2. Enter the default password: **1234**
3. Complete setup: set a device name + new password
4. Board tab shows chip info, firmware version, partition state

---

## BLE protocol

All characteristics live under service UUID `e32f0001-b5a3-f393-e0a9-e50e24dcca9e`.

| Characteristic | UUID suffix | Properties | Description |
|---|---|---|---|
| BOARD_INFO | `0002` | READ | JSON: chip, mac, fw_version, partitions |
| GPIO_CONFIG | `0003` | WRITE | JSON: `{"pin":N,"mode":"OUTPUT"}` |
| GPIO_WRITE | `0004` | WRITE | JSON: `{"pin":N,"value":1}` |
| GPIO_STATE | `0005` | READ+NOTIFY | JSON: `{"pins":{"N":0/1},"ts":ms}` |
| ADC_READ | `0006` | READ+WRITE | WRITE pin byte → READ 2-byte LE value |
| SERIAL_TX | `0008` | WRITE | Raw bytes → UART0 |
| SERIAL_RX | `0009` | NOTIFY | UART0 output → BLE chunks (244 bytes) |
| AUTH | `000c` | WRITE | Password or session token → `OK`/`FAIL`/`SETUP_REQUIRED` |
| SESSION | `000d` | READ | 16-byte session token after auth |
| SETUP | `000e` | WRITE | `name\|password` → `OK` (first-time setup) |
| VISIBILITY | `000f` | WRITE | 0x01 = advertise for 5min, 0x00 = stop |
| CLAIMED | `0010` | READ | 0x01 if setup complete |
| PARTITION | `0011` | READ+WRITE | READ: JSON state. WRITE: `{"cmd":"BOOT_APP"}` or `{"cmd":"BOOT_OS"}` |

OTA uses the NimBLEOta library's own GATT service (separate UUIDs, handled by `FirmwareUpdateService.ts`).

---

## Auth protocol

Identical to the WaterTank project (SHA256-salted, session tokens):

1. App writes password bytes to CHAR_AUTH
2. Firmware responds `OK` (claimed) or `SETUP_REQUIRED` (unclaimed) and stores a session token in CHAR_SESSION
3. App reads CHAR_SESSION → stores 16-byte token in AsyncStorage
4. Future connections: write token directly to CHAR_AUTH for instant auth

Sessions persist across reboots (NVS). Factory reset: hold BOOT button 10 seconds.

---

## Tests

```bash
# No dependencies needed
node tests/protocol.test.js

# With node_modules installed
npm test
```

53 unit tests covering: CRC16-CCITT-ZERO, semver parsing, OTA start command encoding, sector packet building.

---

## Project structure

```
app/              Expo Router screens (tabs: Board, GPIO, Terminal, Firmware)
components/       BLE pairing sheet, device scan sheet, error fallback
constants/        BLE UUIDs, GPIO pin maps, theme
context/          DeviceContext — single BLE state owner
services/         BLEService, FirmwareUpdateService, AuthService, CrashReportService
firmware/
  esp32-os/       Arduino sketch + partitions.csv
tests/            Protocol unit tests
kb/               Project knowledge base — status, session logs, audits
```

---

## License

MIT
