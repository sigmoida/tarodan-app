import {
  BellIcon,
  PaperAirplaneIcon,
  ClockIcon,
  DevicePhoneMobileIcon,
  EnvelopeIcon,
  ChatBubbleLeftRightIcon,
  UsersIcon,
  UserIcon,
  AdjustmentsHorizontalIcon,
} from "@heroicons/react/24/outline";
import { z } from "zod";

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

export type TabType = "send" | "scheduled" | "history";

export const NOTIFICATION_TABS = [
  { key: "send", label: "Bildirim Gönder", icon: PaperAirplaneIcon },
  { key: "scheduled", label: "Zamanlanmış", icon: ClockIcon },
  { key: "history", label: "Geçmiş", icon: BellIcon },
];

export const channelMeta = [
  {
    key: "push",
    label: "Push",
    icon: DevicePhoneMobileIcon,
    desc: "Mobil uygulama",
  },
  {
    key: "email",
    label: "E-posta",
    icon: EnvelopeIcon,
    desc: "E-posta gelen kutusu",
  },
  {
    key: "sms",
    label: "SMS",
    icon: ChatBubbleLeftRightIcon,
    desc: "Kısa mesaj",
  },
] as const;

export const targetMeta = [
  {
    key: "all",
    label: "Tüm Kullanıcılar",
    icon: UsersIcon,
    desc: "Platforma kayıtlı herkes",
  },
  {
    key: "segment",
    label: "Segment",
    icon: AdjustmentsHorizontalIcon,
    desc: "Satıcı/alıcı, üyelik tipi",
  },
  {
    key: "user_ids",
    label: "Belirli Kullanıcılar",
    icon: UserIcon,
    desc: "ID listesiyle hedefleme",
  },
] as const;

export const channelFilterOptions = [
  { value: "all", label: "Tüm Kanallar" },
  { value: "push", label: "Push" },
  { value: "email", label: "Email" },
  { value: "sms", label: "SMS" },
];

export const deliveryFilterOptions = [
  { value: "all", label: "Tüm Durumlar" },
  { value: "pending", label: "Beklemede" },
  { value: "sent", label: "Gönderildi" },
  { value: "delivered", label: "Teslim Edildi" },
  { value: "failed", label: "Başarısız" },
];

export const sendNotificationSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(1, "Başlık zorunludur")
      .max(65, "Başlık en fazla 65 karakter olabilir"),
    body: z
      .string()
      .trim()
      .min(1, "İçerik zorunludur")
      .max(240, "İçerik en fazla 240 karakter olabilir"),
    channels: z
      .array(z.enum(["push", "email", "sms"]))
      .min(1, "En az bir kanal seçin"),
    targetType: z.enum(["all", "segment", "user_ids"]),
    userIds: z.string(),
    isSeller: z.enum(["", "true", "false"]),
    membershipTier: z.enum(["", "free", "premium", "business"]),
  })
  .superRefine((values, ctx) => {
    if (values.targetType === "user_ids" && !values.userIds.trim()) {
      ctx.addIssue({
        code: "custom",
        path: ["userIds"],
        message: "En az bir kullanıcı ID girin",
      });
    }
  });

export const scheduleNotificationSchema = z.object({
  scheduledFor: z.string().min(1, "Gönderim tarihi ve saati zorunludur"),
});

export type SendForm = z.infer<typeof sendNotificationSchema>;
export type ScheduleNotificationForm = z.infer<
  typeof scheduleNotificationSchema
>;

export const emptySendForm: SendForm = {
  title: "",
  body: "",
  channels: ["push"],
  targetType: "all",
  userIds: "",
  isSeller: "",
  membershipTier: "",
};

/** Build the send/schedule API payload from the compose form. */
export function sendFormToPayload(f: SendForm) {
  const userIds =
    f.targetType === "user_ids"
      ? f.userIds
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      : undefined;
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
