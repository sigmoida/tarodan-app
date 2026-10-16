/** @format */

import type { ListingFormApi } from "./api-context";
import type { UploadPort } from "./listing-upload-queue";
import { downscaleImageFile } from "./resize-image";
import type { Translate } from "./translate";

/**
 * Üretim portu: tek dosya, ilerleme ve iptal destekli.
 *
 * Dosya ağa çıkmadan önce tarayıcıda küçültülür (`downscaleImageFile`). Adım
 * kuyruğun içindeki bu portta durur: önizleme (`itemFromFile`) orijinal
 * dosyadan ANINDA üretilmeye devam eder, kuyruk eşzamanlılık sınırı küçültmeyi
 * de kapsar (aynı anda 3'ten fazla büyük bitmap çözülmez) ve yeniden deneme /
 * çevirme akışları aynı yolu otomatik kullanır.
 *
 * Hata metni karoda AYNEN gösterildiği için çeviriciyi dışarıdan alır; sabit
 * Türkçe bir mesaj `/en` kullanıcısına da Türkçe düşerdi.
 */
export const createDefaultUpload =
  (t: Translate, api: ListingFormApi): UploadPort =>
  async (file, { signal, onProgress }) => {
    const prepared = await downscaleImageFile(file);
    // Küçültme sürerken iptal edildiyse (kalem kaldırıldı) istek hiç başlamasın.
    if (signal.aborted) {
      throw Object.assign(new Error("aborted"), { name: "AbortError" });
    }
    const result = await api.uploadProductImage(prepared, {
      signal,
      onProgress,
    });
    if (!result?.cardKey || !result?.detailKey) {
      throw new Error(t("product.imageUpload.noServerResult"));
    }
    return { cardKey: result.cardKey, detailKey: result.detailKey };
  };
