import {
  BellIcon,
  CalendarDaysIcon,
  DevicePhoneMobileIcon,
  PaperAirplaneIcon,
  EnvelopeIcon,
  UsersIcon,
  UserIcon,
  AdjustmentsHorizontalIcon,
} from "@heroicons/react/24/outline";
import type { ComponentType } from "react";
import { z } from "zod";
import {
  BROADCAST_EMAIL_HTML_MAX,
  BROADCAST_EMAIL_SUBJECT_MAX,
  MAILING_TYPES,
  broadcastDeliveryChannels,
  isInternalNotificationPath,
  resolveBroadcastInApp,
  type MailingType,
} from "@tarodan/types";
import type { useTranslations } from "next-intl";

type T = ReturnType<typeof useTranslations<never>>;

export interface NotificationLog {
  id: string;
  userId: string;
  channel: string;
  type: string;
  title: string;
  body: string;
  status: string;
  createdAt: string;
  /** `mailingType` her yayın satırında; `hasHtmlEmail` yalnız e-posta satırında. */
  data?: { hasHtmlEmail?: boolean; mailingType?: MailingType } | null;
  user?: { displayName: string; email: string };
}

export interface ScheduledNotification {
  id: string;
  title: string;
  body: string;
  channels: string[];
  targetType: string;
  scheduledFor: string;
  status: string;
  createdAt: string;
  /** API gövdeyi liste yanıtına koymaz; yalnız "HTML e-postası var" bilgisi gelir. */
  hasEmailHtml?: boolean;
  mailingType?: MailingType;
  /** Zil satırı yazılacak mı; kolon öncesi satırlarda yok → API kuralıyla true. */
  inApp?: boolean;
}

export type TabType = "scheduled" | "history";

/**
 * Zamanlanmış satırın gerçek kanalları: teslim kanalları + zil. Zil API ile
 * AYNI kuraldan (`resolveBroadcastInApp`) türetilir — kolon öncesi satırlar
 * (inApp yok) zil yazar.
 */
export function scheduledChannelKeys(
  row: Pick<ScheduledNotification, "channels" | "inApp">,
): string[] {
  const channels = broadcastDeliveryChannels(row.channels ?? []);
  return resolveBroadcastInApp(row) ? [...channels, "in_app"] : channels;
}

// "Oluştur" artık sekme değil: sayfa başlığındaki buton modalı açar.
export const notificationTabs = (t: T) => [
  {
    key: "scheduled",
    label: t("admin.marketing.notifications.tabs.scheduled"),
  },
  {
    key: "history",
    label: t("admin.marketing.notifications.tabs.history"),
  },
];

// SMS bilinçli olarak YOK: backend'de SMS gönderim altyapısı bulunmuyor
// (dağıtım yalnız push + e-posta kuyruklar); çalışmayan kanalı seçtirmek
// yanıltıcıydı. "Uygulama içi (zil)" ayrı kanaldır: API zil satırını yalnız
// bu kanal seçiliyse yazar (`inApp`).
export const NOTIFICATION_CHANNELS = ["push", "in_app", "email"] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

export const channelMeta = (t: T) =>
  [
    {
      key: "push",
      label: t("admin.marketing.notifications.channel.push"),
      icon: DevicePhoneMobileIcon,
      desc: t("admin.marketing.notifications.channel.mobileApp"),
    },
    {
      key: "in_app",
      label: t("admin.marketing.notifications.channel.inApp"),
      icon: BellIcon,
      desc: t("admin.marketing.notifications.channel.inAppDescription"),
    },
    {
      key: "email",
      label: t("admin.marketing.notifications.channel.email"),
      icon: EnvelopeIcon,
      desc: t("admin.marketing.notifications.channel.emailInbox"),
    },
  ] as const satisfies ReadonlyArray<{
    key: NotificationChannel;
    label: string;
    icon: ComponentType<{ className?: string }>;
    desc: string;
  }>;

export const targetMeta = (t: T) =>
  [
    {
      key: "all",
      label: t("admin.marketing.notifications.target.allUsers"),
      icon: UsersIcon,
      desc: t("admin.marketing.notifications.target.everyone"),
    },
    {
      key: "segment",
      label: "Segment",
      icon: AdjustmentsHorizontalIcon,
      desc: t("admin.marketing.notifications.target.segmentDescription"),
    },
    {
      key: "user_ids",
      label: t("admin.marketing.notifications.target.specificUsers"),
      icon: UserIcon,
      desc: t("admin.marketing.notifications.target.idList"),
    },
  ] as const;

