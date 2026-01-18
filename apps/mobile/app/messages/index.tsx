import { View, ScrollView, StyleSheet, TouchableOpacity, Image, RefreshControl } from 'react-native';
import { Text, Avatar, Badge, FAB, ActivityIndicator, Searchbar, Divider } from 'react-native-paper';
import { useState, useCallback } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useMessagesStore, MessageThread } from '../../src/stores/messagesStore';
import { useAuthStore } from '../../src/stores/authStore';
import { TarodanColors } from '../../src/theme';

export default function MessagesListScreen() {
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
    return other.displayName.toLowerCase().includes(searchQuery.toLowerCase()) ||
           thread.product?.title?.toLowerCase().includes(searchQuery.toLowerCase());
  });

  const unreadCount = getUnreadCount();
  const messageLimit = limits?.maxMessagesPerDay || 50;
  const isUnlimited = messageLimit === -1;

  // Not authenticated
  if (!isAuthenticated) {
    return (
      <View style={styles.centeredContainer}>
        <Ionicons name="chatbubbles-outline" size={64} color={TarodanColors.primary} />
        <Text variant="titleLarge" style={styles.title}>Mesajlar</Text>
        <Text variant="bodyMedium" style={styles.subtitle}>
          Mesajlarınızı görmek için giriş yapın
        </Text>
        <TouchableOpacity 
          style={styles.loginButton}
          onPress={() => router.push('/(auth)/login')}
        >
          <Text style={styles.loginButtonText}>Giriş Yap</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={TarodanColors.textOnPrimary} />
        </TouchableOpacity>
        <View style={styles.headerTitleContainer}>
          <Text style={styles.headerTitle}>Mesajlar</Text>
          {unreadCount > 0 && (
            <Badge style={styles.headerBadge}>{unreadCount}</Badge>
          )}
        </View>
        <View style={{ width: 24 }} />
      </View>

      {/* Message Limit Banner */}
      {!isUnlimited && dailyMessageCount >= messageLimit - 10 && (
        <View style={styles.limitBanner}>
          <Ionicons name="information-circle" size={20} color={TarodanColors.warning} />
          <Text style={styles.limitText}>
            Günlük mesaj: {dailyMessageCount}/{messageLimit}
          </Text>
          {dailyMessageCount >= messageLimit && (
            <TouchableOpacity onPress={() => router.push('/upgrade')}>
              <Text style={styles.upgradeLink}>Premium'a Geç</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Search */}
      <View style={styles.searchContainer}>
        <Searchbar
          placeholder="Mesajlarda ara..."
          value={searchQuery}
          onChangeText={setSearchQuery}
          style={styles.searchbar}
        />
      </View>

      {/* Content */}
      {isLoading && threads.length === 0 ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={TarodanColors.primary} />
        </View>
      ) : filteredThreads.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="chatbubble-ellipses-outline" size={80} color={TarodanColors.textLight} />
          <Text variant="titleMedium" style={styles.emptyTitle}>
            {searchQuery ? 'Sonuç bulunamadı' : 'Henüz mesaj yok'}
          </Text>
          <Text variant="bodyMedium" style={styles.emptySubtitle}>
            {searchQuery 
              ? 'Farklı bir arama terimi deneyin'
              : 'Bir satıcıyla iletişime geçerek başlayın'}
          </Text>
        </View>
      ) : (
        <ScrollView
          style={styles.threadsList}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[TarodanColors.primary]} />
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
                  {other.avatarUrl ? (
                    <Avatar.Image size={50} source={{ uri: other.avatarUrl }} />
                  ) : (
                    <Avatar.Text size={50} label={other.displayName.charAt(0).toUpperCase()} />
                  )}
                  {hasUnread && (
                    <View style={styles.unreadDot} />
                  )}
                </View>
                
                <View style={styles.threadContent}>
                  <View style={styles.threadHeader}>
                    <Text 
                      variant="titleSmall" 
                      style={[styles.participantName, hasUnread && styles.unreadText]}
                      numberOfLines={1}
                    >
                      {other.displayName}
                    </Text>
                    <Text variant="bodySmall" style={styles.threadTime}>
                      {thread.lastMessage ? formatTime(thread.lastMessage.createdAt) : formatTime(thread.createdAt)}
                    </Text>
                  </View>
                  
                  {/* Product reference */}
                  {thread.product && (
                    <View style={styles.productRef}>
                      <Ionicons name="pricetag" size={12} color={TarodanColors.primary} />
                      <Text variant="bodySmall" style={styles.productRefText} numberOfLines={1}>
                        {thread.product.title}
                      </Text>
                    </View>
                  )}
                  
                  {/* Last message preview */}
                  <Text 
                    variant="bodySmall" 
                    style={[styles.lastMessage, hasUnread && styles.unreadText]}
                    numberOfLines={1}
                  >
                    {thread.lastMessage?.senderId === user?.id ? 'Sen: ' : ''}
                    {thread.lastMessage?.content || 'Henüz mesaj yok'}
                  </Text>
                </View>

                {hasUnread && (
                  <Badge style={styles.unreadBadge}>{thread.unreadCount}</Badge>
                )}
              </TouchableOpacity>
            );
          })}

          <View style={{ height: 100 }} />
        </ScrollView>
      )}

      {/* New Message FAB */}
      <FAB
        icon="plus"
        style={styles.fab}
        onPress={() => router.push('/messages/new')}
        color={TarodanColors.textOnPrimary}
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
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerTitleContainer: {
    flexDirection: 'row',
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
