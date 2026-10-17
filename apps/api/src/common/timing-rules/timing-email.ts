import { Logger } from "@nestjs/common";
import {
  loadTimingValues,
  type TimingSettingListReader,
  type TimingValues,
} from "./timing-rules.resolver";

const logger = new Logger("TimingEmailData");

/**
 * E-posta şablon verisine GÖNDERİM ANINDA okunan iş sürelerini (`timing`)
 * ekler. Şablon render'ı senkron ve DB'siz (`email-template-renderer`); bu
 * adım DB'yi okuyan tek yerdir. Şablonlar süreyi `emailTimingValue(data, id)` ya
 * da saklı şablonlarda `{{timing.returnWindowDays}}` ile kullanır.
 *
 * Süreler okunamazsa veri olduğu gibi döner: render kayıt varsayılanlarına
 * düşer, e-posta süre yüzünden kaybolmaz. Çağıranın verdiği `timing` alanı
 * (test, önizleme örneği) ezilmez.
 */
export async function withEmailTimingData<T extends Record<string, any>>(
  db: TimingSettingListReader,
  data: T,
): Promise<T & { timing?: TimingValues }> {
  if (data?.timing) return data;
  try {
    return { ...data, timing: await loadTimingValues(db) };
  } catch (err: unknown) {
    logger.warn(
      `süreler okunamadı, şablon varsayılanlarla render edilecek: ${(err as Error)?.message}`,
    );
    return data;
  }
}
