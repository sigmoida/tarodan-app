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

export type TabType = "send" | "scheduled" | "history";

export const notificationTabs = (t: T) => [
  {
    key: "send",
    label: t("admin.marketing.notifications.tabs.send"),
    icon: PaperAirplaneIcon,
  },
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
    {
      key: "sms",
      label: "SMS",
      icon: ChatBubbleLeftRightIcon,
      desc: t("admin.marketing.notifications.channel.sms"),
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
        .array(z.enum(["push", "email", "sms"]))
        .min(1, t("admin.marketing.notifications.validation.channelRequired")),
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
