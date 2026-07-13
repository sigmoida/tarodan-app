import React from 'react';
import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text, Divider, theme } from '@tarodan/ui-native';

import { styles } from '../_lib/styles';
import {
  getStatusInfo,
  formatTrackDate,
  getStatusSteps,
  CLOSED_TRACK_STATUSES,
  CLOSED_TRACK_HINTS,
  type OrderStatus,
} from '../_lib/status';

const { colors } = theme;

/** Result card: header status, product, price, shipping, and timeline. */
export function OrderTrackResult({ order }: { order: OrderStatus }) {
  return (
    <View style={styles.resultCard}>
      <View style={styles.resultHeader}>
        <View style={styles.resultHeaderInfo}>
          <Text style={styles.orderNumber}>{order.orderNumber}</Text>
          <Text style={styles.orderDate}>{formatTrackDate(order.createdAt)}</Text>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: getStatusInfo(order.status).color }]}>
          <Ionicons name={getStatusInfo(order.status).icon as any} size={16} color={colors.white} />
          <Text style={styles.statusText}>{getStatusInfo(order.status).label}</Text>
        </View>
      </View>

      <Divider style={{ marginVertical: theme.spacing[4] }} />

      {/* Product Info */}
      <View style={styles.productSection}>
        <Text style={styles.sectionTitle}>Ürün</Text>
        <Text style={styles.productTitle}>{order.product.title}</Text>
      </View>

      {/* Price Info — guest-track yanıtında yalnızca toplam tutar var (kırılım yok) */}
      <View style={styles.priceSection}>
        <View style={styles.priceRow}>
          <Text style={styles.totalLabel}>Toplam</Text>
          <Text style={styles.totalValue}>₺{(order.totalAmount ?? 0).toLocaleString('tr-TR')}</Text>
        </View>
      </View>

      {/* Shipping Info */}
      {order.shipment && (
        <View style={styles.shippingSection}>
          <Text style={styles.sectionTitle}>Kargo Bilgileri</Text>
          <View style={styles.shippingInfo}>
            <View style={styles.shippingRow}>
              <Text style={styles.shippingLabel}>Kargo Firması</Text>
              <Text style={styles.shippingValue}>
                {order.shipment.provider === 'surat' ? 'Sürat Kargo' : order.shipment.provider}
              </Text>
            </View>
            {order.shipment.trackingNumber && (
              <View style={styles.shippingRow}>
                <Text style={styles.shippingLabel}>Takip Numarası</Text>
                <Text style={[styles.shippingValue, styles.trackingNumber]}>
                  {order.shipment.trackingNumber}
                </Text>
              </View>
            )}
            {order.shipment.estimatedDelivery && (
              <View style={styles.shippingRow}>
                <Text style={styles.shippingLabel}>Tahmini Teslimat</Text>
                <Text style={styles.shippingValue}>
                  {formatTrackDate(order.shipment.estimatedDelivery)}
                </Text>
              </View>
            )}
          </View>
        </View>
      )}

      {/* Timeline */}
      <View style={styles.timelineSection}>
        <Text style={styles.sectionTitle}>Sipariş Durumu</Text>
        {CLOSED_TRACK_STATUSES.includes(order.status) ? (
          <View style={styles.closedState}>
            <View style={[styles.closedIcon, { backgroundColor: getStatusInfo(order.status).color }]}>
              <Ionicons name={getStatusInfo(order.status).icon as any} size={22} color={colors.white} />
            </View>
            <Text style={styles.closedLabel}>{getStatusInfo(order.status).label}</Text>
            <Text style={styles.closedHint}>{CLOSED_TRACK_HINTS[order.status] ?? ''}</Text>
          </View>
        ) : (
          <View style={styles.timeline}>
            {['pending_payment', 'paid', 'preparing', 'shipped', 'delivered'].map((status, index) => {
              const statusInfo = getStatusInfo(status);
              const isActive = getStatusSteps(order.status) >= index;
              const isCurrent = order.status === status;

              return (
                <View key={status} style={styles.timelineItem}>
                  <View style={[
                    styles.timelineDot,
                    isActive && { backgroundColor: colors.primary[600]! },
                    isCurrent && styles.timelineDotCurrent,
                  ]}>
                    {isActive && (
                      <Ionicons
                        name={isCurrent ? statusInfo.icon as any : 'checkmark'}
                        size={12}
                        color={colors.white}
                      />
                    )}
                  </View>
                  {index < 4 && (
                    <View style={[
                      styles.timelineLine,
                      isActive && { backgroundColor: colors.primary[600]! },
                    ]} />
                  )}
                  <Text style={[
                    styles.timelineLabel,
                    isActive && styles.timelineLabelActive,
                    isCurrent && styles.timelineLabelCurrent,
                  ]}>
                    {statusInfo.label}
                  </Text>
                </View>
              );
            })}
          </View>
        )}
      </View>
    </View>
  );
}
