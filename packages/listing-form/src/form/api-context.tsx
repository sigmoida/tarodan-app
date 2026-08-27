/** @format */

"use client";

import { createContext, useContext, type ReactNode } from "react";

/**
 * Formun sunucuya açılan TEK kapısı.
 *
 * Kartlar ve hook'lar iki uygulamada da AYNI; ayrışan tek şey isteğin nasıl
 * gönderildiğidir. Web satıcı oturumuyla kendi `/gateway`'inden, admin yönetici
 * oturumuyla kendi `/gateway`'inden AYNI NestJS ucuna gider. Paket bu farkı
 * bilmez: uygulamalar portu verir.
 *
 * Yükleme için ayrı bir uç var çünkü sahiplik farklı çözülür — satıcı kendi
 * klasörüne, yönetici ilanın SAHİBİNİN klasörüne yükler.
 */
export interface ListingFormApi {
  /** Sorgu parametreli GET. Yol, API kökünden görecelidir ("/categories"). */
  get<T = unknown>(path: string, params?: Record<string, unknown>): Promise<T>;
  /** Tek ürün görseli yükler; ilerleme ve iptal destekli. */
  uploadProductImage(
    file: File,
    options: { signal?: AbortSignal; onProgress?: (percent: number) => void },
  ): Promise<{ cardKey: string; detailKey: string }>;
}

const ListingFormApiContext = createContext<ListingFormApi | null>(null);

export function ListingFormApiProvider({
  api,
  children,
}: {
  api: ListingFormApi;
  children: ReactNode;
}) {
  return (
    <ListingFormApiContext.Provider value={api}>
      {children}
    </ListingFormApiContext.Provider>
  );
}

export function useListingFormApi(): ListingFormApi {
  const api = useContext(ListingFormApiContext);
  if (!api) {
    // Sessizce boş liste dönmek yerine patlar: sağlayıcı unutulduğunda form
    // "katalog boş" gibi görünür ve satıcı hiçbir seçenek göremezdi.
    throw new Error(
      "ListingFormApiProvider eksik — ilan formu bir API portu olmadan çalışamaz.",
    );
  }
  return api;
}
