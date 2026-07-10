import React from 'react';
import { View } from 'react-native';
import { Divider, Text } from '@tarodan/ui-native';
import { formatPrice } from '@/utils/format';
import { styles } from '../_lib/styles';

/** Ödeme detayı özeti — her adımda görünür. */
export function OrderSummary({
  itemCount,
  subtotal,
  shippingCost,
  effectiveShippingCity,
  buyerFee,
  taxAmount,
  total,
}: {
  itemCount: number;
  subtotal: number;
  shippingCost: number;
  effectiveShippingCity: string;
  buyerFee: number;
  taxAmount: number;
  total: number;
}) {
  return (
    <View style={styles.orderSummary}>
      <Text style={styles.orderSummaryTitle}>Ödeme Detayı</Text>
      <View style={styles.orderSummaryRow}>
        <Text style={styles.orderSummaryLabel}>Ara Toplam ({itemCount} ürün)</Text>
        <Text style={styles.orderSummaryValue}>{formatPrice(subtotal)}</Text>
      </View>
      <View style={styles.orderSummaryRow}>
        <Text style={styles.orderSummaryLabel}>Kargo (Sürat)</Text>
        <Text style={styles.orderSummaryValue}>{effectiveShippingCity ? formatPrice(shippingCost) : 'İl seçin'}</Text>
      </View>
      {buyerFee > 0 ? (
        <View style={styles.orderSummaryRow}>
          <Text style={styles.orderSummaryLabel}>Platform Hizmet Bedeli</Text>
          <Text style={styles.orderSummaryValue}>{formatPrice(buyerFee)}</Text>
        </View>
      ) : null}
      {taxAmount > 0 ? (
        <View style={styles.orderSummaryRow}>
          <Text style={styles.orderSummaryLabel}>KDV</Text>
          <Text style={styles.orderSummaryValue}>{formatPrice(taxAmount)}</Text>
        </View>
      ) : null}
      <Divider style={{ marginVertical: 12 }} />
      <View style={styles.orderSummaryRow}>
        <Text style={styles.orderTotalLabel}>Toplam</Text>
        <Text style={styles.orderTotalValue}>{formatPrice(total)}</Text>
      </View>
    </View>
  );
}
