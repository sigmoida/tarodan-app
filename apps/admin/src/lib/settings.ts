import {
  BOOST_ENABLED_SETTING,
  BOOST_OFFER_SINCE_SETTING,
  boostOfferSince,
  isBoostEnabled,
  isPlatformSettingOn,
} from "@tarodan/types";

/**
 * Normalizes the platform_settings API response. The backend sometimes returns
 * a `[{ settingKey, settingValue }]` array and sometimes a plain `{ key: value }`
 * object; both shapes are reduced to a single key→value map.
 */
export function settingsToMap(raw: unknown): Record<string, string> {
  const map: Record<string, string> = {};
  if (Array.isArray(raw)) {
    for (const s of raw as Array<Record<string, unknown>>) {
      const key = (s.settingKey ?? s.key) as string | undefined;
      if (key != null) map[key] = String(s.settingValue ?? s.value ?? "");
    }
  } else if (raw && typeof raw === "object") {
    for (const [key, value] of Object.entries(raw))
      map[key] = String(value ?? "");
  }
  return map;
}

/** Reads a single setting key (`undefined` if absent). */
export function readSetting(raw: unknown, key: string): string | undefined {
  return settingsToMap(raw)[key];
}

/** `psp_fee_rate` ayarı yokken kullanılan PayTR standart oranı (%). */
export const DEFAULT_PSP_FEE_RATE = 3;

/**
 * PSP (PayTR) kesinti oranı (%) — hak ediş ekranlarındaki tahmini maliyet.
 * Ayar sayfası da, kırılım ekranları da bunu okur (tek kaynak); bozuk/eksik
 * değer varsayılana düşer, ekran NaN göstermez.
 */
export function readPspFeeRate(raw: unknown): number {
  const value = Number(readSetting(raw, "psp_fee_rate"));
  return Number.isFinite(value) && value >= 0 ? value : DEFAULT_PSP_FEE_RATE;
}

/**
 * Whether an on/off setting is on (`distance_sales_consent_required`,
 * `auth_require_reauth_for_sensitive_actions`, ...). The "only `true` is on"
 * rule comes from `@tarodan/types`, the same one the API applies; a missing
 * setting is off.
 */
export function readSettingOn(raw: unknown, key: string): boolean {
  return isPlatformSettingOn(readSetting(raw, key));
}

/**
 * Whether boost sales are on. Unlike `readSettingOn`, a missing or empty
 * `boost_enabled` is on (`isBoostEnabled`, the rule the API applies); only
 * "false" turns it off.
 */
export function readBoostEnabled(raw: unknown): boolean {
  return isBoostEnabled(readSetting(raw, BOOST_ENABLED_SETTING));
}

/**
 * The new-listing offer start (`boost_offer_since`) as the API reads it, or
 * null when offers are off (missing, empty or not a date).
 */
export function readBoostOfferSince(raw: unknown): Date | null {
  return boostOfferSince(readSetting(raw, BOOST_OFFER_SINCE_SETTING));
}
