import { useQuery } from "@tanstack/react-query";
import { adminApi } from "@/lib/api";
import { adminKeys } from "@/lib/query/keys";

/** Ham `platform_settings` yanıtı (dizi ya da nesne — bkz. `settingsToMap`). */
async function fetchPlatformSettings(): Promise<unknown> {
  const response = await adminApi.getSettings();
  return response.data?.data ?? response.data ?? [];
}

/**
 * Platform ayarlarını okuyan TEK sorgu. Ham yanıt cache'lenir, her ekran
 * kendi dönüşümünü `select` ile yapar: ayarlar formu, PSP oranı ve yasal
 * ayarlar aynı anahtarı paylaşır. queryFn'ler farklı şekil döndürseydi cache'i
 * kim önce doldurursa diğeri yanlış şekli okurdu — bu yüzden queryFn burada,
 * tek yerde. Bir ayar kaydedilince (`invalidates: ["platform-settings"]`)
 * hepsi birlikte tazelenir.
 *
 * `select` modül düzeyinde (kararlı) bir fonksiyon olmalı; satır içi bir ok
 * fonksiyonu her render'da dönüşümü yeniden çalıştırır.
 */
export function usePlatformSettings<T>(select: (raw: unknown) => T) {
  return useQuery({
    queryKey: adminKeys.all("platform-settings"),
    queryFn: fetchPlatformSettings,
    select,
  });
}
