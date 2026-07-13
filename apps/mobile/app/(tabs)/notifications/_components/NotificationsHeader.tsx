import { View, TouchableOpacity } from 'react-native';
import { Badge, Button, Text, theme } from '@tarodan/ui-native';
import { Ionicons } from '@expo/vector-icons';
import { styles } from '../_lib/styles';

const { colors } = theme;

/**
 * Turuncu bildirim header'ı — geri butonu + başlık, opsiyonel okunmamış rozeti
 * ve "Tümünü Okundu". Auth/loading durumlarında yalnız geri + başlık gösterilir
 * (unreadCount=0 → rozet/buton çıkmaz).
 */
export function NotificationsHeader({
  onBack,
  unreadCount = 0,
  onMarkAll,
}: {
  onBack: () => void;
  unreadCount?: number;
  onMarkAll?: () => void;
}) {
  return (
    <View style={styles.header}>
      <View style={styles.headerLeft}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn} hitSlop={8}>
          <Ionicons name="chevron-back" size={26} color={colors.white} />
        </TouchableOpacity>
        <Text variant="h2" tone="inverted">Bildirimler</Text>
        {unreadCount > 0 ? (
          <Badge variant="primary" style={styles.headerBadge}>{unreadCount}</Badge>
        ) : null}
      </View>
      {unreadCount > 0 && onMarkAll ? (
        <Button
          variant="ghost"
          size="sm"
          title="Tümünü Okundu"
          onPress={onMarkAll}
          textStyle={styles.markAllText}
        />
      ) : null}
    </View>
  );
}
