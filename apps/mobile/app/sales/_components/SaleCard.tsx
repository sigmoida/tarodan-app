import { View } from 'react-native';
import { Button, Card, Text, StatusBadge } from '@tarodan/ui-native';
import { AppImage } from '@/components/AppImage';
import { getOrderProductImageUri } from '@/utils/orderProductImage';
import { styles } from '../_lib/styles';
import { salesStatusConfig, saleBadgeStatus, formatDate, formatPrice } from '../_lib/status';
import type { Sale } from '../_lib/types';
import type { SaleActionsController } from '../_hooks/useSaleActions';

/** Tek bir satış kartı — durum rozeti, ürün/alıcı, tutar ve durum-bazlı aksiyonlar. */
export function SaleCard({ sale, actions }: { sale: Sale; actions: SaleActionsController }) {
  const { updateStatusMutation, handleMarkAsProcessing, setShipDialog } = actions;

  return (
    <Card variant="elevated" style={styles.saleCard}>
      <View style={styles.saleHeader}>
        <Text variant="caption" style={styles.orderNumber}>
          #{sale.orderNumber}
        </Text>
        <StatusBadge status={saleBadgeStatus(sale)} config={salesStatusConfig} size="sm" />
      </View>

      <View style={styles.saleContent}>
        <AppImage source={getOrderProductImageUri(sale.product, 'card')} style={styles.productImage} />
        <View style={styles.saleInfo}>
          <Text variant="label" numberOfLines={1}>{sale.product.title}</Text>
          <Text variant="caption" style={styles.buyerName}>
            Alıcı: {sale.buyer.displayName}
          </Text>
          {sale.shippingAddress?.city ? (
            <Text variant="caption" style={styles.addressText} numberOfLines={1}>
              📍 {sale.shippingAddress.city}
            </Text>
          ) : null}
        </View>
        <View style={styles.priceSection}>
          <Text variant="h3" style={styles.price}>{formatPrice(sale.totalAmount)}</Text>
          <Text variant="caption" style={styles.dateText}>{formatDate(sale.createdAt)}</Text>
        </View>
      </View>

      {/* Action Buttons */}
      {sale.status === 'paid' && (
        <View style={styles.actionButtons}>
          <Button
            variant="primary"
            title="Hazırlanıyor Olarak İşaretle"
            onPress={() => handleMarkAsProcessing(sale)}
            isLoading={
              updateStatusMutation.isPending &&
              updateStatusMutation.variables?.orderId === sale.id
            }
          />
        </View>
      )}

      {sale.status === 'processing' && (
        <View style={styles.actionButtons}>
          <Button
            variant="primary"
            title="Kargoya Ver"
            onPress={() => setShipDialog({ visible: true, order: sale })}
          />
        </View>
      )}
    </Card>
  );
}
