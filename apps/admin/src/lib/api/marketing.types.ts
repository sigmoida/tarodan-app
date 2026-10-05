import type { MailingType } from "@tarodan/types";

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
  channels: string[];
  targetType: "all" | "segment" | "user_ids";
  userIds?: string[];
  segmentCriteria?: Record<string, any>;
  data?: Record<string, any>;
  emailSubject?: string;
  emailHtml?: string;
  mailingType?: MailingType;
}
