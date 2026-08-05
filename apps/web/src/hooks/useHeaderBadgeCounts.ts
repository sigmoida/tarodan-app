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

/**
 * Okunmamış mesaj sayısı — uygulamadaki TEK kaynak.
 *
 * Aynı sayı üç ayrı sorgu anahtarından hesaplanıyordu (header rozeti, profil
 * menüsü ve mesajlar ekranı). Anahtarlar ayrı olduğu için biri tazelenince
 * diğerleri bayat kalıyor, bir mesaj okunduğunda rozet ancak 5 dakikalık yoklama
 * ya da yeni bir soket olayıyla düşüyordu.
 *
 * Sayı ayrıca thread listesinin İLK SAYFASINDAKİ `unreadCount` değerlerinin
 * toplamıydı; 20'den fazla sohbeti olan kullanıcıda eksik çıkıyordu. Artık
 * sayfalamadan bağımsız adanmış uçtan okunur.
 */
export function useUnreadMessageCount(enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.messages.unreadCount(),
    queryFn: async () => {
      const response = await messagesApi.getUnreadCount();
      return Number(response.data?.count ?? 0);
    },
    enabled,
    ...sharedCountQueryOptions,
    meta: { page: "global-message-count" },
  });
}

export function useHeaderBadgeCounts(enabled: boolean) {
  const unreadMessages = useUnreadMessageCount(enabled);

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
