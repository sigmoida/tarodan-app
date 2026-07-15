import { View, Image, Pressable } from 'react-native';
import { Button, Divider, Text, theme } from '@tarodan/ui-native';
import { router } from 'expo-router';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { formatPrice, formatOrderStatus, formatRelativeDate } from '@/utils/format';
import { transformImageUrl } from '@/utils/imageUrl';
import { styles } from '../_lib/styles';
import type { SaleDetailController } from '../_hooks/useSaleDetail';

const { colors } = theme;

/** Sipariş detay gövdesi — durum, ürünler, alıcı, adres, kargo, tutar kartları. */
export function SaleDetailBody({ f }: { f: SaleDetailController }) {
  const order = f.order;
  if (!order) return null;

  const p = order.pricing;
  const subtotal = p?.subtotal ?? order.subtotal;
  const shipping = p?.shippingAmount ?? order.shippingCost;
  const commission = p?.commissionAmount ?? order.commission;
  // Stopaj yalnızca kurumsal satıcıda > 0 gelir (GVK 94/19, beyannamede mahsup edilir)
  const withholding = p?.withholdingTaxAmount ?? 0;
  const net = p?.sellerNetAmount ?? order.netAmount;

  return (
    <>
      {/* Status */}
      <View style={[styles.statusBanner, { backgroundColor: f.sc.bg }]}>
        <Ionicons name="information-circle" size={20} color={f.sc.fg} />
        <View style={{ flex: 1 }}>
          <Text style={[styles.statusText, { color: f.sc.fg }]}>{formatOrderStatus(f.displayStatus)}</Text>
          <Text style={[styles.statusSub, { color: f.sc.fg }]}>{formatRelativeDate(order.createdAt)}</Text>
        </View>
      </View>

      {/* Items */}
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Ürünler</Text>
        {(order.items || []).map((item) => (
          <Pressable
            key={item.id}
            style={({ pressed }) => [styles.itemRow, { opacity: pressed ? 0.85 : 1 }]}
            onPress={() => router.push(`/product/${item.product?.id}`)}
          >
            <Image source={{ uri: transformImageUrl(item.product?.imageUrl) }} style={styles.itemImg} />
            <View style={{ flex: 1 }}>
              <Text style={styles.itemTitle} numberOfLines={2}>{item.product?.title}</Text>
              <Text style={styles.itemMeta}>Adet: {item.quantity}</Text>
              <Text style={styles.itemPrice}>{formatPrice(item.price * item.quantity)}</Text>
            </View>
          </Pressable>
        ))}
      </View>

      {/* Buyer */}
      {order.buyer ? (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Alıcı</Text>
          <View style={styles.kvRow}>
            <Ionicons name="person-outline" size={16} color={colors.text.muted} />
            <Text style={styles.kvValue}>{order.buyer.displayName}</Text>
          </View>
          {order.buyer.phone ? (
            <Pressable style={styles.kvRow} onPress={f.handleCall}>
              <Ionicons name="call-outline" size={16} color={colors.text.muted} />
              <Text style={[styles.kvValue, { color: colors.primary[600]! }]}>{order.buyer.phone}</Text>
            </Pressable>
          ) : null}
          {order.buyer.email ? (
            <View style={styles.kvRow}>
              <Ionicons name="mail-outline" size={16} color={colors.text.muted} />
              <Text style={styles.kvValue}>{order.buyer.email}</Text>
            </View>
          ) : null}
        </View>
      ) : null}

      {/* Shipping Address */}
      {order.shippingAddress ? (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Teslimat Adresi</Text>
          <Text style={styles.addressName}>{order.shippingAddress.fullName}</Text>
          <Text style={styles.addressLine}>{order.shippingAddress.address}</Text>
          <Text style={styles.addressLine}>
            {order.shippingAddress.district}, {order.shippingAddress.city}
            {order.shippingAddress.zipCode ? ` ${order.shippingAddress.zipCode}` : ''}
          </Text>
          <Text style={styles.addressLine}>Tel: {order.shippingAddress.phone}</Text>
        </View>
      ) : null}

      {/* Shipment — Sürat Kargo otomatik gönderi (auto-created, read-only) */}
      <View style={styles.card} testID="sales-shipment-card">
        <Text style={styles.sectionTitle}>Kargo Bilgisi (Sürat Kargo)</Text>
        {f.shipmentTracking ? (
          <>
            <View style={styles.kvRow}>
              <MaterialCommunityIcons name="truck-fast-outline" size={18} color={colors.primary[600]!} />
              <Text style={styles.kvValue}>
                {f.isSurat ? 'Sürat Kargo' : f.shipmentProvider || 'Sürat Kargo'}
              </Text>
            </View>
            <View style={styles.kvRow}>
              <Ionicons name="barcode-outline" size={18} color={colors.text.muted} />
              <Text testID="sales-tracking-number" selectable style={[styles.kvValue, { fontWeight: '700' }]}>
                {f.shipmentTracking}
              </Text>
            </View>
            {order.shipment?.status ? (
              <View style={styles.kvRow}>
                <Ionicons name="pulse-outline" size={18} color={colors.text.muted} />
                <Text testID="sales-shipment-status" style={styles.kvValue}>{order.shipment.status}</Text>
              </View>
            ) : null}
            <Text style={styles.helperText}>
              Sürat Kargo şubesinde bu takip numarasıyla ürünü teslim edin. Alıcıya bildirim otomatik gönderilir.
            </Text>
            <Button
              testID="sales-track-link"
              variant="outline"
              icon="cube"
              title="Sürat'ta Takip Et"
              onPress={f.handleTrack}
              style={{ marginTop: theme.spacing[2] }}
            />
          </>
        ) : (
          <Text style={styles.helperText}>
            Ödeme onaylandıktan sonra Sürat Kargo gönderiniz otomatik oluşturulur. Takip numarası kısa süre içinde burada görünecek.
          </Text>
        )}
      </View>

      {/* Totals */}
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Tutar Özeti</Text>
        {subtotal != null ? (
          <View style={styles.kvRow}>
            <Text style={styles.kvLabel}>Ara Toplam</Text>
            <Text style={styles.kvValue}>{formatPrice(subtotal)}</Text>
          </View>
        ) : null}
        {shipping != null ? (
          <View style={styles.kvRow}>
            <Text style={styles.kvLabel}>Kargo</Text>
            <Text style={styles.kvValue}>{formatPrice(shipping)}</Text>
          </View>
        ) : null}
        {commission != null ? (
          <View style={styles.kvRow}>
            <Text style={styles.kvLabel}>Komisyon</Text>
            <Text style={[styles.kvValue, { color: colors.danger[600]! }]}>- {formatPrice(commission)}</Text>
          </View>
        ) : null}
        {withholding > 0 ? (
          <View style={styles.kvRow}>
            <Text style={styles.kvLabel}>Stopaj (tevkifat)</Text>
            <Text style={[styles.kvValue, { color: colors.danger[600]! }]}>- {formatPrice(withholding)}</Text>
          </View>
        ) : null}
        <Divider style={{ marginVertical: theme.spacing[2] }} />
        <View style={styles.kvRow}>
          <Text style={[styles.kvLabel, { fontWeight: '700' }]}>{net != null ? 'Net Kazanç' : 'Toplam'}</Text>
          <Text style={[styles.kvValue, { fontSize: 18, fontWeight: '800', color: colors.primary[600]! }]}>
            {formatPrice(net ?? order.totalAmount ?? 0)}
          </Text>
        </View>
      </View>
    </>
  );
}
