---
name: FlashLink web/native compat
description: Native module import chain issues that crash the Expo web preview; version pins and workarounds.
---

## Problem
`react-native-keyboard-controller` has a static import of `react-native-reanimated` which imports `react-native-worklets`. On web this chain fails because:
1. worklets expects a `./debug/slowAnimations` file that may not exist
2. reanimated validates worklets version and throws a ReanimatedError if out of range

## Rules
- **Never** import `react-native-keyboard-controller` in `app/_layout.tsx` or any file that is always-bundled on web.
- Replace `KeyboardAwareScrollView` (from keyboard-controller) with plain `ScrollView` in `KeyboardAwareScrollViewCompat.tsx`.
- Remove `<KeyboardProvider>` from the root layout; React Native's built-in keyboard handling is sufficient for this app.
- `react-native-worklets` must be exactly `0.5.1` for Expo SDK 54 (reanimated 4.x). Expo warns if it's wrong.

**Why:** This is a React Native/Expo app targeting Android. The web preview is for development only and cannot run native BLE/reanimated modules. Keeping all keyboard-controller imports out of the web bundle is the cleanest fix.

**How to apply:** Any file that needs keyboard-aware scroll on native should use React Native's built-in `KeyboardAvoidingView` + `ScrollView`. If `KeyboardAwareScrollView` is truly needed on Android, use a `.native.tsx` platform-specific file to keep it out of the web bundle.
