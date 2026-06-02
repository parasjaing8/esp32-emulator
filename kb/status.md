# FlashLink — Project Status
_Last updated: 2026-06-01_

## App Version
`1.0.0` — Phase 0-1 complete + blank-screen bug fixed. Real BLE wired. ESP32 OS firmware flashed and advertising.

## Stack
Expo SDK ~54 | RN 0.81.5 | React 19 | TypeScript strict

## Market Position (see kb/market.md for full research)
**No existing app combines GPIO control + BLE serial + BLE OTA + partition switch.**
Closest competitor: Bluefruit LE Connect (Adafruit) — locked to Adafruit HW only.
Serial Bluetooth Terminal has 1M+ downloads — proves demand. Gap is wide open.
The dual-partition "OS + app firmware" model has no public precedent.

## UVP
> "Control every pin, open a serial terminal, flash firmware, switch projects — all over Bluetooth. No cloud. No USB cable. No account."

## What's done (as of 2026-06-02)
- [x] Full UI — Board, GPIO, Terminal, Firmware (simulation mode working)
- [x] Phase 0-1: WaterTank → FlashLink migration complete, BLE fully wired
- [x] Firmware: esp32-os.ino compiled, flashed, reflashed with audit fixes (2026-06-01)
- [x] Audit 1 (15 app findings + 7 firmware findings) — all fixed (2026-06-01)
- [x] Protocol unit tests: 53/53 passing — `node tests/protocol.test.js`
- [x] Hardware verified: 55/61 BLE tests pass (6 are serial echo timing noise, not bugs)
- [x] UX: 3 design branches created (ux-v1 polish / ux-v2 features / ux-v3 premium visual)
- [x] App name: **FlashLink** confirmed by user
- [x] Package: `com.aihomecloud.flashlink` (locked for Play Store)
- [x] fix: BLE scan now uses service UUID filter — renamed boards ("Tester") discovered correctly
- [x] fix: blank Board screen, DeviceSetupModal wired, GPIO sim flicker
- [x] README.md, kb/lessons.md written
- [x] Releases: v1.2.2 (stable), ux-v1/v2/v3-preview (UX testing)

## What's next (priority order)

1. **Pick UX direction** — test ux-v1/v2/v3 on phone, decide which to merge into master
2. **Real phone BLE test** — connect to "Tester" board via v1.2.2, test GPIO/serial/partition
3. **OTA end-to-end** — flash real .bin to partition B, boot app, boot OS back
4. **ADC on real BLE** — add `readAdcPin()` to BLEService (currently sim-only, audit L2)
5. **Release keystore** — generate proper signing keystore for Play Store
6. **Play Store listing** — after UX picked + hardware tested

### Phase 2 — Serial + OTA wiring
- [ ] Test real BLE connection on Android phone
- [ ] Verify serial terminal receives real UART0 output
- [ ] Test OTA flash with a real .bin file
- [ ] Test partition switch (Boot App → Boot OS)

### Phase 3 — UI Polish
- [ ] GPIO screen: stronger HIGH glow, gradient ADC bars ← partial done
- [ ] Firmware screen: animated progress bar
- [ ] Terminal: polish
- [ ] `/frontend-design` skill run on key screens

### Phase 4 — Hardware test matrix (task1.md P5-8 through P5-20)
- [ ] Run through full test matrix on ESP32-C3

### Phase 5 — Build & Ship
- [ ] Generate release keystore + sign APK
- [x] App name: **FlashLink** — confirmed by user 2026-06-01. `android.package`: `com.aihomecloud.flashlink` (locked for Play Store)
- [ ] Play Store listing

## Architecture decisions
- OS partition (A) = always preserved. OTA only writes to partition B.
- CHAR_PARTITION switches boot target. User can always go back to OS.
- Auth model identical to WaterTank (claim/session tokens, SHA256 salted).
- OTA protocol = NimBLEOta (proven 24/26 WaterTank bench tests).
- DeviceContext is single BLE state owner.
- Simulation mode on by default — full app usable without hardware.

## Board
- ESP32-C3 Mini (connected at /dev/cu.usbmodem1101, MAC 90:70:69:c2:c5:b8)
- BLE MAC suffix: C5B8 → advertising as ESP32-OS-C5B8
- Flash firmware: espressif/arduino-esp32 3.3.8, CDCOnBoot=cdc

## Open questions
- Naming: **FlashLink** ✅ confirmed by user 2026-06-01. `android.package`: `com.aihomecloud.flashlink` — locked, cannot change after Play Store submission.
- PWM: expose in v1 or defer? → Defer to v1.1.
- iOS: defer until Android proven.
- Open source the app? → Yes, MIT.
