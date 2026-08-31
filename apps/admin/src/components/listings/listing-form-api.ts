/** @format */

"use client";

import type { ListingFormApi } from "@tarodan/listing-form";
import { api } from "@/lib/api/client";

/**
 * İlan formunun yönetici tarafındaki portu.
 *
 * Katalog okumaları vitrindekiyle AYNI public uçlardan gelir — form iki
 * uygulamada da aynı seçenekleri göstermek zorunda. Ayrışan tek şey YÜKLEME:
 * yönetici, ilanın SAHİBİNİN klasörüne yazan yönetici ucunu kullanır, yoksa
 * kaydetme yolundaki sahiplik doğrulaması kendi yüklediği görseli reddederdi.
 */
export function createAdminListingFormApi(productId: string): ListingFormApi {
  return {
    async get<T>(path: string, params?: Record<string, unknown>) {
      const res = await api.get(path, params ? { params } : undefined);
      return res.data as T;
    },
    async uploadProductImage(file, { signal, onProgress }) {
      const body = new FormData();
      body.append("images", file);
      const res = await api.post(`/admin/products/${productId}/images`, body, {
        // Başlık AÇIKÇA geçilmeli: admin istemcisinin varsayılanı
        // `application/json` ve FormData ile ezilmezse multipart boundary hiç
        // kurulmuyor — sunucu gövdeyi ayrıştıramıyor, dosya hiç görünmüyordu.
        headers: { "Content-Type": "multipart/form-data" },
        signal,
        onUploadProgress: (event) => {
          if (!onProgress || !event.total) return;
          onProgress(Math.round((event.loaded * 100) / event.total));
        },
      });
      const [result] = res.data ?? [];
      return { cardKey: result?.cardKey, detailKey: result?.detailKey };
    },
    async rotateProductImage(detailKey) {
      // Yükleme ile aynı sebep: çevirme de ilanın SAHİBİ adına yapılır, o
      // yüzden satıcının `/media/product-image/rotate` ucu değil yönetici ucu.
      const res = await api.post(`/admin/products/${productId}/images/rotate`, {
        detailKey,
      });
      return {
        cardKey: res.data.cardKey,
        detailKey: res.data.detailKey,
        cardUrl: res.data.cardUrl,
      };
    },
  };
}
