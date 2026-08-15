/** @format */

"use client";

import { useTranslations } from "next-intl";
import { Toggle } from "@tarodan/ui";
import SectionCard from "@/components/ui/SectionCard";
import { useAuthStore } from "@/stores/authStore";
import {
  useNotificationSettings,
  useUpdateSetting,
  type NotificationSettings,
} from "../_hooks/useNotificationSettings";

/**
 * Satırlar katalog ANAHTARLARINI taşır, metni değil: bu liste modül düzeyinde
 * sabit ve orada hook çağrılamaz.
 */
const ROWS = [
  {
    key: "emailNotifications",
    titleKey: "settings.emailNotifications",
    descKey: "settings.emailNotificationsDesc",
  },
  {
    key: "pushNotifications",
    titleKey: "settings.pushNotificationsTitle",
    descKey: "settings.pushNotificationsDesc",
  },
  {
    key: "orderUpdates",
    titleKey: "settings.orderUpdates",
    descKey: "settings.orderUpdatesDesc",
  },
  {
    key: "messageAlerts",
    titleKey: "settings.messageAlerts",
    descKey: "settings.messageAlertsDesc",
  },
  {
    key: "priceDropAlerts",
    titleKey: "settings.priceDropAlerts",
    descKey: "settings.priceDropAlertsDesc",
  },
  {
    key: "marketingEmails",
    titleKey: "settings.marketingEmails",
    descKey: "settings.marketingEmailsDesc",
  },
] as const satisfies ReadonlyArray<{
  key: keyof NotificationSettings;
  titleKey: string;
  descKey: string;
}>;

/** Notification toggles — independent query + optimistic per-key patch. */
export default function NotificationsSection() {
  const t = useTranslations();
  const { isAuthenticated } = useAuthStore();
  const { settings, isLoading } = useNotificationSettings(isAuthenticated);
  const update = useUpdateSetting();

  return (
    <SectionCard title={t("settings.notificationPreferences")}>
      {isLoading ? (
        <div className="h-40 animate-pulse rounded-lg bg-surface" />
      ) : (
        <div className="divide-y divide-border-subtle">
          {ROWS.map((row) => (
            <div
              key={row.key}
              className="flex items-center justify-between gap-4 py-3"
            >
              <div className="min-w-0">
                <p className="font-medium text-heading">{t(row.titleKey)}</p>
                <p className="text-sm text-muted">{t(row.descKey)}</p>
              </div>
              <Toggle
                checked={settings[row.key]}
                onChange={(value) => update.mutate({ key: row.key, value })}
                label={t(row.titleKey)}
              />
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  );
}
