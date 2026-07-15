import { useCallback } from 'react';
import { View, FlatList, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { EmptyState, ScreenLoader, theme } from '@tarodan/ui-native';
import { useNotifications } from './_hooks/useNotifications';
import { styles } from './_lib/styles';
import { NotificationsHeader } from './_components/NotificationsHeader';
import { NotificationRow } from './_components/NotificationRow';
import type { Notification } from './_lib/types';

export default function NotificationsScreen() {
  const f = useNotifications();

  const renderItem = useCallback(
    ({ item }: { item: Notification }) => <NotificationRow item={item} onPress={f.handlePress} />,
    [f.handlePress],
  );

  if (!f.isAuthenticated) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <NotificationsHeader onBack={f.handleBack} />
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

  if (f.loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <NotificationsHeader onBack={f.handleBack} />
        <View style={styles.body}>
          <ScreenLoader />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <NotificationsHeader
        onBack={f.handleBack}
        unreadCount={f.unreadCount}
        onMarkAll={f.handleMarkAllAsRead}
      />
      <FlatList
        data={f.notifications}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        // #82: virtualizasyon ayarı — çok sayıda bildirimde bellek/kaydırma.
        windowSize={7}
        initialNumToRender={8}
        maxToRenderPerBatch={10}
        removeClippedSubviews
        style={styles.body}
        contentContainerStyle={f.notifications.length === 0 ? styles.emptyList : styles.list}
        refreshControl={
          <RefreshControl
            refreshing={f.refreshing}
            onRefresh={f.handleRefresh}
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
