import { DEFAULT_PSP_FEE_RATE, readPspFeeRate } from "@/lib/settings";
import { usePlatformSettings } from "./usePlatformSettings";

/**
 * PSP (PayTR) kesinti oranı (%) — hak ediş şelalesinin PayTR satırı bundan
 * hesaplanır. Ayar sayfasıyla aynı platform ayarları sorgusunu paylaşır
 * (`usePlatformSettings`); oran önbellekteyse ek istek atılmaz, ayar
 * kaydedilince de (invalidate) ekranlar birlikte tazelenir.
 *
 * Yalnız GÖSTERİM içindir; tahsilat/payout akışlarında kullanılmaz.
 */
export function usePspFeeRate(): number {
  const { data } = usePlatformSettings(readPspFeeRate);
  return data ?? DEFAULT_PSP_FEE_RATE;
}
