import { useQuery } from "@tanstack/react-query";
import { adminApi } from "@/lib/api";
import { adminKeys } from "@/lib/query/keys";
import { DEFAULT_PSP_FEE_RATE, readPspFeeRate } from "@/lib/settings";

/**
 * PSP (PayTR) kesinti oranı (%) — hak ediş şelalesinin PayTR satırı bundan
 * hesaplanır. Ayar sayfasıyla AYNI query key VE AYNI queryFn şekli (ham yanıt)
 * kullanılır; dönüşüm `select`tedir. Şekiller ayrışsaydı cache'i kim önce
 * doldurursa diğeri yanlış şekli okurdu (oran hep varsayılana düşerdi ya da
 * ayarlar formu ham diziyle seed'lenirdi). Oran önbellekteyse ek istek atılmaz,
 * ayar kaydedilince de (invalidate) ekranlar birlikte tazelenir.
 *
 * Yalnız GÖSTERİM içindir; tahsilat/payout akışlarında kullanılmaz.
 */
export function usePspFeeRate(): number {
  const { data } = useQuery({
    queryKey: adminKeys.all("platform-settings"),
    queryFn: async () => {
      const response = await adminApi.getSettings();
      return response.data?.data ?? response.data ?? [];
    },
    select: readPspFeeRate,
  });

  return data ?? DEFAULT_PSP_FEE_RATE;
}
