import React, { useState, useCallback } from 'react';
import { View, FlatList, Image, StyleSheet, TouchableOpacity, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  Badge,
  Button,
  EmptyState,
  ScreenLoader,
  Text,
  theme,
} from '@tarodan/ui-native';
import { notificationsApi } from '@/services/api';
import { formatRelativeDate } from '@/utils/format';
import { useAuthStore } from '@/stores/authStore';
import { resolveImageUrl } from '@/utils/imageUrl';
import { toMobileRoute } from '@/utils/notificationRoute';

const { colors } = theme;

interface Notification {
  id: string;
  type: string;
  title: string;
  message: string;
  read?: boolean;
  isRead?: boolean;
  createdAt: string;
  link?: string | null;
  data?: {
    orderId?: string;
    productId?: string;
    productImage?: string;
    offerId?: string;
    tradeId?: string;
    threadId?: string;
    collectionId?: string;
    userId?: string;
  };
}

const STOCKOUT_TYPES = new Set([
  'order_cancelled_out_of_stock',
  'offer_cancelled_out_of_stock',
  'back_in_stock',
]);

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

// NOT: Backend bildirim tipleri küçük snake_case'tir (notification.dto.ts
// NotificationType). Eskiden burada BÜYÜK_HARF case'ler vardı, hiçbiri
// eşleşmeyip her bildirim varsayılan zile düşüyordu.
function getIconForType(type: string): { icon: IoniconName; color: string; bg: string } {
  switch (type) {
    // ---- Siparişler ----
    case 'order_created':
      return { icon: 'cart', color: theme.colors.primary[500], bg: theme.colors.primary[50] };
    case 'order_paid':
    case 'payment_received':
      return { icon: 'card', color: theme.colors.success[500], bg: theme.colors.success[100] };
    case 'order_shipped':
    case 'trade_shipped':
    case 'order_delivered_confirm':
    case 'refund_return_opened':
      return { icon: 'cube', color: theme.colors.info[500], bg: theme.colors.info[100] };
    case 'order_delivered':
    case 'order_completed':
    case 'order_auto_completed':
    case 'order_manually_confirmed':
    case 'product_approved':
    case 'product_sold':
    case 'refund_approved':
      return { icon: 'checkmark-circle', color: theme.colors.success[500], bg: theme.colors.success[100] };
    case 'order_force_completed_by_admin':
      return { icon: 'shield-checkmark', color: theme.colors.info[500], bg: theme.colors.info[100] };
    case 'order_cancelled':
    case 'order_cancelled_out_of_stock':
    case 'offer_cancelled_out_of_stock':
    case 'offer_counter_declined':
    case 'product_rejected':
    case 'trade_rejected':
    case 'trade_auto_cancelled':
    case 'reservation_expired':
      return { icon: 'close-circle', color: theme.colors.danger[500], bg: theme.colors.danger[100] };
    case 'order_refunded':
    case 'refund_completed':
    case 'seller_did_not_ship_refunded':
    case 'payment_released':
      return { icon: 'cash', color: theme.colors.success[500], bg: theme.colors.success[100] };
    case 'refund_rejected':
    case 'refund_cancelled':
      return { icon: 'arrow-undo', color: theme.colors.danger[500], bg: theme.colors.danger[100] };
    case 'order_preparing_deadline_warning':
    case 'order_reservation_released':
    case 'offer_expired':
    case 'membership_expiring':
    case 'membership_expired':
    case 'listing_expiring':
    case 'listing_expired':
    case 'refund_disputed':
      return { icon: 'time', color: theme.colors.warning[500], bg: theme.colors.warning[100] };

    // ---- Teklifler ----
    case 'offer_received':
      return { icon: 'pricetag', color: theme.colors.success[500], bg: theme.colors.success[100] };
    case 'offer_counter':
      return { icon: 'pricetags', color: theme.colors.success[500], bg: theme.colors.success[100] };
    case 'offer_accepted':
      return { icon: 'thumbs-up', color: theme.colors.success[500], bg: theme.colors.success[100] };
    case 'offer_rejected':
    case 'offer_auto_rejected':
      return { icon: 'thumbs-down', color: theme.colors.danger[500], bg: theme.colors.danger[100] };

    // ---- Takaslar ----
    case 'trade_received':
    case 'trade_counter':
      return { icon: 'swap-horizontal', color: theme.colors.info[500], bg: theme.colors.info[100] };
    case 'trade_accepted':
    case 'trade_completed':
      return { icon: 'swap-horizontal', color: theme.colors.success[500], bg: theme.colors.success[100] };

    // ---- Mesaj ----
    case 'new_message':
      return { icon: 'chatbubbles', color: theme.colors.info[500], bg: theme.colors.info[100] };

    // ---- Favori / stok ----
    case 'price_drop':
      return { icon: 'trending-down', color: theme.colors.success[500], bg: theme.colors.success[100] };
    case 'wishlist_item_sold':
    case 'wishlist_sold':
      return { icon: 'heart-dislike', color: theme.colors.danger[500], bg: theme.colors.danger[100] };
    case 'back_in_stock':
      return { icon: 'refresh-circle', color: theme.colors.success[500], bg: theme.colors.success[100] };

    // ---- Sosyal ----
    case 'new_follower':
      return { icon: 'person-add', color: theme.colors.primary[500], bg: theme.colors.primary[50] };
    case 'seller_new_listing':
      return { icon: 'add-circle', color: theme.colors.info[500], bg: theme.colors.info[100] };
    case 'collection_liked':
    case 'product_liked':
      return { icon: 'heart', color: theme.colors.primary[500], bg: theme.colors.primary[50] };

    // ---- Değerlendirme ----
    case 'review_received':
      return { icon: 'star', color: theme.colors.warning[500], bg: theme.colors.warning[100] };

    // ---- Üyelik / öne çıkarma / kampanya ----
    case 'membership_upgraded':
      return { icon: 'ribbon', color: theme.colors.success[500], bg: theme.colors.success[100] };
    case 'listing_views_milestone':
      return { icon: 'eye', color: theme.colors.info[500], bg: theme.colors.info[100] };
    case 'boost_expired':
      return { icon: 'rocket', color: theme.colors.success[500], bg: theme.colors.success[100] };
    case 'promotion':
      return { icon: 'gift', color: theme.colors.success[500], bg: theme.colors.success[100] };
    case 'special_offer':
      return { icon: 'diamond', color: theme.colors.success[500], bg: theme.colors.success[100] };

    // ---- Genel ----
    case 'welcome':
      return { icon: 'sparkles', color: theme.colors.primary[500], bg: theme.colors.primary[50] };
    case 'system_announcement':
      return { icon: 'megaphone', color: theme.colors.info[500], bg: theme.colors.info[100] };

    default:
      return { icon: 'notifications', color: theme.colors.primary[500], bg: theme.colors.primary[50] };
  }
}