export const channelFilterOptions = (t: T) => [
  { value: "all", label: t("admin.marketing.notifications.allChannels") },
  { value: "push", label: "Push" },
  { value: "in_app", label: t("admin.marketing.notifications.channel.inApp") },
  { value: "email", label: "Email" },
  { value: "sms", label: "SMS" },
];

export const deliveryFilterOptions = (t: T) => [
  { value: "all", label: t("admin.marketing.notifications.allStatuses") },
  { value: "pending", label: t("common.pending") },
  { value: "sent", label: t("admin.marketing.notifications.status.sent") },
  {
    value: "delivered",
    label: t("admin.marketing.notifications.status.delivered"),
  },
  { value: "failed", label: t("admin.marketing.notifications.status.failed") },
];

/** Push başlığı / gövdesi sınırları — API önizleme DTO'su ve mobil ile aynı. */
export const PUSH_TITLE_MAX = 65;
export const PUSH_BODY_MAX = 240;

/** Push ya da zil seçili mi — ikisi aynı kısa başlık/gövde/link kartını kullanır. */
export const usesNotificationText = (channels: readonly string[]) =>
  channels.includes("push") || channels.includes("in_app");

export const usesEmail = (channels: readonly string[]) =>
  channels.includes("email");

export const SEND_MODES = ["now", "schedule"] as const;
export type SendMode = (typeof SEND_MODES)[number];

/**
 * Oluşturma formu. Kart alanları (başlık/gövde/link, e-posta konusu/HTML) her
 * zaman formda durur — kanal kapatılıp açılınca yazılan kaybolmasın — ama
 * DOĞRULAMA ve GÖNDERİM yalnız seçili kanalların kartlarını kapsar
 * (superRefine + `sendFormToPayload`).
 */
export const sendNotificationSchema = (t: T) =>
  z
    .object({
      // Sınırlar (min/max) aşağıda superRefine'da: alan düzeyinde kalsalardı
      // gizli bir kartın eski değeri gönderimi sessizce engellerdi.
      channels: z.array(z.enum(NOTIFICATION_CHANNELS)),
      // Duyuru türü TÜM kanalları belirler (push + zil + e-posta): pazarlama
      // yalnız izinlilere gider. Başta seçilmemiştir ("") — yönetici türü her
      // gönderimde açıkça seçer (Apple 4.5.4 / İYS).
      mailingType: z.union([z.literal(""), z.enum(MAILING_TYPES)]),
      title: z.string().trim(),
      body: z.string().trim(),
      // Bildirime dokununca açılacak site içi yol (opsiyonel). İzin listesi
      // API ile ORTAK (`@tarodan/types`); mobil aynı yolu kendi ekranına çevirir.
      link: z.string().trim(),
      emailSubject: z.string().trim(),
      emailHtml: z.string(),
      targetType: z.enum(["all", "segment", "user_ids"]),
      // Seçimler {value: userId, label: görünen ad} olarak taşınır — çipler
      // arama sonuçları değişse de etiketini korur (SearchableMultiSelect).
      users: z.array(z.object({ value: z.string(), label: z.string() })),
      isSeller: z.enum(["", "true", "false"]),
      membershipTier: z.enum(["", "free", "basic", "premium", "business"]),
      sendMode: z.enum(SEND_MODES),
      // datetime-local (yerel saat); yalnız "Zamanla" seçiliyken zorunlu.
      scheduledFor: z.string(),
    })
    .superRefine((values, ctx) => {
      const issue = (path: keyof typeof values, message: string) =>
        ctx.addIssue({ code: "custom", path: [path], message });

      if (values.channels.length === 0) {
        issue(
          "channels",
          t("admin.marketing.notifications.validation.channelRequired"),
        );
      }
      if (!values.mailingType) {
        issue(
          "mailingType",
          t("admin.marketing.notifications.validation.mailingTypeRequired"),
        );
      }
      if (usesNotificationText(values.channels)) {
        if (!values.title) {
          issue(
            "title",
            t("admin.marketing.notifications.validation.titleRequired"),
          );
        } else if (values.title.length > PUSH_TITLE_MAX) {
          issue(
            "title",
            t("admin.marketing.notifications.validation.titleMax"),
          );
        }
        if (!values.body) {
          issue(
            "body",
            t("admin.marketing.notifications.validation.bodyRequired"),
          );
        } else if (values.body.length > PUSH_BODY_MAX) {
          issue("body", t("admin.marketing.notifications.validation.bodyMax"));
        }
        if (values.link && !isInternalNotificationPath(values.link)) {
          issue(
            "link",
            t("admin.marketing.notifications.validation.linkInvalid"),
          );
        }
      }
      if (usesEmail(values.channels)) {
        if (!values.emailSubject) {
          issue(
            "emailSubject",
            t("admin.marketing.notifications.validation.emailSubjectRequired"),
          );
        } else if (values.emailSubject.length > BROADCAST_EMAIL_SUBJECT_MAX) {
          issue(
            "emailSubject",
            t("admin.marketing.notifications.validation.emailSubjectMax"),
          );
        }
        if (!values.emailHtml.trim()) {
          issue(
            "emailHtml",
            t("admin.marketing.notifications.validation.emailHtmlRequired"),
          );
        } else if (values.emailHtml.length > BROADCAST_EMAIL_HTML_MAX) {
          issue(
            "emailHtml",
            t("admin.marketing.notifications.validation.emailHtmlMax"),
          );
        }
      }
      if (values.targetType === "user_ids" && values.users.length === 0) {
        issue(
          "users",
          t("admin.marketing.notifications.validation.userIdRequired"),
        );
      }
      if (values.sendMode === "schedule") {
        if (!values.scheduledFor) {
          issue(
            "scheduledFor",
            t("admin.marketing.notifications.validation.scheduleRequired"),
          );
        } else if (!(new Date(values.scheduledFor).getTime() > Date.now())) {
          // Saat dahil GELECEK olmalı: takvimin min'i yalnız tarihi sınırlar.
          // datetime-local yerel saattir, new Date(v) de yerel yorumlar.
          issue(
            "scheduledFor",
            t("admin.marketing.notifications.validation.scheduleFuture"),
          );
        }
      }
    });

