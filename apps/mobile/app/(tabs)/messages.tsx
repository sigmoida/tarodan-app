import { View, ScrollView, StyleSheet, TouchableOpacity, RefreshControl } from 'react-native';
import { Avatar, Badge, Input, Spinner, Text, theme, ScreenHeader } from '@tarodan/ui-native';
import { useState, useCallback } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useMessagesStore, MessageThread } from '../../src/stores/messagesStore';
import { useAuthStore } from '../../src/stores/authStore';
import { formatMessagePreview } from '../../src/utils/contentFilter';
import { useTranslation } from '../../src/i18n';

const { colors } = theme;

export default function MessagesTabScreen() {
  const { t } = useTranslation();
  const { isAuthenticated, user, limits } = useAuthStore();
  const { threads, isLoading, hasLoadedThreads, fetchThreads, getUnreadCount, getOtherParticipant, dailyMessageCount } = useMessagesStore();
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

  // Güvenli participant helper - store'dan gelen null/undefined durumlarını yakala
  const safeGetOther = (thread: MessageThread) => {
    try {
      const result = getOtherParticipant(thread);
      if (!result) {
        return { id: '', displayName: 'Kullanıcı', avatarUrl: null };
      }
      return {
        id: result.id || '',
        displayName: result.displayName || 'Kullanıcı',
        avatarUrl: result.avatarUrl || null,
      };
    } catch {
      return { id: '', displayName: 'Kullanıcı', avatarUrl: null };
    }
  };

  const filteredThreads = threads.filter(thread => {
    if (!searchQuery) return true;
    const other = safeGetOther(thread);
    return other.displayName.toLowerCase().includes(searchQuery.toLowerCase()) ||
           (thread.product?.title || '').toLowerCase().includes(searchQuery.toLowerCase());
  });

  const unreadCount = getUnreadCount();
  const messageLimit = limits?.maxMessagesPerDay || 50;
  const isUnlimited = messageLimit === -1;

  // Not authenticated
  if (!isAuthenticated) {
    return (
      <View style={styles.container}>
        <ScreenHeader title={t('mobile.messagesTitle')} showBack={false} />
        <View style={styles.centeredContainer}>
          <Ionicons name="chatbubbles-outline" size={64} color={colors.primary[600]!} />
          <Text variant="h3" style={styles.title}>{t("mobile.messagesTitle")}</Text>
          <Text variant="body" style={styles.subtitle}>
            Mesajlarınızı görmek için giriş yapın
          </Text>
          <TouchableOpacity
            style={styles.loginButton}
            onPress={() => router.push('/(auth)/login')}
          >
            <Text style={styles.loginButtonText}>Giriş Yap</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScreenHeader
        title={t('mobile.messagesTitle')}
        showBack={false}
        right={
          unreadCount > 0 ? (
            <Badge variant="danger" style={styles.headerBadge}>{unreadCount}</Badge>
          ) : undefined
        }
      />

      {/* Message Limit Banner */}
      {!isUnlimited && dailyMessageCount >= messageLimit - 10 && (
        <View style={styles.limitBanner}>
          <Ionicons name="information-circle" size={20} color={colors.warning[600]!} />
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
        <Input
          placeholder={t("mobile.searchInMessages")}
          value={searchQuery}
          onChangeText={setSearchQuery}
          leftIconName="search"
        />
      </View>

      {/* Content — ilk yükleme bitene dek spinner; boş ekran bir an çakmasın. */}
      {threads.length === 0 && (isLoading || !hasLoadedThreads) ? (
        <View style={styles.loadingContainer}>
          <Spinner size="lg" />
        </View>
      ) : filteredThreads.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="chatbubble-ellipses-outline" size={80} color={colors.text.subtle} />
          <Text variant="h3" style={styles.emptyTitle}>
            {searchQuery ? 'Sonuç bulunamadı' : 'Henüz mesaj yok'}
          </Text>
          <Text variant="body" style={styles.emptySubtitle}>
            {searchQuery
              ? 'Farklı bir arama terimi deneyin'
              : 'Bir satıcıyla iletişime geçerek başlayın'}
          </Text>
        </View>
      ) : (
        <ScrollView
          style={styles.threadsList}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary[600]!]} />
          }
        >
          {filteredThreads.map((thread) => {
            const other = safeGetOther(thread);
            const hasUnread = thread.unreadCount > 0;

            return (
              <TouchableOpacity
                key={thread.id}
                style={[styles.threadItem, hasUnread && styles.threadItemUnread]}
                onPress={() => router.push(`/messages/${thread.id}`)}
              >
                <View style={styles.avatarContainer}>
                  <Avatar
                    size="md"
                    source={other.avatarUrl || undefined}
                    name={other.displayName.charAt(0).toUpperCase()}
                  />
                  {hasUnread && (
                    <View style={styles.unreadDot} />
                  )}
                </View>

                <View style={styles.threadContent}>
                  <View style={styles.threadHeader}>
                    <Text
                      variant="label"
                      style={[styles.participantName, hasUnread && styles.unreadText]}
                      numberOfLines={1}
                    >
                      {other.displayName}
                    </Text>
                    <Text variant="caption" style={styles.threadTime}>
                      {thread.lastMessage ? formatTime(thread.lastMessage.createdAt) : formatTime(thread.createdAt)}
                    </Text>
                  </View>

                  {/* Product reference — ürünsüz (genel) sohbette de bağlam göster
                      ki aynı kişiyle ürün başına ayrı thread'ler karışmasın. */}
                  {thread.product ? (
                    <View style={styles.productRef}>
                      <Ionicons name="pricetag" size={12} color={colors.primary[600]!} />
                      <Text variant="caption" style={styles.productRefText} numberOfLines={1}>
                        {thread.product.title}
                      </Text>
                    </View>
                  ) : (
                    <View style={styles.productRef}>
                      <Ionicons name="chatbubble-ellipses-outline" size={12} color={colors.text.subtle} />
                      <Text variant="caption" tone="muted" style={styles.productRefText} numberOfLines={1}>
                        Genel mesaj
                      </Text>
                    </View>
                  )}

                  {/* Last message preview */}
                  <Text
                    variant="caption"
                    style={[styles.lastMessage, hasUnread && styles.unreadText]}
                    numberOfLines={1}
                  >
                    {thread.lastMessage?.senderId === user?.id ? 'Sen: ' : ''}
                    {formatMessagePreview(thread.lastMessage?.content ?? '') || 'Henüz mesaj yok'}
                  </Text>
                </View>

                {hasUnread && (
                  <Badge variant="primary" style={styles.unreadBadge}>{thread.unreadCount}</Badge>
                )}
              </TouchableOpacity>
            );
          })}

          <View style={{ height: 100 }} />
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface.DEFAULT,
  },
  centeredContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  headerBadge: {
    marginLeft: 8,
  },
  title: {
    marginTop: 16,
    marginBottom: 8,
  },
  subtitle: {
    textAlign: 'center',
    marginBottom: 24,
    color: colors.text.muted,
  },
  loginButton: {
    backgroundColor: colors.primary[600]!,
    paddingHorizontal: 32,
    paddingVertical: 12,
    borderRadius: 8,
  },
  loginButtonText: {
    color: colors.white,
    fontWeight: '600',
  },
  limitBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.warning[50]!,
    padding: 12,
    gap: 8,
  },
  limitText: {
    flex: 1,
    color: colors.warning[600]!,
    fontSize: 13,
  },
  upgradeLink: {
    color: colors.primary[600]!,
    fontWeight: '600',
    fontSize: 13,
  },
  searchContainer: {
    padding: 12,
    backgroundColor: colors.surface.DEFAULT,
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
    color: colors.text.heading,
  },
  emptySubtitle: {
    textAlign: 'center',
    color: colors.text.muted,
  },
  threadsList: {
    flex: 1,
  },
  threadItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.DEFAULT,
    backgroundColor: colors.surface.DEFAULT,
  },
  threadItemUnread: {
    backgroundColor: colors.primary[50]!,
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
    backgroundColor: colors.primary[600]!,
    borderWidth: 2,
    borderColor: colors.surface.DEFAULT,
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
    color: colors.text.heading,
  },
  threadTime: {
    color: colors.text.muted,
    marginLeft: 8,
  },
  productRef: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  productRefText: {
    color: colors.primary[600]!,
    marginLeft: 4,
    fontSize: 12,
  },
  lastMessage: {
    color: colors.text.muted,
    marginTop: 4,
  },
  unreadText: {
    fontWeight: '600',
    color: colors.text.heading,
  },
  unreadBadge: {
    marginLeft: 8,
  },
});
