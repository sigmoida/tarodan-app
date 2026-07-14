/** @format */

"use client";

import { api } from "@/lib/api";
import { useLocale, useTranslations } from "next-intl";
import { useWebList } from "@/hooks/useWebResource";
import { useWebMutation } from "@/hooks/useWebMutation";
import type { Notification } from "../_lib/notifications";

const RESOURCE = "notifications";
/** Header bell counters that must refresh alongside the list. */
const UNREAD_COUNT_RESOURCE = "notifications-unread-count";
const BELL_RESOURCE = "notifications-bell";

const NOTIFICATION_INVALIDATES = [
  RESOURCE,
  UNREAD_COUNT_RESOURCE,
  BELL_RESOURCE,
];

/**
 * Notifications list + read mutations. Replaces the page's inline `useQuery` and
 * hand-rolled `api.patch`/`api.post` calls; both mutations invalidate the list
 * and the header bell counters.
 */
export function useNotifications(enabled: boolean) {
  const t = useTranslations();
  const locale = useLocale();

  const query = useWebList<Notification[]>({
    resource: RESOURCE,
    fetcher: async () => {
      const response = await api.get("/notifications", {
        params: { page: 1, limit: 100 },
      });
      return response.data.notifications || response.data.data || [];
    },
    enabled,
    query: { meta: { page: "notifications" } },
  });

  const markRead = useWebMutation(
    (id: string) => api.patch(`/notifications/${id}/read`),
    { invalidates: NOTIFICATION_INVALIDATES },
  );

  const markAllRead = useWebMutation(
    () => api.post("/notifications/mark-all-read"),
    {
      invalidates: NOTIFICATION_INVALIDATES,
      successMessage:
        locale === "en"
          ? "All marked as read"
          : "Tümü okundu olarak işaretlendi",
      errorMessage: t("common.operationFailed"),
    },
  );

  return {
    notifications: query.data ?? [],
    isLoading: query.isLoading,
    markRead: (id: string) => markRead.mutate(id),
    markAllRead: () => markAllRead.mutate(),
  };
}
