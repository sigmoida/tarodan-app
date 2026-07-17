import { Platform } from "react-native";
import Constants from "expo-constants";
import type { AppPlatform } from "@/lib/api";

/**
 * Public store listing URLs for the force-update gate (#233). Always the PROD
 * store pages — even a staging build points testers at the real listing, and
 * `ascAppId` (6786614139) matches eas.json `submit.production.ios`.
 */
export const STORE_URLS: Record<AppPlatform, string> = {
  ios: "https://apps.apple.com/app/id6786614139",
  android: "https://play.google.com/store/apps/details?id=com.tarodan.app",
};

/** Current platform, or null on web/unknown (the gate is a no-op there). */
export function getAppPlatform(): AppPlatform | null {
  if (Platform.OS === "ios") return "ios";
  if (Platform.OS === "android") return "android";
  return null;
}

/**
 * Installed app version from the embedded Expo config (e.g. "1.0.0"). For a
 * store build this equals the native binary version; returns null if it can't
 * be resolved (the gate then fails open and never blocks).
 */
export function getAppVersion(): string | null {
  return Constants.expoConfig?.version ?? null;
}

export const storeUrlFor = (platform: AppPlatform): string =>
  STORE_URLS[platform];