function routeForNotification(n: Notification): string | null {
  const d = n.data || {};
  if (d.orderId) return `/orders/${d.orderId}`;
  if (d.tradeId) return `/trade/${d.tradeId}`;
  if (d.offerId) return `/offers/${d.offerId}`;
  if (d.threadId) return `/messages/${d.threadId}`;
  if (d.productId) return `/product/${d.productId}`;
  if (d.collectionId) return `/collections/${d.collectionId}`;
  if (d.userId) return `/seller/${d.userId}`;
  return null;
}

export default function NotificationsScreen() {
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

  const handlePress = async (notification: Notification) => {
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
  };

  const handleMarkAllAsRead = async () => {
    try {
      await notificationsApi.markAllAsRead();
      setNotifications(prev => prev.map(n => ({ ...n, read: true, isRead: true })));
      setUnreadCount(0);
    } catch (error) {
      console.warn('Failed to mark all as read:', error);
    }
  };

  const renderItem = ({ item }: { item: Notification }) => {
    const isUnread = !(item.read || item.isRead);
    const { icon, color, bg } = getIconForType(item.type);
    return (
      <TouchableOpacity
        style={[styles.item, isUnread && styles.itemUnread]}
        onPress={() => handlePress(item)}
        activeOpacity={0.75}
      >
        {STOCKOUT_TYPES.has(item.type) && item.data?.productImage ? (
          <Image source={{ uri: resolveImageUrl(item.data.productImage) }} style={styles.thumb} />
        ) : (
          <View style={[styles.iconContainer, { backgroundColor: bg }]}>
            <Ionicons name={icon} size={20} color={color} />
          </View>
        )}
        <View style={styles.content}>
          <Text
            variant="bodySm"
            weight={isUnread ? 'bold' : 'semibold'}
            numberOfLines={1}
            style={styles.titleSpacing}
          >
            {item.title}
          </Text>
          <Text variant="bodySm" tone="muted" numberOfLines={2} style={styles.messageSpacing}>
            {item.message}
          </Text>
          <Text variant="caption" tone="subtle">
            {formatRelativeDate(item.createdAt)}
          </Text>
        </View>
        {isUnread ? <View style={styles.dot} /> : null}
      </TouchableOpacity>
    );
  };

  if (!isAuthenticated) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <TouchableOpacity onPress={handleBack} style={styles.backBtn} hitSlop={8}>
              <Ionicons name="chevron-back" size={26} color={colors.white} />
            </TouchableOpacity>
            <Text variant="h2" tone="inverted">Bildirimler</Text>
          </View>
        </View>
        <View style={styles.body}>
          <EmptyState
            fullscreen
            icon="notifications-outline"
            title="Bildirimleri görmek için giriş yapın"
            subtitle="Siparişleriniz, tekliflerileriniz ve mesajlarınız için anlık bildirimler burada görünür."
            actionLabel="Giriş Yap"
            onAction={() => router.push('/(auth)/login')}
          />
        </View>
      </SafeAreaView>
    );
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <TouchableOpacity onPress={handleBack} style={styles.backBtn} hitSlop={8}>
              <Ionicons name="chevron-back" size={26} color={colors.white} />
            </TouchableOpacity>
            <Text variant="h2" tone="inverted">Bildirimler</Text>
          </View>
        </View>
        <View style={styles.body}>
          <ScreenLoader />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <TouchableOpacity onPress={handleBack} style={styles.backBtn} hitSlop={8}>
            <Ionicons name="chevron-back" size={26} color={colors.white} />
          </TouchableOpacity>
          <Text variant="h2" tone="inverted">Bildirimler</Text>
          {unreadCount > 0 ? (
            <Badge variant="primary" style={styles.headerBadge}>{unreadCount}</Badge>
          ) : null}
        </View>
        {unreadCount > 0 ? (
          <Button
            variant="ghost"
            size="sm"
            title="Tümünü Okundu"
            onPress={handleMarkAllAsRead}
            textStyle={styles.markAllText}
          />
        ) : null}
      </View>
      <FlatList
        data={notifications}
        renderItem={renderItem}
        keyExtractor={item => item.id}
        style={styles.body}
        contentContainerStyle={notifications.length === 0 ? styles.emptyList : styles.list}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            colors={[theme.colors.primary[500]]}
            tintColor={theme.colors.primary[500]}
          />
        }
        ListEmptyComponent={
          <EmptyState
            icon="notifications-outline"
            title="Henüz bildirimin yok"
            subtitle="Yeni sipariş, teklif ve mesaj bildirimlerin burada görünür."
          />
        }
        ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  // SafeAreaView'in kendisi turuncu → status bar inset'i de turuncu olur
  // (anasayfa/profil header'larıyla aynı). İçerik gri arka planı `body`'den alır.
  container: {
    flex: 1,
    backgroundColor: colors.primary[600],
  },
  body: {
    flex: 1,
    backgroundColor: theme.colors.gray[50],
  },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.primary[600],
  },
  // Turuncu header üstünde okunması için beyaz rozet (home/profil deseni).
  headerBadge: {
    backgroundColor: colors.white,
  },
  markAllText: {
    color: colors.white,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  backBtn: {
    marginLeft: -4,
    marginRight: 2,
    padding: 2,
  },
  titleSpacing: { marginBottom: 4 },
  messageSpacing: { marginBottom: 6 },
  list: {
    padding: 16,
  },
  emptyList: {
    flexGrow: 1,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: theme.colors.white,
    padding: 14,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border.DEFAULT,
  },
  itemUnread: {
    backgroundColor: theme.colors.primary[50],
    borderColor: theme.colors.primary[500],
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  thumb: {
    width: 40,
    height: 40,
    borderRadius: 6,
    marginRight: 12,
    backgroundColor: theme.colors.gray[50],
  },
  content: {
    flex: 1,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: theme.colors.primary[500],
    marginLeft: 8,
    marginTop: 6,
  },
});
