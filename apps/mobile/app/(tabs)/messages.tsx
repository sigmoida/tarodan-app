import { View, ScrollView, StyleSheet, TouchableOpacity, RefreshControl } from 'react-native';
import { useState, useCallback } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  Avatar,
  Badge,
  FAB,
  Input,
  Spinner,
  Text,
  theme,
} from '@tarodan/ui-native';
import { useMessagesStore } from '../../src/stores/messagesStore';
import { useAuthStore } from '../../src/stores/authStore';
import { TarodanColors } from '../../src/theme';

const { colors } = theme;

export default function MessagesTabScreen() {
  const { isAuthenticated, user, limits } = useAuthStore();
  const { threads, isLoading, fetchThreads, getUnreadCount, getOtherParticipant, dailyMessageCount } = useMessagesStore();
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Fetch threads on focus
  useFocusEffect(
    useCallback(() => {
      if (isAuthenticated) {
        fetchThreads();
      }
    }, [isAuthenticated])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchThreads();
    setRefreshing(false);
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    
    if (days === 0) {
      return date.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
    } else if (days === 1) {
      return 'Dün';
    } else if (days < 7) {
      return date.toLocaleDateString('tr-TR', { weekday: 'short' });
    } else {
      return date.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });
    }
  };

  const filteredThreads = threads.filter(thread => {
    if (!searchQuery) return true;
    const other = getOtherParticipant(thread);
    return (other?.displayName || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
           thread.product?.title?.toLowerCase().includes(searchQuery.toLowerCase());
  });

  const unreadCount = getUnreadCount();
  const messageLimit = limits?.maxMessagesPerDay || 50;
  const isUnlimited = messageLimit === -1;

  // Not authenticated
  if (!isAuthenticated) {
    return (
      <View style={styles.centeredContainer}>
        <Ionicons name="chatbubbles-outline" size={64} color={colors.primary[600]!} />
        <Text variant="h2" style={styles.title}>
          Mesajlar
        </Text>
        <Text variant="body" tone="muted" align="center" style={styles.subtitle}>
          Mesajlarınızı görmek için giriş yapın
        </Text>
        <TouchableOpacity style={styles.loginButton} onPress={() => router.push('/(auth)/login')}>
          <Text variant="body" tone="inverted" weight="semibold">
            Giriş Yap
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text variant="h3" tone="inverted" weight="bold">
          Mesajlar
        </Text>
        {unreadCount > 0 && (
          <Badge variant="danger" style={styles.headerBadge}>
            {unreadCount}
          </Badge>
        )}
      </View>

      {/* Message Limit Banner */}
      {!isUnlimited && dailyMessageCount >= messageLimit - 10 && (
        <View style={styles.limitBanner}>
          <Ionicons name="information-circle" size={20} color={colors.warning[600]!} />
          <Text variant="bodySm" tone="warning" style={styles.limitText}>
            Günlük mesaj: {dailyMessageCount}/{messageLimit}
          </Text>
          {dailyMessageCount >= messageLimit && (
            <TouchableOpacity onPress={() => router.push('/pricing')}>
              <Text variant="bodySm" tone="primary" weight="semibold">
                Premium'a Geç
              </Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Search */}
      <View style={styles.searchContainer}>
        <Input
          placeholder="Mesajlarda ara..."
          value={searchQuery}
          onChangeText={setSearchQuery}
          leftIconName="search"
        />
      </View>

      {/* Content */}
      {isLoading && threads.length === 0 ? (
        <View style={styles.loadingContainer}>
          <Spinner size="lg" />
        </View>
      ) : filteredThreads.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons
            name="chatbubble-ellipses-outline"
            size={80}
            color={colors.text.subtle}
          />
          <Text variant="h3" align="center" style={styles.emptyTitle}>
            {searchQuery ? 'Sonuç bulunamadı' : 'Henüz mesaj yok'}
          </Text>
          <Text variant="body" tone="muted" align="center">
            {searchQuery
              ? 'Farklı bir arama terimi deneyin'
              : 'Bir satıcıyla iletişime geçerek başlayın'}
          </Text>
        </View>
      ) : (
        <ScrollView
          style={styles.threadsList}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={[colors.primary[600]!]}
            />
          }
        >
          {filteredThreads.map((thread) => {
            const other = getOtherParticipant(thread);
            const hasUnread = thread.unreadCount > 0;
            
            return (
              <TouchableOpacity
                key={thread.id}
                style={[styles.threadItem, hasUnread && styles.threadItemUnread]}
                onPress={() => router.push(`/messages/${thread.id}`)}
              >
                <View style={styles.avatarContainer}>
                  <Avatar
                    size="lg"
                    source={other?.avatarUrl}
                    name={other?.displayName || 'Kullanıcı'}
                  />
                  {hasUnread && <View style={styles.unreadDot} />}
                </View>

                <View style={styles.threadContent}>
                  <View style={styles.threadHeader}>
                    <Text
                      variant="label"
                      weight={hasUnread ? 'bold' : 'semibold'}
                      numberOfLines={1}
                      style={styles.participantName}
                    >
                      {other?.displayName || 'Kullanıcı'}
                    </Text>
                    <Text variant="caption" tone="muted" style={styles.threadTime}>
                      {thread.lastMessage
                        ? formatTime(thread.lastMessage.createdAt)
                        : formatTime(thread.createdAt)}
                    </Text>
                  </View>

                  {thread.product && (
                    <View style={styles.productRef}>
                      <Ionicons name="pricetag" size={12} color={colors.primary[600]!} />
                      <Text variant="caption" tone="primary" numberOfLines={1} style={styles.productRefText}>
                        {thread.product.title}
                      </Text>
                    </View>
                  )}

                  <Text
                    variant="bodySm"
                    tone={hasUnread ? 'heading' : 'muted'}
                    weight={hasUnread ? 'semibold' : 'regular'}
                    numberOfLines={1}
                    style={styles.lastMessage}
                  >
                    {thread.lastMessage?.senderId === user?.id ? 'Sen: ' : ''}
                    {thread.lastMessage?.content || 'Henüz mesaj yok'}
                  </Text>
                </View>

                {hasUnread && (
                  <Badge variant="primary" style={styles.unreadBadge}>
                    {thread.unreadCount}
                  </Badge>
                )}
              </TouchableOpacity>
            );
          })}

          <View style={{ height: 100 }} />
        </ScrollView>
      )}

      {/* New Message FAB */}
      <FAB
        icon="add"
        accessibilityLabel="Yeni mesaj"
        style={styles.fab}
        onPress={() => router.push('/messages/new')}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: TarodanColors.background,
  },
  centeredContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  header: {
    backgroundColor: TarodanColors.primary,
    paddingTop: 50,
    paddingBottom: 16,
    paddingHorizontal: 20,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: TarodanColors.textOnPrimary,
  },
  headerBadge: {
    marginLeft: 8,
    backgroundColor: TarodanColors.error,
  },
  title: {
    marginTop: 16,
    marginBottom: 8,
  },
  subtitle: {
    textAlign: 'center',
    marginBottom: 24,
    color: TarodanColors.textSecondary,
  },
  loginButton: {
    backgroundColor: TarodanColors.primary,
    paddingHorizontal: 32,
    paddingVertical: 12,
    borderRadius: 8,
  },
  loginButtonText: {
    color: TarodanColors.textOnPrimary,
    fontWeight: '600',
  },
  limitBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: TarodanColors.warningLight,
    padding: 12,
    gap: 8,
  },
  limitText: {
    flex: 1,
    color: TarodanColors.warning,
    fontSize: 13,
  },
  upgradeLink: {
    color: TarodanColors.primary,
    fontWeight: '600',
    fontSize: 13,
  },
  searchContainer: {
    padding: 12,
    backgroundColor: TarodanColors.background,
  },
  searchbar: {
    backgroundColor: TarodanColors.surfaceVariant,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyTitle: {
    marginTop: 16,
    marginBottom: 8,
    color: TarodanColors.textPrimary,
  },
  emptySubtitle: {
    textAlign: 'center',
    color: TarodanColors.textSecondary,
  },
  threadsList: {
    flex: 1,
  },
  threadItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: TarodanColors.border,
    backgroundColor: TarodanColors.background,
  },
  threadItemUnread: {
    backgroundColor: TarodanColors.primaryLight + '10',
  },
  avatarContainer: {
    position: 'relative',
  },
  unreadDot: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: TarodanColors.primary,
    borderWidth: 2,
    borderColor: TarodanColors.background,
  },
  threadContent: {
    flex: 1,
    marginLeft: 12,
  },
  threadHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  participantName: {
    flex: 1,
    color: TarodanColors.textPrimary,
  },
  threadTime: {
    color: TarodanColors.textSecondary,
    marginLeft: 8,
  },
  productRef: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  productRefText: {
    color: TarodanColors.primary,
    marginLeft: 4,
    fontSize: 12,
  },
  lastMessage: {
    color: TarodanColors.textSecondary,
    marginTop: 4,
  },
  unreadText: {
    fontWeight: '600',
    color: TarodanColors.textPrimary,
  },
  unreadBadge: {
    backgroundColor: TarodanColors.primary,
    marginLeft: 8,
  },
  fab: {
    position: 'absolute',
    right: 16,
    bottom: 24,
    backgroundColor: TarodanColors.primary,
  },
});
