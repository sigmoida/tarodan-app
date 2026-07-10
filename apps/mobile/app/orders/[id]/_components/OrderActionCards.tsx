import React from 'react';
import { View, Pressable, Linking, StyleSheet } from 'react-native';
import { Card, Text, Button, StatusBadge, theme } from '@tarodan/ui-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { REFUND_STATUS_LABELS } from '../_lib/status';
import { formatDate } from '../_lib/format';
import type { OrderDetail } from '../_lib/types';
import type { OrderView } from '../_lib/derive';

const { colors, radius } = theme;

/** Kargo öncesi sipariş iptali. */
export function OrderCancelCard({
  order,
  view,
  onCancel,
  cancelPending,
}: {
  order: OrderDetail;
  view: OrderView;
  onCancel: () => void;
  cancelPending: boolean;
}) {
  if (!(order.isBuyer && !view.isMembershipOrder && view.isPreShipment && !order.activeRefundRequest)) return null;
  return (
    <Card variant="elevated" style={styles.card}>
      <Text variant="label" style={styles.sectionTitle}>Sipariş İptali</Text>
      <Text variant="caption" style={styles.confirmNote}>
        Sipariş henüz kargoya verilmedi. İptal ederseniz ödemeniz iade edilir.
      </Text>
      <Button
        testID="order-cancel-button"
        variant="outline"
        icon="close-circle-outline"
        fullWidth
        title="Siparişi İptal Et"
        onPress={onCancel}
        isLoading={cancelPending}
        disabled={cancelPending}
        style={{ marginTop: 12, borderColor: colors.danger[600]! }}
      />
    </Card>
  );
}

/** Değerlendirme butonları — yalnız alıcı. */
export function OrderRatingButtons({
  order,
  view,
  onRate,
}: {
  order: OrderDetail;
  view: OrderView;
  onRate: (type: 'product' | 'seller') => void;
}) {
  if (!(view.canRate && order.isBuyer)) return null;
  return (
    <Card variant="elevated" style={styles.card}>
      <Text variant="label" style={styles.sectionTitle}>Değerlendirme</Text>
      <View style={styles.ratingButtons}>
        {!order.hasProductRating && (
          <Button variant="outline" icon="star" title="Ürünü Değerlendir" onPress={() => onRate('product')} style={styles.rateButton} />
        )}
        {!order.hasSellerRating && (
          <Button variant="outline" icon="person" title="Satıcıyı Değerlendir" onPress={() => onRate('seller')} style={styles.rateButton} />
        )}
        {order.hasProductRating && order.hasSellerRating && (
          <View style={styles.ratedMessage}>
            <Ionicons name="checkmark-circle" size={20} color={colors.success[600]!} />
            <Text style={styles.ratedText}>Değerlendirmeniz alındı</Text>
          </View>
        )}
      </View>
    </Card>
  );
}

/** Aktif iade talebi banner'ı. */
export function OrderRefundBanner({
  order,
  view,
  onCancelRefund,
  cancelRefundPending,
}: {
  order: OrderDetail;
  view: OrderView;
  onCancelRefund: () => void;
  cancelRefundPending: boolean;
}) {
  const rr = order.activeRefundRequest;
  if (!(rr && !view.isCancelled)) return null;
  return (
    <Card variant="elevated" style={styles.card} testID="refund-active-banner">
      <View style={styles.refundHeaderRow}>
        <Ionicons name="return-up-back" size={20} color={colors.info[600]!} />
        <Text variant="label" style={styles.refundHeaderText}>İade Talebi</Text>
        <StatusBadge status={rr.status} config={REFUND_STATUS_LABELS} size="sm" />
      </View>
      {rr.refundNumber ? (
        <Text variant="caption" style={styles.refundMeta}>{rr.refundNumber} · {formatDate(rr.createdAt)}</Text>
      ) : null}
      {rr.status === 'return_shipment_open' && rr.returnTrackingNumber ? (
        <View style={styles.refundTrackingBox}>
          <Text variant="caption" style={styles.refundTrackingHint}>
            Bu numarayı paketle birlikte herhangi bir Sürat şubesine bırakın:
          </Text>
          <Text style={styles.refundTrackingNumber}>{rr.returnTrackingNumber}</Text>
          {rr.returnProvider === 'surat' ? (
            <Button
              variant="outline"
              icon="cube"
              title="Sürat'ta Takip Et"
              onPress={() =>
                Linking.openURL(
                  `https://www.suratkargo.com.tr/KargoTakip/?kargotakipno=${encodeURIComponent(rr.returnTrackingNumber!)}`,
                )
              }
              style={{ marginTop: 8 }}
            />
          ) : null}
        </View>
      ) : null}
      {['pending_review', 'wait_for_delivery'].includes(rr.status) && (
        <Button
          testID="refund-cancel-button"
          variant="outline"
          icon="close-circle-outline"
          title="Talebi İptal Et"
          onPress={onCancelRefund}
          isLoading={cancelRefundPending}
          disabled={cancelRefundPending}
          style={{ marginTop: 12, borderColor: colors.danger[600]! }}
        />
      )}
    </Card>
  );
}

