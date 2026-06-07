import React, { useState, useEffect, useCallback } from 'react';
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
import { notificationsApi } from '../../src/services/api';
import { TarodanColors } from '../../src/theme';
import { formatRelativeDate } from '../../src/utils/format';
import { useAuthStore } from '../../src/stores/authStore';
import { resolveImageUrl } from '../../src/utils/imageUrl';

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

function getIconForType(type: string): { icon: IoniconName; color: string; bg: string } {
  switch (type) {
    case 'ORDER_CREATED':
    case 'ORDER_PAID':
      return { icon: 'cart', color: TarodanColors.primary, bg: TarodanColors.primaryLight };
    case 'ORDER_SHIPPED':
    case 'ORDER_IN_TRANSIT':
    case 'ORDER_OUT_FOR_DELIVERY':
      return { icon: 'cube', color: TarodanColors.info, bg: TarodanColors.infoLight };
    case 'ORDER_DELIVERED':
    case 'ORDER_COMPLETED':
      return { icon: 'checkmark-circle', color: TarodanColors.success, bg: TarodanColors.successLight };
    case 'ORDER_CANCELLED':
    case 'ORDER_REFUNDED':
      return { icon: 'close-circle', color: TarodanColors.error, bg: TarodanColors.errorLight };
    case 'OFFER_RECEIVED':
    case 'OFFER_COUNTERED':
      return { icon: 'pricetag', color: TarodanColors.accent, bg: TarodanColors.accentLight };
    case 'OFFER_ACCEPTED':
      return { icon: 'thumbs-up', color: TarodanColors.success, bg: TarodanColors.successLight };
    case 'OFFER_REJECTED':
      return { icon: 'thumbs-down', color: TarodanColors.error, bg: TarodanColors.errorLight };
    case 'TRADE_RECEIVED':
    case 'TRADE_COUNTERED':
    case 'TRADE_SHIPPED':
      return { icon: 'swap-horizontal', color: TarodanColors.badgeTrade, bg: TarodanColors.accentBlueLite };
    case 'MESSAGE':
    case 'MESSAGE_RECEIVED':
      return { icon: 'chatbubbles', color: TarodanColors.info, bg: TarodanColors.infoLight };
    case 'PAYMENT_RECEIVED':
    case 'PAYMENT_SUCCESS':
      return { icon: 'card', color: TarodanColors.success, bg: TarodanColors.successLight };
    case 'PAYMENT_FAILED':
      return { icon: 'alert-circle', color: TarodanColors.error, bg: TarodanColors.errorLight };
    case 'RATING_RECEIVED':
      return { icon: 'star', color: TarodanColors.star, bg: TarodanColors.warningLight };
    case 'COLLECTION_LIKED':
    case 'FOLLOW_RECEIVED':
      return { icon: 'heart', color: TarodanColors.primary, bg: TarodanColors.primaryLight };
    default:
      return { icon: 'notifications', color: TarodanColors.primary, bg: TarodanColors.primaryLight };
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

  const fetchNotifications = useCallback(async () => {
    if (!isAuthenticated) {
      setNotifications([]);
      setLoading(false);
      setRefreshing(false);
      return;
    }
    try {
      const response = await notificationsApi.getAll();
      const payload = response.data?.data ?? response.data ?? [];
      setNotifications(Array.isArray(payload) ? payload : []);
    } catch (error) {
      console.warn('Failed to fetch notifications:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  useFocusEffect(
    useCallback(() => {
      fetchNotifications();
    }, [fetchNotifications]),
  );

  const handleRefresh = () => {
    setRefreshing(true);
    fetchNotifications();
  };

  const handlePress = async (notification: Notification) => {
    const isUnread = !(notification.read || notification.isRead);
    if (isUnread) {
      try {
        await notificationsApi.markAsRead(notification.id);
        setNotifications(prev =>
          prev.map(n => (n.id === notification.id ? { ...n, read: true, isRead: true } : n)),
        );
      } catch (error) {
        console.warn('Failed to mark as read:', error);
      }
    }

    // Prefer backend-provided deep link (already interpolated with ids).
    if (notification.link) {
      router.push(notification.link as any);
      return;
    }
    const target = routeForNotification(notification);
    if (target) router.push(target as any);
  };

  const handleMarkAllAsRead = async () => {
    try {
      await notificationsApi.markAllAsRead();
      setNotifications(prev => prev.map(n => ({ ...n, read: true, isRead: true })));
    } catch (error) {
      console.warn('Failed to mark all as read:', error);
    }
  };

  const unreadCount = notifications.filter(n => !(n.read || n.isRead)).length;

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
          <Text variant="h2">Bildirimler</Text>
        </View>
        <EmptyState
          fullscreen
          icon="notifications-outline"
          title="Bildirimleri görmek için giriş yapın"
          subtitle="Siparişleriniz, tekliflerileriniz ve mesajlarınız için anlık bildirimler burada görünür."
          actionLabel="Giriş Yap"
          onAction={() => router.push('/(auth)/login')}
        />
      </SafeAreaView>
    );
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <Text variant="h2">Bildirimler</Text>
        </View>
        <ScreenLoader />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text variant="h2">Bildirimler</Text>
          {unreadCount > 0 ? (
            <Badge variant="primary">{unreadCount}</Badge>
          ) : null}
        </View>
        {unreadCount > 0 ? (
          <Button
            variant="ghost"
            size="sm"
            title="Tümünü Okundu"
            onPress={handleMarkAllAsRead}
          />
        ) : null}
      </View>
      <FlatList
        data={notifications}
        renderItem={renderItem}
        keyExtractor={item => item.id}
        contentContainerStyle={notifications.length === 0 ? styles.emptyList : styles.list}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            colors={[TarodanColors.primary]}
            tintColor={TarodanColors.primary}
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
  container: {
    flex: 1,
    backgroundColor: TarodanColors.backgroundSecondary,
  },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: TarodanColors.background,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: TarodanColors.border,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
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
    backgroundColor: TarodanColors.background,
    padding: 14,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: TarodanColors.border,
  },
  itemUnread: {
    backgroundColor: TarodanColors.primaryLight,
    borderColor: TarodanColors.primary,
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
    backgroundColor: TarodanColors.surfaceVariant,
  },
  content: {
    flex: 1,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: TarodanColors.primary,
    marginLeft: 8,
    marginTop: 6,
  },
});