export type SendForm = z.infer<ReturnType<typeof sendNotificationSchema>>;

export const emptySendForm: SendForm = {
  // Varsayılan eski davranış: push + zil (eskiden zil her gönderimde yazılırdı).
  channels: ["push", "in_app"],
  // Varsayılan YOK: tür açıkça seçilmeden gönderilemez.
  mailingType: "",
  title: "",
  body: "",
  link: "",
  emailSubject: "",
  emailHtml: "",
  targetType: "all",
  users: [],
  isSeller: "",
  membershipTier: "",
  sendMode: "now",
  scheduledFor: "",
};

/** Hedef seçimini API'nin `targetType`/`userIds`/`segmentCriteria` alanlarına çevirir. */
export function audienceFromForm(f: SendForm) {
  const userIds =
    f.targetType === "user_ids" ? f.users.map((u) => u.value) : undefined;
  const segmentCriteria =
    f.targetType === "segment"
      ? {
          ...(f.isSeller ? { isSeller: f.isSeller === "true" } : {}),
          ...(f.membershipTier ? { membershipTier: f.membershipTier } : {}),
        }
      : undefined;
  return { targetType: f.targetType, userIds, segmentCriteria };
}

/** Seçili tür; seçilmemişse (`""`) alan hiç gönderilmez. */
export function mailingTypeFromForm(
  f: Pick<SendForm, "mailingType">,
): MailingType | undefined {
  return f.mailingType || undefined;
}

/** E-posta kanalı seçiliyse e-postaya özel alanlar; değilse hiçbiri gönderilmez. */
export function emailFieldsFromForm(f: SendForm) {
  if (!usesEmail(f.channels)) return {};
  return {
    emailSubject: f.emailSubject.trim(),
    emailHtml: f.emailHtml,
  };
}

/**
 * Hedef link verildiyse `data.link` (push payload'ı + zil satırı; mobil ve web
 * aynı yolu çözer). Boşsa ya da push/zil seçili değilse `data` gönderilmez.
 */
export function linkDataFromForm(f: SendForm) {
  const link = f.link.trim();
  return link && usesNotificationText(f.channels) ? { data: { link } } : {};
}

const HTML_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

/**
 * HTML'den düz metin (yalnız geçmiş satırının kısa gövdesi için; render
 * edilmez). Stil/script blokları atılır, etiketler boşluğa döner.
 */
