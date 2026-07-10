import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Card, Text, StatusBadge, theme } from '@tarodan/ui-native';
import { TimelineItem } from './TimelineItem';
import { badgeStatusOf, uiOrderStatusConfig } from '../_lib/status';
import { formatDate } from '../_lib/format';
import type { OrderDetail } from '../_lib/types';
import type { OrderView } from '../_lib/derive';

const { colors } = theme;

/** Sipariş numarası + rozet + durum timeline'ı. */
export function OrderStatusCard({ order, view }: { order: OrderDetail; view: OrderView }) {
  return (
    <Card variant="elevated" style={styles.card}>
      <View style={styles.statusHeader}>
        <Text variant="caption" style={styles.orderNumber}>Sipariş #{order.orderNumber}</Text>
        <StatusBadge status={badgeStatusOf(order)} config={uiOrderStatusConfig} size="sm" />
      </View>

      <View style={styles.timeline}>
        <TimelineItem icon="cart" label="Sipariş Oluşturuldu" date={formatDate(order.createdAt)} isActive />
        <TimelineItem icon="card" label="Ödeme Yapıldı" date={formatDate(order.paidAt)} isActive={view.isPaid} />
        <TimelineItem
          testID="order-shipped-timeline"
          icon="cube"
          label="Kargoya Verildi"
          date={formatDate(order.shippedAt)}
          isActive={!!order.shippedAt}
        />
        <TimelineItem
          icon="checkmark-circle"
          label="Teslim Edildi"
          date={formatDate(order.deliveredAt)}
          isActive={!!order.deliveredAt}
          isLast={!view.showRefundCancelStep}
        />
        {view.showRefundCancelStep && (
          <TimelineItem
            testID="order-refundcancel-timeline"
            icon={view.isCancelled ? 'close-circle' : 'arrow-undo'}
            label={view.refundCancelLabel}
            date={formatDate(view.refundCancelDate)}
            isActive
            isLast
          />
        )}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { marginBottom: 12 },
  statusHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  orderNumber: { color: colors.text.muted },
  timeline: { marginTop: 8 },
});
