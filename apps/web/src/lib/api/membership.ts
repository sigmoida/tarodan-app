import { api } from "./client";

// Membership
export type SavedCard = {
  id: string;
  last4: string;
  brand: string | null;
  expMonth: string | null;
  expYear: string | null;
  requireCvv: boolean;
  isDefault: boolean;
  autoRenewEligible: boolean;
  createdAt: string;
};

export const membershipApi = {
  getTiers: () => api.get("/membership/tiers"),
  getCurrentMembership: () => api.get("/membership/me"),
  getLimits: () => api.get("/membership/me/limits"),
  subscribe: (data: {
    tierType: string;
    billingPeriod: "monthly" | "yearly";
  }) => api.post("/membership/subscribe", data),
  cancel: () => api.post("/membership/cancel"),
  /** Bekleyen plan değişikliğini (ertelemeli downgrade / period) geri al */
  cancelScheduledChange: () => api.post("/membership/cancel-scheduled-change"),
  /** Oto-yenilemeyi aç/kapat */
  setAutoRenew: (autoRenew: boolean) =>
    api.patch("/membership/auto-renew", { autoRenew }),
  /** Kayıtlı kartları listele (maskeli; PAN/CVV içermez) */
  listCards: () => api.get<SavedCard[]>("/membership/cards"),
  /** Kayıtlı kartı sil (PayTR'dan da silinir) */
  deleteCard: (id: string) =>
    api.delete<{ deleted: boolean }>(`/membership/cards/${id}`),
};
