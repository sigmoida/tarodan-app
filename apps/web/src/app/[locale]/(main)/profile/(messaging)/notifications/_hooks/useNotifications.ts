/** @format */

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/api";
import { useWebList } from "@/hooks/useWebResource";
import { useUnreadNotificationCount } from "@/hooks/useHeaderBadgeCounts";
import {
  NOTIFICATIONS_RESOURCE,
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
} from "@/hooks/useNotificationMutations";
import {
  collectUnreadIds,
  withUnreadHighlight,
  type Notification,
} from "../_lib/notifications";

const NO_IDS: ReadonlySet<string> = new Set();

/**
 * Notifications list + read mutations.
 *
 * Sayfa açılınca (bir ziyarette BİR kez) sunucudaki tüm bildirimler sessizce
 * okundu yapılır; zil sayacı sıfırlanır. Ziyaret boyunca ekran, açılış anındaki
 * okunmamışları "yeni" göstermeye devam eder (`highlighted`). Okunmamış sayısı
 * ve "tümünü oku" görünürlüğü yüklenen 100 kayıttan değil sunucu sayacından
 * gelir; 100'den eski okunmamışlar olan hesap butonu kaybetmez.
 */
export function useNotifications(enabled: boolean) {
  const query = useWebList<Notification[]>({
    resource: NOTIFICATIONS_RESOURCE,
    fetcher: async () => {
      const response = await api.get("/notifications", {
        params: { page: 1, limit: 100 },
      });
      return response.data.notifications || response.data.data || [];
    },
    enabled,
    query: { meta: { page: "notifications" } },
  });
  const unreadQuery = useUnreadNotificationCount(enabled);
  const serverUnread = unreadQuery.data;

  const { mutate: markReadMutate } = useMarkNotificationRead();
  const { mutate: markAllMutate } = useMarkAllNotificationsRead();
  const { mutate: autoMarkAllMutate } = useMarkAllNotificationsRead({
    silent: true,
  });

  const [highlighted, setHighlighted] = useState<ReadonlySet<string>>(NO_IDS);
  // Ref: strict mode'un çift efekti ve kendi invalidation'ımızın yeniden
  // tetiklemesi otomatik işaretlemeyi ikinci kez başlatamaz.
  const autoMarkStarted = useRef(false);

  const list = query.data;
  const listSettled = query.isSuccess && !query.isFetching;
  const countSettled = unreadQuery.isSuccess && !unreadQuery.isFetching;

  useEffect(() => {
    if (!enabled || autoMarkStarted.current) return;
    // Eski önbellek değil taze liste/sayaç gelsin; yoksa "yeni" kümesi eksik kalır.
    if (!listSettled || !countSettled || !list) return;
    autoMarkStarted.current = true;
    const unreadIds = collectUnreadIds(list);
    if (unreadIds.size === 0 && !serverUnread) return;
    setHighlighted(unreadIds);
    autoMarkAllMutate();
  }, [enabled, listSettled, countSettled, list, serverUnread, autoMarkAllMutate]);

  const notifications = useMemo(
    () => withUnreadHighlight(list ?? [], highlighted),
    [list, highlighted],
  );

  const markRead = useCallback(
    (id: string) => {
      setHighlighted((prev) => {
        if (!prev.has(id)) return prev;
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      markReadMutate(id);
    },
    [markReadMutate],
  );

  const markAllRead = useCallback(
    () => markAllMutate(undefined, { onSuccess: () => setHighlighted(NO_IDS) }),
    [markAllMutate],
  );

  const unreadServerCount = serverUnread ?? 0;

  return {
    notifications,
    isLoading: query.isLoading,
    /** Sunucu sayacı ile ekranda hâlâ "yeni" görünenlerin büyüğü. */
    unreadCount: Math.max(unreadServerCount, highlighted.size),
    /** Buton yalnız sunucuda okunmamış varken görünür. */
    canMarkAllRead: unreadServerCount > 0,
    markRead,
    markAllRead,
  };
}
