import type { BoostSource, BoostStatus, MailingType } from "@tarodan/types";

/** E-posta kanalına özel alanlar; yalnız "email" kanalı seçiliyse gönderilir. */
export interface BroadcastEmailPreviewPayload {
  title: string;
  body: string;
  emailSubject?: string;
  emailHtml?: string;
  mailingType?: MailingType;
}

export interface NotificationBroadcastPayload {
  title: string;
  body: string;
  /** "push" | "email" | "in_app". */
  channels: string[];
  /**
   * Zil (bildirim kutusu) satırı yazılsın mı. Verilmezse API true sayar
   * (eski davranış); admin formu her zaman açıkça gönderir.
   */
  inApp?: boolean;
  targetType: "all" | "segment" | "user_ids";
  userIds?: string[];
  segmentCriteria?: Record<string, any>;
  data?: Record<string, any>;
  emailSubject?: string;
  emailHtml?: string;
  mailingType?: MailingType;
}

/** `GET /admin/ad-packages/purchases` query; an omitted filter means all. */
export interface BoostPurchaseListParams {
  page?: number;
  limit?: number;
  search?: string;
  packageId?: string;
  status?: BoostStatus;
  source?: BoostSource;
}

/** `POST /admin/ad-packages/purchases/grant` body. */
export interface GrantBoostRequest {
  /** Listing id or listing code. */
  productId: string;
  /** None means search priority only (no showcase). */
  packageId?: string;
  /** `BOOST_GRANT_MIN_DAYS`..`BOOST_GRANT_MAX_DAYS`. */
  durationDays: number;
  reason: string;
}

/** `POST /admin/ad-packages/purchases/:id/refund` body. */
export interface RefundBoostRequest {
  /** TL, at most `refundableAmount`; omitted refunds all of it. */
  amount?: number;
  reason: string;
}
