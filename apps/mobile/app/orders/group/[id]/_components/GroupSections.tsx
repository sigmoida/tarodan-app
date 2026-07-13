import { View, Image, Pressable } from 'react-native';
import { Card, StatusBadge, Text, theme } from '@tarodan/ui-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { getOrderProductImageUri } from '@/utils/orderProductImage';
import { formatPrice } from '@/utils/format';
import { styles } from '../_lib/styles';
import { uiOrderStatusConfig, badgeStatusOf, formatDate, deriveOrderRow } from '../_lib/status';
import type { GroupDetail, GroupOrder } from '../_lib/types';

const { colors } = theme;

/** Grup başlık kartı + (2+ üründe) ürün-bazlı iade/iptal notu. */
export function GroupHeader({ group }: { group: GroupDetail }) {
  return (
    <>
      <Card variant="elevated" padding={12} style={styles.card}>
        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <Text variant="label">{group.groupNumber}</Text>
            <Text variant="caption" style={styles.muted}>
              {formatDate(group.createdAt)} · {group.orders.length} ürün
            </Text>
          </View>
          <StatusBadge status={group.status} config={uiOrderStatusConfig} size="sm" />
        </View>
        <View style={[styles.headerRow, styles.totalRow]}>
          <Text variant="label">Toplam</Text>
          <Text variant="label" style={styles.price}>{formatPrice(group.totalAmount)}</Text>
        </View>
      </Card>

      {group.orders.length > 1 && (
        <Card variant="elevated" padding={12} style={styles.card}>
          <View style={styles.noteRow}>
            <Ionicons name="information-circle-outline" size={18} color={colors.info[600]!} />
            <Text variant="caption" style={styles.noteText}>
              İade veya iptal işlemleri ürün bazında yapılır. İlgili ürüne dokunarak
              iptal (kargo öncesi) ya da iade (kargo sonrası) talebi açabilirsiniz.
            </Text>
          </View>
        </Card>
      )}
    </>
  );
}

/** Tek ürün satırı — kendi kargo takibi + iade/iptal aksiyonu (self-gated). */
export function GroupOrderRow({ order, multi }: { order: GroupOrder; multi: boolean }) {
  const d = deriveOrderRow(order);

  return (
    <Card variant="elevated" padding={0} style={styles.card}>
      <Pressable onPress={() => router.push(`/orders/${order.id}` as any)}>
        <View style={styles.itemHeader}>
          <Text variant="caption" style={styles.muted}>#{order.orderNumber}</Text>
          {/* Tek siparişli grupta öğe rozeti, üstteki grup rozetiyle aynı → yalnız 2+ siparişte göster. */}
          {multi && <StatusBadge status={badgeStatusOf(order)} config={uiOrderStatusConfig} size="sm" />}
        </View>
        <View style={styles.itemContent}>
          <Image source={{ uri: getOrderProductImageUri(order.product) }} style={styles.productImage} />
          <View style={styles.itemInfo}>
            <Text variant="label" numberOfLines={2}>{order.product.title}</Text>
            <Text variant="caption" style={styles.muted}>Satıcı: {order.seller?.displayName}</Text>
            <Text variant="label" style={styles.price}>{formatPrice(order.totalAmount)}</Text>
          </View>
        </View>

        {d.showTracking && (
          <View style={styles.shipmentRow}>
            <Ionicons
              name={d.isDelivered ? 'checkmark-circle' : 'cube-outline'}
              size={16}
              color={d.isDelivered ? colors.success[600]! : colors.primary[600]!}
            />
            <Text variant="caption" style={styles.shipmentText}>
              {d.isDelivered ? 'Teslim Edildi' : 'Kargo Takip'}: {d.tracking}
            </Text>
            <Ionicons name="chevron-forward" size={16} color={colors.text.subtle} />
          </View>
        )}

        {d.actionLabel && (
          <View style={styles.actionRow}>
            <Ionicons
              name={d.isPreShipment ? 'close-circle-outline' : 'return-up-back'}
              size={16}
              color={colors.primary[600]!}
            />
            <Text variant="caption" style={styles.actionText}>{d.actionLabel}</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.text.subtle} />
          </View>
        )}
      </Pressable>
    </Card>
  );
}
