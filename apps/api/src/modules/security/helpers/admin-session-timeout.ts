/**
 * Admin panelinin boşta kalma süresi.
 *
 * Neden ayardan okunuyor: bu süre bir güvenlik/kullanılabilirlik dengesidir ve
 * dengeyi kuran kişi admin panelinde oturur, terminalde değil — ortak bir
 * bilgisayardan girilen kurulumda kısa, tek kişilik ofiste uzun olmalı.
 * Kod sabiti olduğu sürece her değişiklik deploy gerektiriyordu (CLAUDE.md §12).
 *
 * Neden cache'li: `validateAdminSession` HER admin isteğinde çalışır. Ayarı her
 * seferinde okumak, en sıcak yola istek başına bir sorgu daha eklerdi.
 */

/** Ayar anahtarı + güvenli varsayılan. `min`, ayarın kendini kilitlemesini önler. */
export const ADMIN_SESSION_TIMEOUT_SETTING = {
  key: "admin_session_timeout_minutes",
  default: 30,
  /**
   * Alt sınır: bunun altındaki bir değer, admin'i ayarı düzeltmeye fırsat
   * bulamadan dışarı atardı (kendini kilitleme). Üst sınır yok — süreyi
   * uzatmak bilinçli bir güvenlik kararıdır ve ayarın amacı da odur.
   */
  min: 5,
} as const;

/** Ayar okuyabilen minimum Prisma yüzeyi (PrismaService ya da tx client). */
export interface AdminSessionSettingReader {
  platformSetting: {
    findUnique(args: {
      where: { settingKey: string };
    }): Promise<{ settingValue: string } | null>;
  };
}

const CACHE_TTL_MS = 60_000;

let cache: { value: number; readAt: number } | null = null;

/** Testler ve ayar kaydedildikten hemen sonra kullanılır. */
export function resetAdminSessionTimeoutCache(): void {
  cache = null;
}

/**
 * Ayardaki dakika değeri. Satır yoksa, boşsa ya da geçersizse varsayılana
 * düşer — hatalı bir ayar yüzünden oturumlar aniden kısalmasın. Boş dize
 * `Number("") === 0` verdiği için ayrıca elenir: sıfır dakika, her isteği
 * süresi dolmuş oturumla karşılardı.
 */
export async function resolveAdminSessionTimeoutMinutes(
  db: AdminSessionSettingReader,
  now: number = Date.now(),
): Promise<number> {
  if (cache && now - cache.readAt < CACHE_TTL_MS) return cache.value;

  const { key, default: fallback, min } = ADMIN_SESSION_TIMEOUT_SETTING;
  let value: number = fallback;
  try {
    const row = await db.platformSetting.findUnique({
      where: { settingKey: key },
    });
    const raw = row?.settingValue;
    if (raw !== undefined && raw !== null && `${raw}`.trim() !== "") {
      const parsed = Number(raw);
      if (Number.isFinite(parsed) && parsed >= min) value = Math.floor(parsed);
    }
  } catch {
    // Ayar okunamıyorsa (DB hıçkırığı) oturumları kesmektense varsayılanla
    // devam et; bir sonraki okuma cache TTL'i dolunca yeniden denenir.
    value = fallback;
  }

  cache = { value, readAt: now };
  return value;
}

/** Şimdiden itibaren oturumun biteceği an. */
export function adminSessionExpiryFrom(
  timeoutMinutes: number,
  from: Date = new Date(),
): Date {
  return new Date(from.getTime() + timeoutMinutes * 60_000);
}
