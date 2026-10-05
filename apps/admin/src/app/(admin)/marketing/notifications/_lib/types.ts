import {
  DevicePhoneMobileIcon,
  EnvelopeIcon,
  UsersIcon,
  UserIcon,
  AdjustmentsHorizontalIcon,
} from "@heroicons/react/24/outline";
import { z } from "zod";
import {
  BROADCAST_EMAIL_HTML_MAX,
  BROADCAST_EMAIL_SUBJECT_MAX,
  DEFAULT_MAILING_TYPE,
  MAILING_TYPES,
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
  /** E-posta satırlarında: `hasHtmlEmail` (HTML e-posta) + `mailingType`. */
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
}

export type TabType = "scheduled" | "history";

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
// (emitAdminBroadcast yalnız email + push kuyruklar); çalışmayan kanalı
// seçtirmek yanıltıcıydı. SMS sağlayıcısı eklendiğinde buraya geri gelir.
export const channelMeta = (t: T) =>
  [
    {
      key: "push",
      label: "Push",
      icon: DevicePhoneMobileIcon,
      desc: t("admin.marketing.notifications.channel.mobileApp"),
    },
    {
      key: "email",
      label: t("admin.marketing.notifications.channel.email"),
      icon: EnvelopeIcon,
      desc: t("admin.marketing.notifications.channel.emailInbox"),
    },
  ] as const;

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

export const sendNotificationSchema = (t: T) =>
  z
    .object({
      title: z
        .string()
        .trim()
        .min(1, t("admin.marketing.notifications.validation.titleRequired"))
        .max(65, t("admin.marketing.notifications.validation.titleMax")),
      body: z
        .string()
        .trim()
        .min(1, t("admin.marketing.notifications.validation.bodyRequired"))
        .max(240, t("admin.marketing.notifications.validation.bodyMax")),
      channels: z
        .array(z.enum(["push", "email"]))
        .min(1, t("admin.marketing.notifications.validation.channelRequired")),
      // E-posta kanalına özel alanlar — yalnız "email" seçiliyken zorunlu
      // (superRefine); push metni yukarıdaki kısa başlık/gövdede kalır.
      emailSubject: z
        .string()
        .trim()
        .max(
          BROADCAST_EMAIL_SUBJECT_MAX,
          t("admin.marketing.notifications.validation.emailSubjectMax"),
        ),
      emailHtml: z
        .string()
        .max(
          BROADCAST_EMAIL_HTML_MAX,
          t("admin.marketing.notifications.validation.emailHtmlMax"),
        ),
      mailingType: z.enum(MAILING_TYPES),
      targetType: z.enum(["all", "segment", "user_ids"]),
      // Seçimler {value: userId, label: görünen ad} olarak taşınır — çipler
      // arama sonuçları değişse de etiketini korur (SearchableMultiSelect).
      users: z.array(z.object({ value: z.string(), label: z.string() })),
      isSeller: z.enum(["", "true", "false"]),
      membershipTier: z.enum(["", "free", "basic", "premium", "business"]),
    })
    .superRefine((values, ctx) => {
      if (values.targetType === "user_ids" && values.users.length === 0) {
        ctx.addIssue({
          code: "custom",
          path: ["users"],
          message: t("admin.marketing.notifications.validation.userIdRequired"),
        });
      }
      if (values.channels.includes("email")) {
        if (!values.emailSubject) {
          ctx.addIssue({
            code: "custom",
            path: ["emailSubject"],
            message: t(
              "admin.marketing.notifications.validation.emailSubjectRequired",
            ),
          });
        }
        if (!values.emailHtml.trim()) {
          ctx.addIssue({
            code: "custom",
            path: ["emailHtml"],
            message: t(
              "admin.marketing.notifications.validation.emailHtmlRequired",
            ),
          });
        }
      }
    });

export const scheduleNotificationSchema = (t: T) =>
  z.object({
    scheduledFor: z
      .string()
      .min(1, t("admin.marketing.notifications.validation.scheduleRequired"))
      // Saat dahil GELECEK olmalı: takvimin min'i yalnız tarihi sınırlar ve
      // UTC/yerel farkı yüzünden geçmiş seçilebiliyordu — backend 400
      // dönüyor, kullanıcı genel hata görüyordu. datetime-local yerel saattir,
      // new Date(v) de yerel yorumlar; karşılaştırma tutarlı.
      .refine(
        (v) => new Date(v).getTime() > Date.now(),
        t("admin.marketing.notifications.validation.scheduleFuture"),
      ),
  });

export type SendForm = z.infer<ReturnType<typeof sendNotificationSchema>>;
export type ScheduleNotificationForm = z.infer<
  ReturnType<typeof scheduleNotificationSchema>
>;

export const emptySendForm: SendForm = {
  title: "",
  body: "",
  channels: ["push"],
  emailSubject: "",
  emailHtml: "",
  // Varsayılan duyuru: eski davranış (herkese) sessizce değişmez.
  mailingType: DEFAULT_MAILING_TYPE,
  targetType: "all",
  users: [],
  isSeller: "",
  membershipTier: "",
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

/** E-posta kanalı seçiliyse e-postaya özel alanlar; değilse hiçbiri gönderilmez. */
export function emailFieldsFromForm(f: SendForm) {
  if (!f.channels.includes("email")) return {};
  return {
    emailSubject: f.emailSubject,
    emailHtml: f.emailHtml,
    mailingType: f.mailingType,
  };
}

/** Build the send/schedule API payload from the compose form. */
export function sendFormToPayload(f: SendForm) {
  return {
    title: f.title,
    body: f.body,
    channels: f.channels,
    ...audienceFromForm(f),
    ...emailFieldsFromForm(f),
  };
}

export const mailingTypeOptions = (t: T) =>
  [
    {
      value: "announcement",
      label: t("admin.marketing.notifications.mailingType.announcement"),
    },
    {
      value: "marketing",
      label: t("admin.marketing.notifications.mailingType.marketing"),
    },
  ] satisfies Array<{ value: MailingType; label: string }>;
