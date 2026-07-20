"use client";

import { useQuery } from "@tanstack/react-query";
import { api, messagesApi, notificationsApi } from "@/lib/api";
import { queryKeys } from "@/lib/query/keys";

const FALLBACK_POLL_INTERVAL = 5 * 60_000;

const sharedCountQueryOptions = {
  staleTime: 60_000,
  refetchInterval: FALLBACK_POLL_INTERVAL,
  refetchIntervalInBackground: false,
} as const;

export function useUnreadNotificationCount(enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.notifications.unreadCount(),
    queryFn: async () => {
      const response = await notificationsApi.getUnreadCount();
      return response.data.count ?? response.data.unreadCount ?? 0;
    },
    enabled,
    ...sharedCountQueryOptions,
    meta: { page: "global-notification-count" },
  });
}

export function useHeaderBadgeCounts(enabled: boolean) {
  const unreadMessages = useQuery({
    queryKey: queryKeys.messages.unreadCount(),
    queryFn: async () => {
      const response = await messagesApi.getThreads();
      const threads = response.data.data || response.data.threads || [];
      return threads.reduce(
        (sum: number, thread: { unreadCount?: number }) =>
          sum + (thread.unreadCount || 0),
        0,
      );
    },
    enabled,
    ...sharedCountQueryOptions,
    meta: { page: "global-message-count" },
  });

  const pendingOffers = useQuery({
    queryKey: queryKeys.offers.pendingCount(),
    queryFn: async () => {
      const response = await api.get("/offers/pending-count");
      return response.data.received || 0;
    },
    enabled,
    ...sharedCountQueryOptions,
    meta: { page: "global-pending-offer-count" },
  });

  const pendingTrades = useQuery({
    queryKey: queryKeys.trades.pendingCount(),
    queryFn: async () => {
      const response = await api.get("/trades/pending-count");
      return response.data.received || 0;
    },
    enabled,
    ...sharedCountQueryOptions,
    meta: { page: "global-pending-trade-count" },
  });

  const unreadNotifications = useUnreadNotificationCount(enabled);

  return {
    unreadMessageCount: enabled ? (unreadMessages.data ?? 0) : 0,
    unreadNotificationsCount: enabled ? (unreadNotifications.data ?? 0) : 0,
    pendingOffersCount: enabled ? (pendingOffers.data ?? 0) : 0,
    pendingTradesCount: enabled ? (pendingTrades.data ?? 0) : 0,
  };
}
