import {
  BellIcon,
  ClockIcon,
  DevicePhoneMobileIcon,
  EnvelopeIcon,
  UsersIcon,
  UserIcon,
  AdjustmentsHorizontalIcon,
} from "@heroicons/react/24/outline";
import { z } from "zod";
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
}

export type TabType = "scheduled" | "history";

// "Oluştur" artık sekme değil: sayfa başlığındaki buton modalı açar.
export const notificationTabs = (t: T) => [
  {
    key: "scheduled",
    label: t("admin.marketing.notifications.tabs.scheduled"),
    icon: ClockIcon,
  },
  {
    key: "history",
    label: t("admin.marketing.notifications.tabs.history"),
    icon: BellIcon,
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
    });

export const scheduleNotificationSchema = (t: T) =>
  z.object({
    scheduledFor: z
      .string()
      .min(1, t("admin.marketing.notifications.validation.scheduleRequired")),
  });

export type SendForm = z.infer<ReturnType<typeof sendNotificationSchema>>;
export type ScheduleNotificationForm = z.infer<
  ReturnType<typeof scheduleNotificationSchema>
>;

export const emptySendForm: SendForm = {
  title: "",
  body: "",
  channels: ["push"],
  targetType: "all",
  users: [],
  isSeller: "",
  membershipTier: "",
};

/** Build the send/schedule API payload from the compose form. */
export function sendFormToPayload(f: SendForm) {
  const userIds =
    f.targetType === "user_ids" ? f.users.map((u) => u.value) : undefined;
  const segmentCriteria =
    f.targetType === "segment"
      ? {
          ...(f.isSeller ? { isSeller: f.isSeller === "true" } : {}),
          ...(f.membershipTier ? { membershipTier: f.membershipTier } : {}),
        }
      : undefined;
  return {
    title: f.title,
    body: f.body,
    channels: f.channels,
    targetType: f.targetType,
    userIds,
    segmentCriteria,
  };
}
