import { api } from "./client";
import type { InvoicingSettingsPayload } from "./invoicing-settings.types";

/**
 * Faturalama Ayarları: Netsis cari/seri/hizmet kartı kodları, hazırlık durumu,
 * etkin sağlayıcı ve bağlantı testi. API segmenti `invoicing` → `settings` izni.
 */
export const invoicingSettingsApi = {
  getInvoicingSettings: () => api.get("/admin/invoicing/settings"),
  updateInvoicingSettings: (data: InvoicingSettingsPayload) =>
    api.put("/admin/invoicing/settings", data),
  pingNetsis: () => api.post("/admin/invoicing/netsis/ping"),
  getNetsisSyncRecords: (params: Record<string, unknown>) =>
    api.get("/admin/invoicing/netsis-sync", { params }),
  retryNetsisSync: (id: string) =>
    api.post(`/admin/invoicing/netsis-sync/${id}/retry`, {}),
};
