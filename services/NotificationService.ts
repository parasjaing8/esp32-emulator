import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

import { StopReason } from "@/models/Event";
import type { Translations } from "@/constants/i18n";

type Translator = (key: keyof Translations) => string;

let channelReady = false;
let permissionGranted = false;

async function ensureChannel() {
  if (channelReady || Platform.OS !== "android") return;
  await Notifications.setNotificationChannelAsync("motor", {
    name: "Motor alerts",
    importance: Notifications.AndroidImportance.HIGH,
    sound: "default",
    vibrationPattern: [0, 200, 200, 200],
  });
  channelReady = true;
}

export async function requestPermissions(): Promise<boolean> {
  try {
    const existing = await Notifications.getPermissionsAsync();
    if (existing.status === "granted") {
      permissionGranted = true;
      await ensureChannel();
      return true;
    }
    const res = await Notifications.requestPermissionsAsync();
    permissionGranted = res.status === "granted";
    if (permissionGranted) await ensureChannel();
    return permissionGranted;
  } catch (e) {
    console.warn("notif perm error", e);
    return false;
  }
}

async function notify(title: string, body: string) {
  if (!permissionGranted) {
    // Re-check OS status — handles cold-start race where events fire before
    // requestPermissions() resolves but permission was already granted.
    try {
      const s = await Notifications.getPermissionsAsync();
      permissionGranted = s.status === "granted";
    } catch { return; }
  }
  if (!permissionGranted) return;
  try {
    await Notifications.scheduleNotificationAsync({
      content: { title, body, sound: "default" },
      trigger: null, // immediate — avoids Expo 52 future-schedule bug
    });
  } catch (e) {
    console.warn("notify error", e);
  }
}

export async function scheduleMotorOn(tankPct: number, t: Translator) {
  await ensureChannel();
  const title = t("evMotorOn");
  const body = `${t("tankLevel")}: ${Math.round(tankPct)}%`;
  await notify(title, body);
}

export async function scheduleMotorOff(
  tankPct: number,
  reason: StopReason,
  t: Translator
) {
  await ensureChannel();
  const title = t("evMotorOff");
  let reasonText = "";
  if (reason === StopReason.TANK_FULL) reasonText = t("stopTankFull");
  else if (reason === StopReason.SUPPLY_CUT) reasonText = t("stopSupplyCut");
  const body = reasonText
    ? `${reasonText} · ${Math.round(tankPct)}%`
    : `${t("tankLevel")}: ${Math.round(tankPct)}%`;
  await notify(title, body);
}

export async function scheduleTankLow(t: Translator) {
  await ensureChannel();
  await notify(t("tankLow"), t("tankLowNotifBody"));
}

export async function scheduleManualOverride(t: Translator) {
  await ensureChannel();
  await notify(t("pumpManual"), t("evManualOn"));
}

export async function cancelAll() {
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
  } catch {}
}

export default {
  requestPermissions,
  scheduleMotorOn,
  scheduleMotorOff,
  scheduleTankLow,
  scheduleManualOverride,
  cancelAll,
};
