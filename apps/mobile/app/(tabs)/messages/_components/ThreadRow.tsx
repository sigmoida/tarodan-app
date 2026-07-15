import { View, TouchableOpacity } from 'react-native';
import { Avatar, Badge, Text, theme } from '@tarodan/ui-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { formatMessagePreview } from '@/utils/contentFilter';
import type { MessageThread } from '@/stores/messagesStore';
import { styles } from '../_lib/styles';
import { formatTime } from '../_lib/helpers';
import type { MessagesTabController } from '../_hooks/useMessagesTab';

const { colors } = theme;

/** Tek sohbet satırı — avatar/okunmamış, başlık/zaman, ürün bağlamı, son mesaj. */
export function ThreadRow({ thread, f }: { thread: MessageThread; f: MessagesTabController }) {
  const other = f.safeGetOther(thread);
  const hasUnread = thread.unreadCount > 0;

  return (
    <TouchableOpacity
      style={[styles.threadItem, hasUnread && styles.threadItemUnread]}
      onPress={() => router.push(`/messages/${thread.id}`)}
    >
      <View style={styles.avatarContainer}>
        <Avatar
          size="md"
          source={other.avatarUrl || undefined}
          name={other.displayName.charAt(0).toUpperCase()}
        />
        {hasUnread && <View style={styles.unreadDot} />}
      </View>

      <View style={styles.threadContent}>
        <View style={styles.threadHeader}>
          <Text variant="label" style={[styles.participantName, hasUnread && styles.unreadText]} numberOfLines={1}>
            {other.displayName}
          </Text>
          <Text variant="caption" style={styles.threadTime}>
            {thread.lastMessage ? formatTime(thread.lastMessage.createdAt) : formatTime(thread.createdAt)}
          </Text>
        </View>

        {/* Product reference — ürünsüz (genel) sohbette de bağlam göster. */}
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
        <Text variant="caption" style={[styles.lastMessage, hasUnread && styles.unreadText]} numberOfLines={1}>
          {thread.lastMessage?.senderId === f.user?.id ? 'Sen: ' : ''}
          {formatMessagePreview(thread.lastMessage?.content ?? '') || 'Henüz mesaj yok'}
        </Text>
      </View>

      {hasUnread && <Badge variant="primary" style={styles.unreadBadge}>{thread.unreadCount}</Badge>}
    </TouchableOpacity>
  );
}
