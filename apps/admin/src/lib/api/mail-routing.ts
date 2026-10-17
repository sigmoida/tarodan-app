import { api } from "./client";
import type {
  MailAreaUpdate,
  MailSenderAccountInput,
  MailSenderAccountPatch,
} from "./mail-routing.types";

/**
 * Mail routing (Sistem → E-posta Yönlendirme): gönderen hesaplar, alan
 * eşlemesi ve iç bildirimler. Uçlar yalnız super_admin'e açıktır.
 */
export const mailRoutingApi = {
  getMailRouting: () => api.get("/admin/mail-routing"),
  createMailAccount: (data: MailSenderAccountInput) =>
    api.post("/admin/mail-routing/accounts", data),
  updateMailAccount: (id: string, data: MailSenderAccountPatch) =>
    api.patch(`/admin/mail-routing/accounts/${id}`, data),
  deleteMailAccount: (id: string) =>
    api.delete(`/admin/mail-routing/accounts/${id}`),
  testMailAccount: (id: string, to: string) =>
    api.post(`/admin/mail-routing/accounts/${id}/test`, { to }),
  updateMailArea: (areaId: string, data: MailAreaUpdate) =>
    api.patch(`/admin/mail-routing/areas/${areaId}`, data),
};
