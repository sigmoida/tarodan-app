import { useState, useCallback } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { notificationsApi } from '@/services/api';
import { useAuthStore } from '@/stores/authStore';
import { toMobileRoute } from '@/utils/notificationRoute';
import type { Notification } from '../_lib/types';
import { routeForNotification } from '../_lib/route';

/**
 * Notifications controller — owns the list + unread-count fetch, focus refetch,
 * refresh, tap-through (mark-read + route), and mark-all-read. Lifted verbatim
 * from the monolithic screen (§12). NOTE: still useState+useEffect+api (RQ göçü
 * SONRAYA — bu bir birebir lift, davranış değişmez).
 */
export function useNotifications() {
  const { isAuthenticated } = useAuthStore();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  // Okunmamış sayısı backend'den (tüm bildirimler) — önceden yalnızca yüklü 20'lik
  // sayfadan hesaplanıyordu → çok bildirimi olanda eksik sayıyordu.
  const [unreadCount, setUnreadCount] = useState(0);

  const fetchNotifications = useCallback(async () => {
    if (!isAuthenticated) {
      setNotifications([]);
      setLoading(false);
      setRefreshing(false);
      return;
    }
    try {
      const [listRes, countRes] = await Promise.all([
        notificationsApi.getAll(),
        notificationsApi.getUnreadCount().catch(() => null),
      ]);
      // Backend GET /notifications → { notifications, unreadCount, pagination }.
      // Axios interceptor body'yi sarmıyor, yani dizi data.notifications altında.
      // data/dizi fallback'leri response şekli değişirse diye korunuyor.
      const body: any = listRes.data;
      const list: Notification[] = Array.isArray(body?.notifications)
        ? body.notifications
        : Array.isArray(body?.data)
          ? body.data
          : Array.isArray(body)
            ? body
            : [];
      setNotifications(list);
      // Backend toplam okunmamış sayısı; ulaşılamazsa yüklü sayfadan türet (fallback).
      const c = (countRes?.data as any)?.count ?? (countRes?.data as any)?.data?.count;
      setUnreadCount(
        typeof c === 'number' ? c : list.filter((n: any) => !(n.read || n.isRead)).length,
      );
    } catch (error) {
      console.warn('Failed to fetch notifications:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [isAuthenticated]);

  // useFocusEffect ilk mount'ta da çalışır; ayrı useEffect ile çift fetch'e
  // gerek yok.
  useFocusEffect(
    useCallback(() => {
      fetchNotifications();
    }, [fetchNotifications]),
  );

  const handleRefresh = () => {
    setRefreshing(true);
    fetchNotifications();
  };

  // Bildirimler gizli bir tab; home/profil'den push ile açılıyor. Header'da geri
  // butonu olmayınca kullanıcı çıkamıyordu (trades ekranıyla aynı pattern).
  const handleBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)');
  };

  const handlePress = useCallback(async (notification: Notification) => {
    const isUnread = !(notification.read || notification.isRead);
    if (isUnread) {
      try {
        await notificationsApi.markAsRead(notification.id);
        setNotifications(prev =>
          prev.map(n => (n.id === notification.id ? { ...n, read: true, isRead: true } : n)),
        );
        setUnreadCount(c => Math.max(0, c - 1));
      } catch (error) {
        console.warn('Failed to mark as read:', error);
      }
    }

    // Bazı bildirim tipleri için doğrudan mobil rota — backend/web ortak link'i
    // (ör. karşı teklif → /listings/:id) yanlış yere götürdüğü için tipe öncelik ver.
    // Karşı teklif alıcının başlattığı pazarlıktadır → "Gönderilen" sekmesi.
    const typeRoute: Record<string, string> = {
      offer_counter: '/offers?tab=sent',
    };

    // Backend link'i WEB rotası — mobil rotaya normalize et; üretemezse
    // data'dan (orderId/tradeId/...) türet.
    const target =
      typeRoute[notification.type] ??
      (notification.link ? toMobileRoute(notification.link) : null) ??
      routeForNotification(notification);
    if (target) router.push(target as any);
  }, []);

  const handleMarkAllAsRead = async () => {
    try {
      await notificationsApi.markAllAsRead();
      setNotifications(prev => prev.map(n => ({ ...n, read: true, isRead: true })));
      setUnreadCount(0);
    } catch (error) {
      console.warn('Failed to mark all as read:', error);
    }
  };

  return {
    isAuthenticated,
    notifications,
    loading,
    refreshing,
    unreadCount,
    handleRefresh,
    handleBack,
    handlePress,
    handleMarkAllAsRead,
  };
}

export type NotificationsController = ReturnType<typeof useNotifications>;
