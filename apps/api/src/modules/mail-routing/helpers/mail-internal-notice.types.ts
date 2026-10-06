import type { MessageKey } from "@tarodan/i18n";
import type { MailInternalEventId } from "@tarodan/types";

/**
 * Personel bildiriminin (iç e-posta) kalıcı girdisi. Outbox satırına ve
 * `mail_internal_notices.payload`a bu şekil yazılır; metin gönderim anında
 * katalogdan üretilir.
 *
 * KİŞİSEL VERİ: kimlik no, IBAN, tam adres ve mesaj gövdesi buraya GİRMEZ —
 * yalnız iş numarası, ad/görünen ad, tutar, durum ve kısa alıntı. Ayrıntı
 * admin panelindedir (`adminPath`).
 */

/** Olgunun etiketi: `server.mailRouting.internal.facts.<label>`. */
export const MAIL_NOTICE_FACT_LABELS = [
  "buyer",
  "seller",
  "user",
  "amount",
  "total",
  "orderCount",
  "productCount",
  "order",
  "product",
  "reason",
  "cancelledBy",
  "requiresReview",
  "initiator",
  "receiver",
  "cashAmount",
  "raisedBy",
  "category",
  "priority",
  "subject",
  "name",
  "email",
  "message",
  "reporter",
  "price",
  "discount",
  "validity",
  "package",
  "duration",
  "status",
] as const;
export type MailNoticeFactLabel = (typeof MAIL_NOTICE_FACT_LABELS)[number];

/**
 * Bir olgu: değer ya düz metin (ad, numara, biçimlenmiş tutar) ya da gönderim
 * anında çevrilecek katalog anahtarı (ör. iptal eden taraf).
 */
export type MailNoticeFact =
  | { label: MailNoticeFactLabel; value: string }
  | { label: MailNoticeFactLabel; valueKey: MessageKey };

/** Toplu olayın satırı (ör. sepetteki siparişler). */
export interface MailNoticeItem {
  ref: string;
  text: string;
  adminPath?: string;
}

export interface MailInternalNoticePayload {
  /** İş numarası (GRP-…, ORD-…, TKS-…): konu satırı ve varsayılan tekilleştirme. */
  ref: string;
  facts: MailNoticeFact[];
  /** Admin paneli yolu ("/operations/orders/<id>"); taban URL gönderimde eklenir. */
  adminPath: string;
  items?: MailNoticeItem[];
  /** Personelin "Yanıtla"sı kime gitsin (misafir mesajında misafir). */
  replyTo?: string;
}

/** `OUTBOX_MAIL_INTERNAL_EVENT` satırının yükü. */
export interface MailInternalOutboxPayload {
  eventId: MailInternalEventId;
  notice: MailInternalNoticePayload;
  occurredAt: string;
}
