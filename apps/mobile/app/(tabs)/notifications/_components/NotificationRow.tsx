import React from 'react';
import { View, Image, TouchableOpacity } from 'react-native';
import { Text } from '@tarodan/ui-native';
import { Ionicons } from '@expo/vector-icons';
import { formatRelativeDate } from '@/utils/format';
import { resolveImageUrl } from '@/utils/imageUrl';
import { styles } from '../_lib/styles';
import { getIconForType } from '../_lib/icons';
import { STOCKOUT_TYPES, type Notification } from '../_lib/types';

/** Tek bildirim satırı — stok bildiriminde ürün foto, aksi halde tip ikonu. */
function NotificationRowBase({
  item,
  onPress,
}: {
  item: Notification;
  onPress: (item: Notification) => void;
}) {
  const isUnread = !(item.read || item.isRead);
  const { icon, color, bg } = getIconForType(item.type);

  return (
    <TouchableOpacity
      style={[styles.item, isUnread && styles.itemUnread]}
      onPress={() => onPress(item)}
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
}

export const NotificationRow = React.memo(NotificationRowBase);
