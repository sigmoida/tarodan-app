import React from 'react';
import { View, Pressable, Linking, StyleSheet } from 'react-native';
import { Card, Text, Button, StatusBadge, theme } from '@tarodan/ui-native';
import { Ionicons } from '@expo/vector-icons';
import { uiOrderStatusConfig } from '../_lib/status';
import { formatDate, formatPrice } from '../_lib/format';
import type { OrderDetail } from '../_lib/types';
import type { OrderView } from '../_lib/derive';

const { colors } = theme;

/** Ödeme güvencesi (escrow) kartı. */
export function OrderEscrowCard({ order, view }: { order: OrderDetail; view: OrderView }) {
  if (
    !(order.isBuyer !== false && !view.isMembershipOrder && view.isPostShipment && !view.isCancelled && order.status !== 'refunded')
  )
    return null;
  return (
    <Card variant="elevated" style={styles.card} testID="order-escrow-info">
      <View style={styles.escrowHeaderRow}>
        <Ionicons name="shield-checkmark-outline" size={20} color={colors.info[600]!} />
        <Text variant="label" style={styles.escrowHeaderText}>Ödeme Güvencesi</Text>
        {view.hasActiveRefund && (
          <StatusBadge
            status="frozen"
            config={{ frozen: { label: 'İade nedeniyle bekletiliyor', variant: 'warning' } }}
            size="sm"
          />
        )}
      </View>
      {view.hasActiveRefund ? (
        <Text variant="caption" style={styles.escrowText}>
          Açık iade talebiniz olduğu için satıcıya ödeme, iade süreci sonuçlanana kadar bekletiliyor.
        </Text>
      ) : view.payoutReleaseDate ? (
        <Text variant="caption" style={styles.escrowText}>
          Satıcıya ödeme, teslimden 14 gün sonra otomatik serbest kalır. Tahmini serbest kalma:{' '}
          {formatDate(view.payoutReleaseDate.toISOString())}. Bu süre içinde dilediğiniz zaman iade talep edebilirsiniz.
        </Text>
      ) : (
        <Text variant="caption" style={styles.escrowText}>
          Satıcıya ödeme, teslimattan 14 gün sonra otomatik serbest kalır. Onaylamanıza gerek yoktur; bu süre içinde iade talep edebilirsiniz.
        </Text>
      )}
    </Card>
  );
}

/** İptal bilgi kartı. */
export function OrderCancelledInfo({ view }: { view: OrderView }) {
  if (!view.isCancelled) return null;
  return (
    <Card variant="elevated" style={styles.card} testID="order-cancelled-info">
      <View style={styles.cancelledHeaderRow}>
        <Ionicons name="close-circle-outline" size={20} color={colors.danger[600]!} />
        <Text variant="label" style={styles.cancelledHeaderText}>Sipariş İptal Edildi</Text>
      </View>
      <Text variant="caption" style={styles.escrowText}>
        Bu sipariş iptal edildi. Ödemeniz iade işlemine alındı; bankanıza yansıması birkaç iş günü sürebilir.
      </Text>
    </Card>
  );
}

/** Ödeme bekliyor kartı — "Ödeme Yap" butonu. */
export function OrderPayPendingCard({
  order,
  view,
  onPay,
  payPending,
}: {
  order: OrderDetail;
  view: OrderView;
  onPay: () => void;
  payPending: boolean;
}) {
  if (!(order.status === 'pending' && !view.isPaid && order.isBuyer !== false)) return null;
  return (
    <Card variant="elevated" style={styles.card}>
      <Text variant="label" style={styles.sectionTitle}>Ödeme Bekliyor</Text>
      <Text variant="caption" style={styles.confirmNote}>Siparişinizi tamamlamak için ödemeyi yapın.</Text>
      <Button
        testID="order-pay-button"
        variant="primary"
        fullWidth
        isLoading={payPending}
        title={`Ödeme Yap · ${formatPrice(order.totalAmount)}`}
        onPress={onPay}
        style={{ marginTop: theme.spacing[3] }}
      />
    </Card>
  );
}

/** Kargo takip kartı. */
export function OrderTrackingCard({ order, view }: { order: OrderDetail; view: OrderView }) {
  if (!view.showTrackingCard) return null;
  return (
    <Card variant="elevated" style={styles.card} testID="order-tracking-card">
      <View style={styles.trackingHeaderRow}>
        <Text variant="label" style={styles.sectionTitle}>Kargo Takip</Text>
        <StatusBadge status={view.isDelivered ? 'delivered' : 'shipped'} config={uiOrderStatusConfig} size="sm" />
      </View>
      <View style={styles.trackingRow}>
        <Ionicons
          name={view.isDelivered ? 'checkmark-circle' : 'location'}
          size={20}
          color={view.isDelivered ? colors.success[600]! : colors.primary[600]!}
        />
        <View style={styles.trackingInfo}>
          <Text testID="order-tracking-number">{order.trackingNumber}</Text>
          {view.isDelivered ? (
            <Text variant="caption" style={styles.trackingDeliveredText}>Kargonuz teslim edildi.</Text>
          ) : order.trackingUrl ? (
            <Pressable onPress={() => Linking.openURL(order.trackingUrl!)}>
              <Text style={styles.trackLink}>Kargo Sitesinde Takip Et</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { marginBottom: theme.spacing[3] },
  sectionTitle: { marginBottom: theme.spacing[3], color: colors.text.heading },
  confirmNote: { textAlign: 'center', color: colors.text.muted },
  escrowHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing[2], marginBottom: theme.spacing[1.5] },
  escrowHeaderText: { flex: 1, color: colors.text.heading },
  escrowText: { color: colors.text.muted, lineHeight: 18 },
  cancelledHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing[2], marginBottom: theme.spacing[1.5] },
  cancelledHeaderText: { flex: 1, color: colors.text.heading },
  trackingHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  trackingRow: { flexDirection: 'row', alignItems: 'center' },
  trackingInfo: { flex: 1, marginLeft: theme.spacing[3] },
  trackLink: { color: colors.primary[600]!, marginTop: theme.spacing[1] },
  trackingDeliveredText: { color: colors.text.muted, marginTop: theme.spacing[1] },
});
