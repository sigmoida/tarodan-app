/**
 * platform_settings API yanıtını normalize eder. Backend bazen
 * `[{ settingKey, settingValue }]` dizisi, bazen düz `{ key: value }` object
 * döndürüyor; her iki şekli de tek anahtar→değer map'ine indirger.
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

/** Tek bir ayar anahtarını okur (yoksa `undefined`). */
export function readSetting(raw: unknown, key: string): string | undefined {
  return settingsToMap(raw)[key];
}