/** Kargo sonrası iade aksiyonu (aç / süre-doldu). */
export function OrderRefundActionCard({
  order,
  view,
  onOpenRefund,
}: {
  order: OrderDetail;
  view: OrderView;
  onOpenRefund: () => void;
}) {
  const eligible =
    order.isBuyer &&
    !view.isMembershipOrder &&
    view.isPostShipment &&
    !order.activeRefundRequest &&
    order.payment?.status === 'completed' &&
    !view.isCancelled &&
    order.status !== 'refunded';
  if (!eligible) return null;

  if (view.isPastRefundWindow) {
    return (
      <Card variant="elevated" style={styles.card}>
        <Text variant="label" style={styles.sectionTitle}>İade Süresi Doldu</Text>
        <Text variant="caption" style={styles.refundIntro}>
          14 günlük iade süresi doldu; bu sipariş için artık iade talebi oluşturulamaz.
        </Text>
      </Card>
    );
  }
  return (
    <Card variant="elevated" style={styles.card}>
      <Text variant="label" style={styles.sectionTitle}>İade İşlemleri</Text>
      <Text variant="caption" style={styles.refundIntro}>
        Teslimattan sonra 14 gün içinde sebep belirtmeden iade talep edebilirsiniz.
      </Text>
      <Button
        testID="refund-request-button"
        variant="outline"
        icon="return-up-back"
        title="İade Talep Et"
        onPress={onOpenRefund}
        style={{ marginTop: 8 }}
      />
    </Card>
  );
}

/** Yardım kartı. */
export function OrderHelpCard() {
  return (
    <Card variant="elevated" style={styles.card}>
      <Pressable onPress={() => router.push('/help')}>
        <View style={styles.helpCard}>
          <Ionicons name="help-circle" size={24} color={colors.primary[600]!} />
          <Text style={{ flex: 1, marginLeft: 12 }}>Yardıma mı ihtiyacınız var?</Text>
          <Ionicons name="chevron-forward" size={20} color={colors.text.muted} />
        </View>
      </Pressable>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { marginBottom: 12 },
  sectionTitle: { marginBottom: 12, color: colors.text.heading },
  confirmNote: { textAlign: 'center', color: colors.text.muted },
  ratingButtons: { gap: 8 },
  rateButton: { borderColor: colors.primary[600]! },
  ratedMessage: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 12 },
  ratedText: { marginLeft: 8, color: colors.success[700]! },
  refundHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  refundHeaderText: { flex: 1, color: colors.text.heading },
  refundMeta: { color: colors.text.muted, marginBottom: 6 },
  refundIntro: { color: colors.text.muted },
  refundTrackingBox: { backgroundColor: colors.surface.alt, padding: 12, borderRadius: radius.md, marginTop: 8 },
  refundTrackingHint: { color: colors.text.muted, marginBottom: 4 },
  refundTrackingNumber: { fontWeight: 'bold', color: colors.text.heading, fontSize: 16 },
  helpCard: { flexDirection: 'row', alignItems: 'center' },
});
