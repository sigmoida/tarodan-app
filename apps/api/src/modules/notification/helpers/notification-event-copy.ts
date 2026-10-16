/**
 * Kuyruk yolu (EventService → push worker) bildirim metinleri.
 *
 * EventService başlık/metni Türkçe SABİT metin olarak kuyruğa yazıyordu; dili
 * İngilizce olan kullanıcı da Türkçe push alıyordu. Artık iş verisi katalog
 * anahtarlarını + değerleri taşır (`copy`) ve worker metni ALICININ dilinde
 * render eder — `createInAppNotification`'ın şablon mekanizmasıyla aynı katalog
 * (`@tarodan/i18n`), ayrı ad alanı: `server.notificationEvent.<ad>`.
 *
 * `title`/`body` varsayılan dilde (tr) yine yazılır: deploy sırasında kuyrukta
 * kalan işler ve eski worker sürümü için yedek. Worker `copy` varsa onu kullanır.
 */
import {
  defaultLocale,
  type Locale,
  type MessageKey,
  type MessageValues,
} from "@tarodan/i18n";
import { translateMessage } from "../../i18n/translate";

export type NotificationEventCopyName =
  | "orderPaidBuyer"
  | "groupOrderPaidBuyer"
  | "orderPaidSeller"
  | "offerReceived"
  | "paymentFailed"
  | "paymentRefundedBuyer"
  | "paymentRefundedSeller"
  | "offerAutoRejected"
  | "tradeAutoCancelled"
  | "tradeReadyForShipping"
  | "tradeWarehouseApproved"
  | "tradeWarehouseRejected"
  | "tradeCancelLocked"
  | "tradeReturnCompleted"
  | "tradeReturnLost"
  | "tradeRefundFailed"
  | "tradeRefundCompleted"
  | "reservationExpired";

/** İş verisindeki katalog referansı (JSON-güvenli değerler). */
export interface QueuedNotificationCopy {
  titleKey: MessageKey;
  messageKey: MessageKey;
  values?: Record<string, string | number>;
}

/** Kuyruğa yazılan metin alanları: yedek düz metin + render edilecek kopya. */
export interface QueuedNotificationText {
  title: string;
  body: string;
  copy: QueuedNotificationCopy;
}

export function notificationEventCopy(
  name: NotificationEventCopyName,
  values?: Record<string, string | number>,
): QueuedNotificationText {
  const titleKey: MessageKey = `server.notificationEvent.${name}.title`;
  const messageKey: MessageKey = `server.notificationEvent.${name}.message`;
  return {
    title: translateMessage(titleKey, defaultLocale, values),
    body: translateMessage(messageKey, defaultLocale, values),
    copy: { titleKey, messageKey, ...(values ? { values } : {}) },
  };
}

/**
 * İşin metnini alıcının dilinde çözer: `copy` varsa katalogdan, yoksa (eski iş
 * ya da yönetici yayını) işin düz `title`/`body`'si.
 */
export function renderQueuedNotificationText(
  job: { title?: string; body?: string; copy?: QueuedNotificationCopy },
  locale: Locale,
): { title: string; body: string } {
  const copy = job.copy;
  if (copy?.titleKey && copy.messageKey) {
    const values = copy.values as MessageValues | undefined;
    return {
      title: translateMessage(copy.titleKey, locale, values),
      body: translateMessage(copy.messageKey, locale, values),
    };
  }
  return { title: job.title ?? "", body: job.body ?? "" };
}