export function htmlToPlainText(html: string): string {
  return html
    .replace(/<(style|script|head)[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity: string) => {
      if (entity.startsWith("#")) {
        const hex = entity[1] === "x" || entity[1] === "X";
        const code = Number.parseInt(entity.slice(hex ? 2 : 1), hex ? 16 : 10);
        // Geçersiz kod noktası (vekil aralığı, > U+10FFFF) render sırasında
        // fromCodePoint'i fırlatırdı: olduğu gibi bırakılır.
        const valid =
          Number.isInteger(code) &&
          code > 0 &&
          code <= 0x10ffff &&
          (code < 0xd800 || code > 0xdfff);
        return valid ? String.fromCodePoint(code) : match;
      }
      return HTML_ENTITIES[entity.toLowerCase()] ?? match;
    })
    .replace(/\s+/g, " ")
    .trim();
}

const clip = (value: string, max: number) =>
  value.length > max ? `${value.slice(0, max - 1).trimEnd()}…` : value;

/**
 * API'nin zorunlu `title`/`body` alanları. Push/zil seçiliyse kartın metni;
 * yalnız e-postada push kartı gizlidir ve değerleri GÖNDERİLMEZ — yerine
 * e-posta konusu ve HTML'in düz metni gider (geçmiş satırının başlığı/özeti;
 * HTML verildiği için e-posta gövdesinde kullanılmaz).
 */
export function notificationTextFromForm(
  f: Pick<
    SendForm,
    "channels" | "title" | "body" | "emailSubject" | "emailHtml"
  >,
) {
  if (usesNotificationText(f.channels)) {
    return { title: f.title.trim(), body: f.body.trim() };
  }
  const subject = f.emailSubject.trim();
  // Yalnız görselden oluşan HTML'in düz metni boştur: özet konuya düşer.
  const text = htmlToPlainText(f.emailHtml) || subject;
  return {
    title: clip(subject, PUSH_TITLE_MAX),
    body: clip(text, PUSH_BODY_MAX),
  };
}

/** Build the send API payload from the compose form (only selected channels). */
export function sendFormToPayload(f: SendForm) {
  return {
    ...notificationTextFromForm(f),
    // Yalnız TESLİM kanalları; zilin tek sinyali `inApp` (API kuralı
    // `resolveBroadcastInApp`, `@tarodan/types`). false iken zil satırı yazılmaz.
    channels: NOTIFICATION_CHANNELS.filter(
      (c) => c !== "in_app" && f.channels.includes(c),
    ),
    inApp: f.channels.includes("in_app"),
    // Tür kanaldan bağımsız gider: yalnız push'ta da pazarlama süzgeci çalışır.
    mailingType: mailingTypeFromForm(f),
    ...audienceFromForm(f),
    ...emailFieldsFromForm(f),
    ...linkDataFromForm(f),
  };
}

/** Zamanlama payload'ı: gönderimle aynı içerik + ISO zaman. */
export function scheduleFormToPayload(f: SendForm) {
  return {
    ...sendFormToPayload(f),
    scheduledFor: new Date(f.scheduledFor).toISOString(),
  };
}

export const mailingTypeOptions = (t: T) =>
  [
    {
      value: "announcement",
      label: t("admin.marketing.notifications.mailingType.announcement"),
      desc: t("admin.marketing.notifications.mailingType.announcementShort"),
    },
    {
      value: "marketing",
      label: t("admin.marketing.notifications.mailingType.marketing"),
      desc: t("admin.marketing.notifications.mailingType.marketingShort"),
    },
  ] satisfies Array<{ value: MailingType; label: string; desc: string }>;

export const sendModeMeta = (t: T) =>
  [
    {
      key: "now",
      label: t("admin.marketing.notifications.sendNow"),
      icon: PaperAirplaneIcon,
      desc: t("admin.marketing.notifications.sendMode.nowDescription"),
    },
    {
      key: "schedule",
      label: t("admin.marketing.notifications.schedule"),
      icon: CalendarDaysIcon,
      desc: t("admin.marketing.notifications.sendMode.scheduleDescription"),
    },
  ] as const satisfies ReadonlyArray<{
    key: SendMode;
    label: string;
    icon: ComponentType<{ className?: string }>;
    desc: string;
  }>;
