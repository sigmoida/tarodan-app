import {
  enumLabel,
  notificationChannelConfig,
  deliveryStatusConfig,
} from "@tarodan/ui";
import type { MailingType } from "@tarodan/types";
import { COL_SIZE, COL_WIDTH, col, TableBadge } from "@/components/table";
import { scheduledRowMenu } from "./rowActions";
import {
  scheduledChannelKeys,
  type NotificationLog,
  type ScheduledNotification,
} from "./types";
import type { useTranslations } from "next-intl";
import { statusConfig } from "@/lib/statusLabels";

type T = ReturnType<typeof useTranslations<never>>;

/**
 * "HTML e-postası var" ve "pazarlama" rozetleri — geçmiş ve zamanlanmış liste
 * aynı görünümü kullanır (HTML'in kendisi tabloda gösterilmez). Durum değil
 * içerik etiketi oldukları için ikisi de çerçeve (outline) rozet.
 */
function EmailContentBadges({
  hasHtml,
  mailingType,
  t,
}: {
  hasHtml?: boolean;
  mailingType?: MailingType;
  t: T;
}) {
  if (!hasHtml && mailingType !== "marketing") return null;
  return (
    <span className="inline-flex min-w-0 gap-1">
      {hasHtml && (
        <TableBadge variant="outline">
          {t("admin.marketing.notifications.htmlEmailBadge")}
        </TableBadge>
      )}
      {mailingType === "marketing" && (
        <TableBadge variant="outline">
          {t("admin.marketing.notifications.mailingType.marketing")}
        </TableBadge>
      )}
    </span>
  );
}

export const historyColumns = (t: T) => [
  col.user<NotificationLog>(
    t("common.user"),
    (n) => ({
      name: n.user?.displayName || n.userId,
      secondary: n.user?.email,
      href: n.userId ? `/accounts/users/${n.userId}` : undefined,
    }),
    { sortKey: "user.displayName", sortType: "text" },
  ),
  col.muted<NotificationLog>(
    t("admin.marketing.notifications.channelLabel"),
    (n) => enumLabel(statusConfig(notificationChannelConfig, t), n.channel),
    { ...COL_SIZE.label, sortKey: "channel", sortType: "text" },
  ),
  col.text<NotificationLog>(t("common.title"), "title"),
  col.badge<NotificationLog>(
    t("admin.marketing.notifications.contentColumn"),
    (n) => (
      <EmailContentBadges
        hasHtml={n.data?.hasHtmlEmail}
        mailingType={n.data?.mailingType}
        t={t}
      />
    ),
    COL_SIZE.badgeGroup,
  ),
  col.status<NotificationLog>(
    t("common.status"),
    (n) => ({
      status: n.status,
      config: statusConfig(deliveryStatusConfig, t),
    }),
    { sortKey: "status", sortType: "text" },
  ),
  col.date<NotificationLog>(t("common.date"), "createdAt", COL_SIZE.date),
];

export function scheduledColumns(onCancel: (id: string) => void, t: T) {
  return [
    col.title<ScheduledNotification>(
      t("common.title"),
      (n) => ({ title: n.title }),
      { sortKey: "title", sortType: "text" },
    ),
    col.muted<ScheduledNotification>(
      t("admin.marketing.notifications.channels"),
      (n) =>
        scheduledChannelKeys(n)
          .map((c) => enumLabel(statusConfig(notificationChannelConfig, t), c))
          .join(", "),
      { minWidth: COL_WIDTH.text, sortKey: "channels", sortType: "text" },
    ),
    col.muted<ScheduledNotification>(
      t("admin.marketing.notifications.targetLabel"),
      "targetType",
      COL_SIZE.label,
    ),
    col.badge<ScheduledNotification>(
      t("admin.marketing.notifications.contentColumn"),
      (n) => (
        <EmailContentBadges
          hasHtml={n.hasEmailHtml}
          mailingType={n.mailingType}
          t={t}
        />
      ),
      COL_SIZE.badgeGroup,
    ),
    col.date<ScheduledNotification>(
      t("common.date"),
      "scheduledFor",
      COL_SIZE.date,
    ),
    col.status<ScheduledNotification>(
      t("common.status"),
      (n) => ({
        status: n.status,
        config: statusConfig(deliveryStatusConfig, t),
      }),
      { sortKey: "status", sortType: "text" },
    ),
    col.rowMenu<ScheduledNotification>(scheduledRowMenu(onCancel, t)),
  ];
}
