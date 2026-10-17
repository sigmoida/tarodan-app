/**
 * İSTEMCİ POLİTİKA SÜRELERİ — `GET /timing-rules` yanıtının tek okuma kuralı.
 *
 * Ön yüzler (web, admin) "iade için N gününüz var", "ödeme süresi N saat" gibi
 * metinleri sabit sayıyla değil bu değerlerle basar. Uç yüklenene ya da
 * ulaşılamayana kadar geri düşüş değerleri kullanılır: kayıt varsayılanları, iki
 * kimlikte (`returnWindowDays`, `payoutGraceDays`) `@tarodan/shared` sabitleri.
 * Geri düşüş otoriter değildir — yalnız ekran boş/yanlış sayıyla kalmasın diye.
 *
 * Ayrıştırma kasıtlı bağışıktır: eksik, sayı olmayan ya da 1'den küçük kayıt
 * yalnız KENDİ kimliği için geri düşer; kalan kimlikler sunucudan gelen değerle
 * kalır (yarım bir yanıt bütün ekranı varsayılana çevirmez).
 */
import {
  PUBLIC_TIMING_RULE_IDS,
  TIMING_RULES,
  type PublicTimingPolicy,
  type PublicTimingRuleId,
} from "./timing-rules";

/** Kimlik başına geri düşüş (gün/saat/dk — kaydın kendi biriminde). */
export type TimingPolicyFallbacks = Partial<Record<PublicTimingRuleId, number>>;

/** ICU parametreleri: kayıt kimliği = parametre adı (`{returnWindowDays}`). */
export type TimingMessageValues = Record<PublicTimingRuleId, number>;

/** Kayıt varsayılanları; `overrides` (ör. `@tarodan/shared` sabitleri) önceliklidir. */
export function fallbackTimingPolicy(
  overrides: TimingPolicyFallbacks = {},
): PublicTimingPolicy {
  return Object.fromEntries(
    PUBLIC_TIMING_RULE_IDS.map((id) => [
      id,
      {
        value: overrides[id] ?? TIMING_RULES[id].default,
        unit: TIMING_RULES[id].unit,
      },
    ]),
  ) as PublicTimingPolicy;
}

function readValue(entry: unknown): number | null {
  const raw = (entry as { value?: unknown } | null | undefined)?.value;
  return typeof raw === "number" && Number.isFinite(raw) && raw >= 1
    ? Math.floor(raw)
    : null;
}

/**
 * Uç yanıtını politikaya çevirir; geçersiz/eksik her kimlik `fallback`'ten gelir.
 * Birim her zaman kayıttan okunur (yanıtın birimine güvenilmez).
 */
export function parseTimingPolicy(
  payload: unknown,
  fallback: PublicTimingPolicy,
): PublicTimingPolicy {
  const source =
    payload && typeof payload === "object"
      ? (payload as Record<string, unknown>)
      : {};
  return Object.fromEntries(
    PUBLIC_TIMING_RULE_IDS.map((id) => [
      id,
      {
        value: readValue(source[id]) ?? fallback[id].value,
        unit: TIMING_RULES[id].unit,
      },
    ]),
  ) as PublicTimingPolicy;
}

/**
 * Yükleyiciyi çalıştırır; hata (ağ, 5xx, bozuk gövde) politikayı `fallback`'e
 * çevirir — ekran süre yüzünden kırılmaz.
 */
export async function loadTimingPolicy(
  load: () => Promise<unknown>,
  fallback: PublicTimingPolicy,
): Promise<PublicTimingPolicy> {
  try {
    return parseTimingPolicy(await load(), fallback);
  } catch {
    return fallback;
  }
}

/** Politikadan ICU parametreleri: `t(key, timingMessageValues(policy))`. */
export function timingMessageValues(
  policy: PublicTimingPolicy,
): TimingMessageValues {
  return Object.fromEntries(
    PUBLIC_TIMING_RULE_IDS.map((id) => [id, policy[id].value]),
  ) as TimingMessageValues;
}
