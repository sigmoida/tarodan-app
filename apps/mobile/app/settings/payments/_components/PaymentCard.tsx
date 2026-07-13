import { View, Pressable } from 'react-native';
import { Card, Text, theme } from '@tarodan/ui-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { formatPrice } from '@/utils/format';
import { styles } from '../_lib/styles';
import { STATUS_COLORS, formatDate } from '../_lib/status';
import type { Payment } from '../_lib/types';
import type { PaymentsController } from '../_hooks/usePayments';

const { colors } = theme;

/** Tek ödeme kartı — durum/sağlayıcı, tutar, hata, aksiyonlar (iptal/tekrar/sipariş). */
export function PaymentCard({ p, f }: { p: Payment; f: PaymentsController }) {
  const status = STATUS_COLORS[p.status] ?? STATUS_COLORS.pending;

  return (
    <Card style={styles.paymentCard}>
      <View style={styles.cardHeader}>
        <View style={{ flex: 1 }}>
          <Text style={styles.orderNumber}>
            {p.orderNumber ? `#${p.orderNumber}` : `Sipariş #${p.orderId.slice(0, 8)}`}
          </Text>
          {p.product?.title ? (
            <Text style={styles.productTitle} numberOfLines={2}>{p.product.title}</Text>
          ) : null}
        </View>
        <Text style={styles.amount}>{formatPrice(p.amount)}</Text>
      </View>

      <View style={styles.metaRow}>
        <View style={[styles.statusChip, { backgroundColor: status.bg }]}>
          <Ionicons name={status.icon} size={13} color={status.fg} />
          <Text style={[styles.statusText, { color: status.fg }]}>{status.label}</Text>
        </View>
        <View style={styles.providerWrap}>
          <Ionicons name="card-outline" size={13} color={colors.text.muted} />
          <Text style={styles.providerText}>{p.provider?.toUpperCase()}</Text>
        </View>
      </View>

      <Text style={styles.dateText}>{formatDate(p.paidAt || p.createdAt)}</Text>

      {p.failureReason ? (
        <View style={styles.failureBox}>
          <Ionicons name="alert-circle" size={14} color={colors.danger[600]!} />
          <Text style={styles.failureText}>{p.failureReason}</Text>
        </View>
      ) : null}

      <View style={styles.actions}>
        {p.status === 'pending' && (
          <Pressable onPress={() => f.handleCancel(p.id)} style={[styles.actionButton, styles.cancelButton]}>
            <Ionicons name="close-circle-outline" size={16} color={colors.danger[600]!} />
            <Text style={[styles.actionLabel, { color: colors.danger[600]! }]}>İptal</Text>
          </Pressable>
        )}
        {p.status === 'failed' && (
          <Pressable onPress={() => f.handleRetry(p.id)} style={[styles.actionButton, styles.retryButton]}>
            <Ionicons name="refresh" size={16} color={colors.primary[600]!} />
            <Text style={[styles.actionLabel, { color: colors.primary[600]! }]}>Yeniden Dene</Text>
          </Pressable>
        )}
        <Pressable
          onPress={() => router.push({ pathname: '/orders/[id]', params: { id: p.orderId } } as any)}
          style={[styles.actionButton, styles.viewButton]}
        >
          <Ionicons name="receipt-outline" size={16} color={colors.text.muted} />
          <Text style={[styles.actionLabel, { color: colors.text.muted }]}>Sipariş</Text>
        </Pressable>
      </View>
    </Card>
  );
}
