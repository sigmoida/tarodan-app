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
      if (key != null) map[key] = String(s.settingValue ?? s.value ?? '');
    }
  } else if (raw && typeof raw === 'object') {
    for (const [key, value] of Object.entries(raw)) map[key] = String(value ?? '');
  }
  return map;
}

/** Reads a single setting key (`undefined` if absent). */
export function readSetting(raw: unknown, key: string): string | undefined {
  return settingsToMap(raw)[key];
}
