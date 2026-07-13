import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Card, Text, Divider, theme } from '@tarodan/ui-native';
import { formatPrice } from '../_lib/format';
import type { OrderDetail } from '../_lib/types';

const { colors } = theme;

/** Teslimat adresi — üyelik/dijital siparişte gizli. */
export function OrderAddressCard({ order, isMembershipOrder }: { order: OrderDetail; isMembershipOrder: boolean }) {
  if (isMembershipOrder) return null;
  const a = order.shippingAddress;
  return (
    <Card variant="elevated" style={styles.card}>
      <Text variant="label" style={styles.sectionTitle}>Teslimat Adresi</Text>
      {a ? (
        <>
          <Text>{a.fullName}</Text>
          <Text variant="caption" style={styles.addressText}>{a.address}</Text>
          <Text variant="caption" style={styles.addressText}>
            {a.district ? `${a.district} / ${a.city}` : a.city}
            {(a.zipCode ?? a.postalCode) ? ` ${a.zipCode ?? a.postalCode}` : ''}
          </Text>
          <Text variant="caption" style={styles.addressText}>Tel: {a.phone}</Text>
        </>
      ) : (
        <Text variant="caption" style={styles.addressText}>
          Teslimat adresi henüz belirlenmedi. Ödemeyi tamamladığınızda adres bilgisi eklenir.
        </Text>
      )}
    </Card>
  );
}

/** Ödeme özeti. */
export function OrderPriceSummary({ order, isMembershipOrder }: { order: OrderDetail; isMembershipOrder: boolean }) {
  const p = order.pricing;
  return (
    <Card variant="elevated" style={styles.card}>
      <Text variant="label" style={styles.sectionTitle}>Ödeme Özeti</Text>
      <View style={styles.priceRow}>
        <Text>Ürün Tutarı</Text>
        <Text>{formatPrice(p?.subtotal ?? order.product.price)}</Text>
      </View>
      {(p?.taxAmount ?? 0) > 0 && (
        <View style={styles.priceRow}>
          <Text>KDV</Text>
          <Text>{formatPrice(p!.taxAmount!)}</Text>
        </View>
      )}
      {!isMembershipOrder && (
        <View style={styles.priceRow}>
          <Text>Kargo</Text>
          <Text>{formatPrice(order.shippingCost)}</Text>
        </View>
      )}
      {(p?.buyerFeeAmount ?? order.buyerFeeAmount ?? 0) > 0 && (
        <View style={styles.priceRow}>
          <Text>Platform ücreti</Text>
          <Text>{formatPrice(p?.buyerFeeAmount ?? order.buyerFeeAmount ?? 0)}</Text>
        </View>
      )}
      {order.isSeller && ((p?.sellerFeeAmount ?? order.sellerFeeAmount ?? 0) > 0 || p?.sellerNetAmount != null) && (
        <>
          <View style={styles.priceRow}>
            <Text>Platform kesintisi</Text>
            <Text>{formatPrice(p?.sellerFeeAmount ?? order.sellerFeeAmount ?? 0)}</Text>
          </View>
          <View style={styles.priceRow}>
            <Text style={{ color: colors.success[600], fontWeight: '600' }}>Net kazanç</Text>
            <Text style={{ color: colors.success[600], fontWeight: '600' }}>{formatPrice(p?.sellerNetAmount ?? 0)}</Text>
          </View>
        </>
      )}
      <Divider style={{ marginVertical: theme.spacing[2] }} />
      <View style={styles.priceRow}>
        <Text variant="h3">Toplam</Text>
        <Text variant="h3" style={styles.totalPrice}>{formatPrice(order.totalAmount)}</Text>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { marginBottom: theme.spacing[3] },
  sectionTitle: { marginBottom: theme.spacing[3], color: colors.text.heading },
  addressText: { color: colors.text.muted, marginTop: theme.spacing[0.5] },
  priceRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: theme.spacing[2] },
  totalPrice: { color: colors.primary[600]!, fontWeight: 'bold' },
});
