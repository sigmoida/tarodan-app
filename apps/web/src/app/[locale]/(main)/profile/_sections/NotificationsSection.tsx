/** @format */

"use client";

import { Toggle } from "@tarodan/ui";
import SectionCard from "@/components/ui/SectionCard";
import { useAuthStore } from "@/stores/authStore";
import {
  useNotificationSettings,
  useUpdateSetting,
  type NotificationSettings,
} from "../_hooks/useNotificationSettings";

const ROWS: { key: keyof NotificationSettings; title: string; desc: string }[] =
  [
    {
      key: "emailNotifications",
      title: "E-posta Bildirimleri",
      desc: "Önemli güncellemeler için e-posta al",
    },
    {
      key: "pushNotifications",
      title: "Anlık Bildirimler",
      desc: "Tarayıcı bildirimleri al",
    },
    {
      key: "orderUpdates",
      title: "Sipariş Güncellemeleri",
      desc: "Sipariş durumu değişikliklerinde bildirim al",
    },
    {
      key: "messageAlerts",
      title: "Mesaj Uyarıları",
      desc: "Yeni mesaj geldiğinde bildirim al",
    },
    {
      key: "priceDropAlerts",
      title: "Fiyat Düşüşü Uyarıları",
      desc: "Favori ürünlerde fiyat düşünce haber ver",
    },
    {
      key: "marketingEmails",
      title: "Pazarlama E-postaları",
      desc: "Kampanya ve fırsatlardan haberdar ol",
    },
  ];

/** Notification toggles — independent query + optimistic per-key patch. */
export default function NotificationsSection() {
  const { isAuthenticated } = useAuthStore();
  const { settings, isLoading } = useNotificationSettings(isAuthenticated);
  const update = useUpdateSetting();

  return (
    <SectionCard title="Bildirim Tercihleri">
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
                <p className="font-medium text-heading">{row.title}</p>
                <p className="text-sm text-muted">{row.desc}</p>
              </div>
              <Toggle
                checked={settings[row.key]}
                onChange={(value) => update.mutate({ key: row.key, value })}
                label={row.title}
              />
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  );
}
