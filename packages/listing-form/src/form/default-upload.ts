/** @format */

import type { ListingFormApi } from "./api-context";
import type { UploadPort } from "./listing-upload-queue";
import type { Translate } from "./translate";

/**
 * Üretim portu: tek dosya, ilerleme ve iptal destekli.
 *
 * Gelen dosya zaten HAZIRDIR: tarayıcıda küçültme kuyruğun hazırlık adımında
 * (`PreparePort` → `downscaleImageFile`) yapılır. Böylece önizleme
 * (`itemFromFile`) orijinal dosyadan ANINDA üretilmeye devam eder, kuyruk
 * eşzamanlılık sınırı küçültmeyi de kapsar ve yeniden deneme hazırlanmış
 * dosyayı tekrar küçültmeden yükler.
 *
 * Hata metni karoda AYNEN gösterildiği için çeviriciyi dışarıdan alır; sabit
 * Türkçe bir mesaj `/en` kullanıcısına da Türkçe düşerdi.
 */
export const createDefaultUpload =
  (t: Translate, api: ListingFormApi): UploadPort =>
  async (file, { signal, onProgress }) => {
    const result = await api.uploadProductImage(file, { signal, onProgress });
    if (!result?.cardKey || !result?.detailKey) {
      throw new Error(t("product.imageUpload.noServerResult"));
    }
    return { cardKey: result.cardKey, detailKey: result.detailKey };
  };
