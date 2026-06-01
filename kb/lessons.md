# FlashLink — Lessons
_Accumulated from project build (2026-05-30 to 2026-06-01)_

---

## Firmware

**`CDCOnBoot=cdc` is required on ESP32-C3 for serial monitor over built-in USB JTAG.**
Without it, `Serial` output is silent when connected via the USB-C port directly (no UART adapter needed, but CDC must be enabled in Arduino settings).

**Claimed boards don't advertise on boot — short-press BOOT for a 60s window.**
This is intentional: claimed boards stay invisible until the owner opens a visibility window. The short BOOT press stores a `vis_boot` NVS flag and reboots to work around a NimBLE advertising-after-connect bug (calling `startAdvertising()` in `onDisconnect` races with the stack cleanup).

**`./gradlew clean` breaks on stale CMake cache.**
If any image asset changed since the last build, Gradle detects a GLOB mismatch and fails. Fix: skip `clean`, run `assembleRelease` directly. The stale cache doesn't affect APK correctness — only the CMake build check triggers.

**NimBLE 2.x `onDisconnect` signature changed to `(server, connInfo, reason)`.**
The third `reason` parameter is new. Omitting it causes a compile error on NimBLE-Arduino 2.x. The reason code 0x13 = remote disconnect, 0x08 = supervision timeout — useful for debugging flaky connections.

**OTA sector timing: 600ms window is too tight for serial echo tests.**
BLE WRITE_NR → UART bridge → serial echo has ~400ms jitter at 115200 baud. Serial echo tests need a 1.2s+ timeout. GPIO8 (onboard LED_PIN) must be excluded from GPIO write tests — the LED blink loop in `loop()` races with test writes every 1000ms.

**`esp_ota_get_next_update_partition(nullptr)` returns the partition to write next OTA — not necessarily ota_1.**
After a partition switch, "next" depends on what's currently running. Always use `esp_partition_find_first(APP, OTA_1, nullptr)` when you specifically want the app partition (ota_1). Use the `next` API only when preparing for an OTA write.

**`notifyGpioState()` from `onRead` sends a NOTIFY to all subscribers — unexpected.**
Read callbacks should only call `c->setValue()` on the read argument. Calling `charGpioState->notify()` inside `onRead` broadcasts to everyone currently subscribed, not just the requester. Fixed by extracting `buildGpioStateJson()` and calling it separately in each path.

**Zero-initialized gpioMode[] means all 22 GPIOs default to INPUT — skip unconfigured pins.**
All `gpioMode[i] == 0` means "INPUT" but also means "never touched by the app". Without a separate `gpioConfigured[]` bool array, `notifyGpioState` reports `digitalRead()` on flash-strapped pins 11–17, BOOT pin 9, LED pin 8 — garbage values in every notification.

---

## BLE App (react-native-ble-plx)

**BLEService singleton: `getBleManager()` must not be called more than once.**
Creating two `BleManager` instances causes double-connect race conditions and `ServiceUUIDsNotFound` errors. All components must import the singleton via `getBleManager()`.

**NimBLE WRITE_NR (write without response) is required for throughput.**
Standard WRITE with response adds a roundtrip ACK for every packet. At 20-byte packets with ACK, OTA takes 10× longer. WRITE_NR removes the ACK wait; NimBLE queues writes and the host handles flow control via connection interval.

**UUID case matters for react-native-ble-plx: always lowercase.**
`readCharacteristicForService` with uppercase UUIDs returns null on some Android BLE stacks. All UUIDs in `constants/ble.ts` are lowercase.

**MTU 512 is the desired value, not the guaranteed negotiated value.**
`NimBLEDevice::setMTU(512)` sets what the ESP32 will request. Android BLE 4.x may negotiate 244 (ATT_MTU=247, payload=244). Hard-coding chunk size to 509 causes silent truncation on older devices. Safe default: 244.

---

## React Native / Expo

**`reanimated` must be removed from `babel.config.js` if not installed.**
expo-router includes `react-native-reanimated` in its test mocks, but if the package isn't in `node_modules`, the babel plugin fails at build time. Remove the plugin entry; add back only if reanimated is a real dependency.

**`overflow: 'scroll'` on a React Native `View` is a no-op.**
RN Views don't scroll. Wrap scrollable content in `<ScrollView>` with `horizontal` prop for horizontal scroll.

**`connectSimMode` doesn't exist in DeviceContext.**
There's no separate "connect to sim" function. The sim device appears at the top of the scan sheet (`DeviceScanSheet`) when `openScanner()` is called. Connecting to `SIM_DEVICE` from that sheet triggers simulation mode automatically.

**`AsyncStorage` must be in `dependencies`, not `devDependencies`.**
It's imported at runtime in `AuthService.ts`. Moving it to devDependencies causes a missing-module crash in release APKs.

---

## Testing

**Pure Node.js test runner is faster for CI/pre-commit than Jest when node_modules aren't installed.**
`node tests/protocol.test.js` works immediately after `git clone` with no install step. Useful as a pre-push sanity check. Jest config is still there for IDE integration and coverage reports when deps are installed.

**Test the golden path with real hardware; BLE behavior can't be verified by unit tests.**
Protocol tests verify encoding/decoding logic but not actual BLE stack behavior, MTU negotiation, or timing. Auth/session flows must be tested against real firmware.

---

## Build

**Build once, sideload with ADB for iteration testing.**
```bash
adb install -r android/app/build/outputs/apk/release/app-release.apk
```
Play Store submission waits until hardware testing is fully complete. APK size is ~82MB (includes Hermes engine + native BLE libs).

**Never use `eas build`.** Always `expo prebuild` + `./gradlew assembleRelease`. EAS builds remotely, obscures the native layer, and charges build minutes. Local builds are reproducible and fast (~2min on M1).
