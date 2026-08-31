/** @format */

"use client";

import type { ListingFormApi } from "@tarodan/listing-form";
import { api, mediaApi } from "@/lib/api";

/**
 * İlan formunun vitrin tarafındaki portu.
 *
 * İstekler satıcı oturumuyla web'in kendi `/gateway` proxy'sinden geçer; token
 * httpOnly cookie'de durur ve JS onu hiç görmez. Paket bu ayrıntıyı bilmez.
 */
export const webListingFormApi: ListingFormApi = {
  async get<T>(path: string, params?: Record<string, unknown>) {
    const res = await api.get(path, params ? { params } : undefined);
    return res.data as T;
  },
  async uploadProductImage(file, options) {
    const response = await mediaApi.uploadProductImage(file, options);
    const [result] = response.data ?? [];
    return { cardKey: result?.cardKey, detailKey: result?.detailKey };
  },
  async rotateProductImage(detailKey) {
    const { data } = await mediaApi.rotateProductImage(detailKey);
    return {
      cardKey: data.cardKey,
      detailKey: data.detailKey,
      cardUrl: data.cardUrl,
    };
  },
};
