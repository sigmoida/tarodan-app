import {
  TIMING_RULES,
  type TimingExpiryAction,
  type TimingRuleId,
} from "@tarodan/types";

/**
 * Kayıttaki bir eylemi test süresince "henüz kapalı" yapar.
 *
 * Tüm paketler birleştikten sonra kayıtta kapalı eylem kalmadı; ama
 * `available: false` mekanizması (okuma katmanı uygulamaz, yazma yolu reddeder,
 * admin seçicisi pasif gösterir) ileride eklenecek eylemler için yerinde
 * duruyor. Bu yardımcı o yolu gerçek bir kayıt üzerinden sınar ve bayrağı her
 * durumda geri açar.
 */
export async function withActionUnavailable<T>(
  id: TimingRuleId,
  action: TimingExpiryAction,
  run: () => T | Promise<T>,
): Promise<T> {
  const option = (
    TIMING_RULES[id].actions as { action: string; available: boolean }[]
  ).find((candidate) => candidate.action === action);
  if (!option) throw new Error(`${id} kaydında ${action} eylemi yok`);
  option.available = false;
  try {
    return await run();
  } finally {
    option.available = true;
  }
}
