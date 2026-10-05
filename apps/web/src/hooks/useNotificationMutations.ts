"use client";

import { useTranslations } from "next-intl";
import { api } from "@/lib/api";
import { useWebMutation } from "@/hooks/useWebMutation";

/** Bildirim listesi + üst bar zil sayaçları; `queryKeys.notifications.*` ile aynı adlar. */
export const NOTIFICATIONS_RESOURCE = "notifications";
const NOTIFICATION_INVALIDATES = [
  NOTIFICATIONS_RESOURCE,
  "notifications-unread-count",
  "notifications-bell",
];

/**
 * Tek bildirimi okundu yapar. Zil ve bildirim sayfası AYNI mutasyonu kullanır;
 * ikisi de liste ile sayaçları birlikte tazeler.
 */
export function useMarkNotificationRead() {
  return useWebMutation(
    (id: string) => api.patch(`/notifications/${id}/read`),
    { invalidates: NOTIFICATION_INVALIDATES },
  );
}

/**
 * Tüm bildirimleri sunucuda okundu yapar (yüklenen 100 değil, hepsi).
 * `silent`: sayfa açılışındaki otomatik işaretleme için başarı toast'ı yok.
 */
export function useMarkAllNotificationsRead({
  silent = false,
}: { silent?: boolean } = {}) {
  const t = useTranslations();
  return useWebMutation(() => api.post("/notifications/mark-all-read"), {
    invalidates: NOTIFICATION_INVALIDATES,
    successMessage: silent ? undefined : t("notification.allRead"),
    errorMessage: t("common.operationFailed"),
  });
}
