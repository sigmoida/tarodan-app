import { api } from "./client";

/**
 * Hakediş ekranının Excel dökümleri. Her sekme kendi listesinin ucunu çağırır
 * ve aynı liste parametrelerini (filtre + arama + sıralama) taşır; yanıt
 * `.xlsx` gövdesidir (`responseType: "blob"`).
 */
export const payoutExportsApi = {
  /** Escrow hold'ları (Hakedişler sekmesi). */
  exportPayoutHolds: (params?: Record<string, unknown>) =>
    api.get("/admin/payouts/export", { params, responseType: "blob" }),
  /** Banka transferleri (Transferler sekmesi). */
  exportPayoutTransfers: (params?: Record<string, unknown>) =>
    api.get("/admin/payouts/transfers/export", {
      params,
      responseType: "blob",
    }),
};
