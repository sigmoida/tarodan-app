import { View, ScrollView, StyleSheet, Pressable, Image, Linking, Alert, Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import {
  Button,
  Card,
  Spinner,
  Divider,
  Modal,
  RadioGroup,
  Snackbar,
  StatusBadge,
  Input,
  Text,
  theme,
  ScreenHeader,
} from '@tarodan/ui-native';
import type { BadgeVariant } from '@tarodan/ui-native';
import { useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { api, ordersApi, refundsApi, mediaApi, type RNFile } from '../../src/services/api';
import { ThemedRefreshControl } from '../../src/components/common';
import { useRefresh } from '../../src/hooks/useRefresh';
import RatingModal from '../../src/components/RatingModal';
import { AwaitingConfirmationBanner } from '../../src/components/AwaitingConfirmationBanner';
import { captureException } from '../../src/services/sentry';
import { safeString } from '../../src/utils/safeString';
import { apiStatusToUi, type UiOrderStatus } from '../../src/utils/orderStatus';
import { getOrderProductImageUri } from '../../src/utils/orderProductImage';

const { colors, spacing, radius } = theme;

interface OrderDetail {
  id: string;
  orderNumber: string;
  status: string;
  totalAmount: number;
  shippingCost: number;
  product: {
    id: string;
    title: string;
    price: number;
    condition: string;
    images?: Array<{ url: string }>;
    imageUrl?: string;
  };
  seller: {
    id: string;
    displayName: string;
    avatarUrl?: string;
  };
  shippingAddress: {
    fullName: string;
    phone: string;
    address: string;
    district?: string;
    city: string;
    postalCode?: string;
    zipCode?: string;
  } | null;
  trackingNumber?: string;
  trackingUrl?: string;
  createdAt: string;
  paidAt?: string;
  shippedAt?: string;
  deliveredAt?: string;
  completedAt?: string;
  // 48h pencere (Faz 1.2)
  confirmationDeadline?: string;
  buyerConfirmedAt?: string;
  buyerConfirmationType?: string;
  hasProductRating?: boolean;
  hasSellerRating?: boolean;
  isBuyer?: boolean;
  isSeller?: boolean;
  payment?: { status?: string } | null;
  activeRefundRequest?: {
    id: string;
    refundNumber?: string;
    status: string;
    reason?: string;
    createdAt: string;
    returnTrackingNumber?: string | null;
    returnProvider?: string | null;
  } | null;
}

const REFUND_REASONS: Array<{ value: string; label: string }> = [
  { value: 'damaged', label: 'Hasarlı geldi' },
  { value: 'not_as_described', label: 'Açıklamayla uyuşmuyor' },
  { value: 'wrong_item', label: 'Yanlış ürün geldi' },
  { value: 'missing_parts', label: 'Eksik parça var' },
  { value: 'changed_mind', label: 'Vazgeçtim' },
  { value: 'other', label: 'Diğer' },
];

// Kanıt fotoğrafı gerektiren iade sebepleri — web/backend ile birebir parite.
const REASONS_REQUIRING_EVIDENCE = ['damaged', 'wrong_item', 'not_as_described', 'missing_parts'];
const MAX_EVIDENCE_PHOTOS = 5;

const REFUND_STATUS_LABELS: Record<string, { label: string; variant: BadgeVariant }> = {
  pending_review: { label: 'Talep İnceleniyor', variant: 'info' },
  approved: { label: 'Onaylandı, İşleniyor', variant: 'info' },
  wait_for_delivery: { label: 'Ürün Tesliminden Sonra İade Açılacak', variant: 'info' },
  return_shipment_open: { label: 'İade Kargonuz Hazır', variant: 'info' },
  return_in_transit: { label: 'İade Yolda', variant: 'info' },
  return_delivered: { label: 'Satıcıya Ulaştı, Para İadesi Yapılıyor', variant: 'info' },
  refunded: { label: 'İade Tamamlandı', variant: 'success' },
  rejected: { label: 'Talep Reddedildi', variant: 'danger' },
  disputed: { label: 'İtirazlı (İnceleniyor)', variant: 'warning' },
  cancelled: { label: 'İptal Edildi', variant: 'secondary' },
};

const uiOrderStatusConfig: Record<string, { label: string; variant: BadgeVariant }> = {
  pending: { label: 'Ödeme bekliyor', variant: 'warning' },
  paid: { label: 'Ödendi', variant: 'info' },
  processing: { label: 'Hazırlanıyor', variant: 'info' },
  shipped: { label: 'Kargoda', variant: 'primary' },
  delivered: { label: 'Teslim Edildi', variant: 'success' },
  awaiting_confirmation: { label: 'Onayınız Bekleniyor', variant: 'warning' },
  completed: { label: 'Tamamlandı', variant: 'success' },
  cancelled: { label: 'İptal Edildi', variant: 'danger' },
  refunded: { label: 'İade', variant: 'secondary' },
};

export default function OrderDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const queryClient = useQueryClient();
  const [ratingModal, setRatingModal] = useState<{
    visible: boolean;
    type: 'product' | 'seller';
  }>({ visible: false, type: 'product' });
  const [refundModalVisible, setRefundModalVisible] = useState(false);
  const [refundReason, setRefundReason] = useState<string>('damaged');
  const [refundDescription, setRefundDescription] = useState('');
  const [evidenceAssets, setEvidenceAssets] = useState<RNFile[]>([]);

  const evidenceRequired = REASONS_REQUIRING_EVIDENCE.includes(refundReason);
  const [snackbar, setSnackbar] = useState<{ visible: boolean; message: string; variant: 'success' | 'danger' | 'default' }>({
    visible: false,
    message: '',
    variant: 'default',
  });

  // Fetch order detail
  const { data: order, isLoading, refetch } = useQuery({
    queryKey: ['order', id],
    queryFn: async () => {
      try {
        const response = await api.get(`/orders/${id}`);
        const data = response.data?.data ?? response.data;
        if (!data) return null;
        return {
          ...data,
          status: apiStatusToUi(data.status),
          product: {
            ...(data.product || {}),
            imageUrl: data.product?.imageUrl,
          },
        };
      } catch (error) {
        console.log('Failed to fetch order');
        return null;
      }
    },
    enabled: !!id,
  });

  const { refreshing, onRefresh } = useRefresh(refetch);

  // Refund request mutation
  const refundMutation = useMutation({
    mutationFn: async () => {
      const body: { reason: string; description?: string; evidencePhotoUrls?: string[] } = {
        reason: refundReason,
      };
      const desc = refundDescription.trim();
      if (desc.length > 0) body.description = desc;
      // Kanıt fotoğraflarını yükle (web ile parite: tek tek /media/upload?folder=reviews)
      if (evidenceAssets.length > 0) {
        const results = await Promise.all(
          evidenceAssets.map((file) => mediaApi.uploadRefundEvidence(file)),
        );
        const urls = results.map((r) => r.data?.url).filter(Boolean) as string[];
        if (urls.length > 0) body.evidencePhotoUrls = urls;
      }
      return refundsApi.create(id as string, body);
    },
    onSuccess: () => {
      setRefundModalVisible(false);
      setRefundDescription('');
      setEvidenceAssets([]);
      setSnackbar({ visible: true, message: 'İade talebiniz oluşturuldu.', variant: 'success' });
      queryClient.invalidateQueries({ queryKey: ['order', id] });
      queryClient.invalidateQueries({ queryKey: ['orders'] });
    },
    onError: (err: any) => {
      captureException(err, {
        level: 'error',
        tags: { flow: 'refund.create' },
        extra: { orderId: String(id ?? ''), reason: refundReason },
      });
      const msg =
        err?.response?.data?.message ||
        (Array.isArray(err?.response?.data?.message)
          ? err.response.data.message.join(', ')
          : 'İade talebi oluşturulamadı.');
      setSnackbar({
        visible: true,
        message: typeof msg === 'string' ? msg : 'İade talebi oluşturulamadı.',
        variant: 'danger',
      });
    },
  });

  // Kanıt fotoğrafı seç (galeri) — en fazla MAX_EVIDENCE_PHOTOS adet.
  const pickEvidence = async () => {
    const remaining = MAX_EVIDENCE_PHOTOS - evidenceAssets.length;
    if (remaining <= 0) return;
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('İzin Gerekli', 'Fotoğraf eklemek için galeri erişim izni gerekiyor.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      selectionLimit: remaining,
      quality: 0.8,
    });
    if (result.canceled || !result.assets?.length) return;
    const picked: RNFile[] = result.assets.slice(0, remaining).map((a, i) => ({
      uri: Platform.OS === 'android' ? a.uri : a.uri.replace('file://', ''),
      name: a.fileName || `evidence_${i}.jpg`,
      type: a.mimeType || 'image/jpeg',
    }));
    setEvidenceAssets((prev) => [...prev, ...picked]);
  };

  const removeEvidence = (index: number) => {
    setEvidenceAssets((prev) => prev.filter((_, i) => i !== index));
  };

  // Gönder — kanıt zorunluysa en az bir foto şartını istemci tarafında da doğrula.
  const submitRefund = () => {
    if (evidenceRequired && evidenceAssets.length === 0) {
      setSnackbar({
        visible: true,
        message: 'Bu sebep için en az bir kanıt fotoğrafı gereklidir.',
        variant: 'danger',
      });
      return;
    }
    refundMutation.mutate();
  };

  // Refund cancel mutation (only valid in pending_review / wait_for_delivery)
  const cancelRefundMutation = useMutation({
    mutationFn: async (refundId: string) => {
      return refundsApi.cancel(refundId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['order', id] });
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      setSnackbar({ visible: true, message: 'İade talebi iptal edildi.', variant: 'success' });
    },
    onError: (err: any) => {
      captureException(err, {
        level: 'error',
        tags: { flow: 'refund.cancel' },
        extra: { orderId: String(id ?? '') },
      });
      const msg =
        err?.response?.data?.message ||
        (Array.isArray(err?.response?.data?.message)
          ? err.response.data.message.join(', ')
          : 'İptal başarısız.');
      setSnackbar({
        visible: true,
        message: typeof msg === 'string' ? msg : 'İptal başarısız.',
        variant: 'danger',
      });
    },
  });

  const handleCancelRefund = () => {
    const rr = order?.activeRefundRequest;
    if (!rr) return;
    Alert.alert(
      'İade Talebini İptal Et',
      'İade talebiniz iptal edilecek. Devam edilsin mi?',
      [
        { text: 'Vazgeç', style: 'cancel' },
        {
          text: 'İptal Et',
          style: 'destructive',
          onPress: () => cancelRefundMutation.mutate(rr.id),
        },
      ],
    );
  };

  // Confirm delivery mutation
  const confirmDeliveryMutation = useMutation({
    mutationFn: async () => {
      return ordersApi.confirm(id as string);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['order', id] });
      queryClient.invalidateQueries({ queryKey: ['orders'] });
    },
  });

  // 48h pencere — alıcı erken onay (Faz 4C.4)
  const confirmReceiptMutation = useMutation({
    mutationFn: async () => ordersApi.confirmReceipt(id as string),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['order', id] });
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      Alert.alert('Teşekkürler', 'Sipariş onaylandı. Satıcıya ödeme transferi tetiklendi.');
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.message || err?.message || 'Onay başarısız';
      Alert.alert('Hata', msg);
    },
  });

  const formatDate = (dateString?: string) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString('tr-TR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatPrice = (price: number | null | undefined) => {
    if (price == null || isNaN(price)) {
      return '₺0';
    }
    return `₺${price.toLocaleString('tr-TR')}`;
  };

  const canRate = order && ['delivered', 'completed'].includes(order.status);

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <Spinner size="lg" />
      </View>
    );
  }

  if (!order) {
    return (
      <View style={styles.centeredContainer}>
        <Ionicons name="alert-circle-outline" size={64} color={colors.danger[600]!} />
        <Text style={{ marginTop: 16 }}>Sipariş bulunamadı</Text>
        <Button variant="primary" title="Geri Dön" onPress={() => router.back()} style={{ marginTop: 16 }} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScreenHeader title="Sipariş Detayı" onBack={() => router.back()} />

      <ScrollView
        style={styles.content}
        refreshControl={<ThemedRefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* 48h pencere banner (Faz 4C.4) */}
        {order.status === 'awaiting_confirmation' &&
          order.confirmationDeadline &&
          (order as any).isBuyer !== false && (
            <AwaitingConfirmationBanner
              confirmationDeadline={order.confirmationDeadline}
              onConfirm={() => confirmReceiptMutation.mutate()}
              onReportProblem={() =>
                // Refund request route henüz mobile'da yok; geçici olarak order detay'da kalır.
                // Faz 4+ kapsamında mobile refund-request flow eklenince burası güncellenecek.
                Alert.alert(
                  'Sorun Bildirme',
                  'Sorun bildirimi için lütfen profil > Yardım üzerinden iletişime geçin. (Mobile iade akışı yakında eklenecek.)',
                )
              }
              confirming={confirmReceiptMutation.isPending}
            />
          )}

        {/* Order Status */}
        <Card variant="elevated" style={styles.card}>
          <View style={styles.statusHeader}>
            <Text variant="caption" style={styles.orderNumber}>
              Sipariş #{order.orderNumber}
            </Text>
            <StatusBadge status={order.status} config={uiOrderStatusConfig} size="sm" />
          </View>

          {/* Status Timeline */}
          <View style={styles.timeline}>
            <TimelineItem
              icon="cart"
              label="Sipariş Oluşturuldu"
              date={formatDate(order.createdAt)}
              isActive={true}
            />
            <TimelineItem
              icon="card"
              label="Ödeme Yapıldı"
              date={formatDate(order.paidAt)}
              isActive={!!order.paidAt}
            />
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
              isLast
            />
          </View>
        </Card>

        {/* Ödeme Bekliyor — alıcı ödemeyi tamamlasın (örn. kabul edilen tekliften oluşan sipariş) */}
        {order.status === 'pending' && order.isBuyer !== false && (
          <Card variant="elevated" style={styles.card}>
            <Text variant="label" style={styles.sectionTitle}>Ödeme Bekliyor</Text>
            <Text variant="caption" style={styles.confirmNote}>
              Siparişinizi tamamlamak için ödemeyi yapın.
            </Text>
            <Button
              testID="order-pay-button"
              variant="primary"
              fullWidth
              title={`Ödeme Yap · ${formatPrice(order.totalAmount)}`}
              onPress={() =>
                router.push({
                  pathname: '/payment/[id]',
                  params: { id: order.id, orderId: order.id, provider: 'paytr', guest: '0' },
                } as any)
              }
              style={{ marginTop: 12 }}
            />
          </Card>
        )}

        {/* Tracking Info */}
        {order.trackingNumber && (
          <Card variant="elevated" style={styles.card} testID="order-tracking-card">
            <Text variant="label" style={styles.sectionTitle}>Kargo Takip</Text>
            <View style={styles.trackingRow}>
              <Ionicons name="location" size={20} color={colors.primary[600]!} />
              <View style={styles.trackingInfo}>
                <Text testID="order-tracking-number">{order.trackingNumber}</Text>
                {order.trackingUrl && (
                  <Pressable onPress={() => Linking.openURL(order.trackingUrl!)}>
                    <Text style={styles.trackLink}>Kargo Sitesinde Takip Et</Text>
                  </Pressable>
                )}
              </View>
            </View>
          </Card>
        )}

        {/* Product */}
        <Card variant="elevated" style={styles.card}>
          <Pressable onPress={() => router.push(`/product/${order.product.id}`)}>
            <View style={styles.productCard}>
              <Image
                source={{ uri: getOrderProductImageUri(order.product) }}
                style={styles.productImage}
              />
              <View style={styles.productInfo}>
                <Text variant="label" numberOfLines={2}>{order.product.title}</Text>
                <Text variant="caption" style={styles.conditionText}>
                  Durum: {safeString(order.product?.condition)}
                </Text>
                <Text variant="h3" style={styles.productPrice}>
                  {formatPrice(order.product.price)}
                </Text>
              </View>
            </View>
          </Pressable>
        </Card>

        {/* Seller */}
        <Card variant="elevated" style={styles.card}>
          <Pressable onPress={() => router.push(`/seller/${order.seller.id}`)}>
            <View style={styles.sellerCard}>
              <Ionicons name="storefront" size={24} color={colors.primary[600]!} />
              <View style={styles.sellerInfo}>
                <Text variant="label">{order.seller.displayName}</Text>
                <Text variant="caption" style={styles.sellerLink}>Satıcı Profilini Görüntüle</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.text.muted} />
            </View>
          </Pressable>
        </Card>

        {/* Shipping Address */}
        <Card variant="elevated" style={styles.card}>
          <Text variant="label" style={styles.sectionTitle}>Teslimat Adresi</Text>
          {order.shippingAddress ? (
            <>
              <Text>{order.shippingAddress.fullName}</Text>
              <Text variant="caption" style={styles.addressText}>
                {order.shippingAddress.address}
              </Text>
              <Text variant="caption" style={styles.addressText}>
                {order.shippingAddress.district
                  ? `${order.shippingAddress.district} / ${order.shippingAddress.city}`
                  : order.shippingAddress.city}
                {(order.shippingAddress.zipCode ?? order.shippingAddress.postalCode)
                  ? ` ${order.shippingAddress.zipCode ?? order.shippingAddress.postalCode}`
                  : ''}
              </Text>
              <Text variant="caption" style={styles.addressText}>
                Tel: {order.shippingAddress.phone}
              </Text>
            </>
          ) : (
            <Text variant="caption" style={styles.addressText}>
              Teslimat adresi henüz belirlenmedi. Ödemeyi tamamladığınızda adres bilgisi eklenir.
            </Text>
          )}
        </Card>

        {/* Price Summary */}
        <Card variant="elevated" style={styles.card}>
          <Text variant="label" style={styles.sectionTitle}>Ödeme Özeti</Text>
          <View style={styles.priceRow}>
            <Text>Ürün Tutarı</Text>
            <Text>{formatPrice(order.product.price)}</Text>
          </View>
          <View style={styles.priceRow}>
            <Text>Kargo</Text>
            <Text>{formatPrice(order.shippingCost)}</Text>
          </View>
          <Divider style={{ marginVertical: 8 }} />
          <View style={styles.priceRow}>
            <Text variant="h3">Toplam</Text>
            <Text variant="h3" style={styles.totalPrice}>
              {formatPrice(order.totalAmount)}
            </Text>
          </View>
        </Card>

        {/* Actions - Only buyer can confirm delivery */}
        {order.status === 'delivered' && order.isBuyer && (
          <Card variant="elevated" style={styles.card}>
            <Button
              testID="order-confirm-delivery-button"
              variant="primary"
              fullWidth
              title="Teslimatı Onayla"
              onPress={() => confirmDeliveryMutation.mutate()}
              isLoading={confirmDeliveryMutation.isPending}
              style={{ marginBottom: 12 }}
            />
            <Text variant="caption" style={styles.confirmNote}>
              Ürünü aldığınızı onaylayarak siparişi tamamlayın
            </Text>
          </Card>
        )}

        {/* Rating Buttons - Only buyer can rate product and seller */}
        {canRate && order.isBuyer && (
          <Card variant="elevated" style={styles.card}>
            <Text variant="label" style={styles.sectionTitle}>Değerlendirme</Text>
            <View style={styles.ratingButtons}>
              {!order.hasProductRating && (
                <Button
                  variant="outline"
                  icon="star"
                  title="Ürünü Değerlendir"
                  onPress={() => setRatingModal({ visible: true, type: 'product' })}
                  style={styles.rateButton}
                />
              )}
              {!order.hasSellerRating && (
                <Button
                  variant="outline"
                  icon="person"
                  title="Satıcıyı Değerlendir"
                  onPress={() => setRatingModal({ visible: true, type: 'seller' })}
                  style={styles.rateButton}
                />
              )}
              {order.hasProductRating && order.hasSellerRating && (
                <View style={styles.ratedMessage}>
                  <Ionicons name="checkmark-circle" size={20} color={colors.success[600]!} />
                  <Text style={styles.ratedText}>Değerlendirmeniz alındı</Text>
                </View>
              )}
            </View>
          </Card>
        )}

        {/* Refund — existing request banner */}
        {order.activeRefundRequest && (
          <Card variant="elevated" style={styles.card} testID="refund-active-banner">
            <View style={styles.refundHeaderRow}>
              <Ionicons name="return-up-back" size={20} color={colors.info[600]!} />
              <Text variant="label" style={styles.refundHeaderText}>
                İade Talebi
              </Text>
              <StatusBadge
                status={order.activeRefundRequest.status}
                config={REFUND_STATUS_LABELS}
                size="sm"
              />
            </View>
            {order.activeRefundRequest.refundNumber ? (
              <Text variant="caption" style={styles.refundMeta}>
                {order.activeRefundRequest.refundNumber} ·{' '}
                {formatDate(order.activeRefundRequest.createdAt)}
              </Text>
            ) : null}
            {order.activeRefundRequest.status === 'return_shipment_open' &&
            order.activeRefundRequest.returnTrackingNumber ? (
              <View style={styles.refundTrackingBox}>
                <Text variant="caption" style={styles.refundTrackingHint}>
                  Bu numarayı paketle birlikte herhangi bir Sürat şubesine bırakın:
                </Text>
                <Text style={styles.refundTrackingNumber}>
                  {order.activeRefundRequest.returnTrackingNumber}
                </Text>
                {order.activeRefundRequest.returnProvider === 'surat' ? (
                  <Button
                    variant="outline"
                    icon="cube"
                    title="Sürat'ta Takip Et"
                    onPress={() =>
                      Linking.openURL(
                        `https://www.suratkargo.com.tr/KargoTakip/?kargotakipno=${encodeURIComponent(
                          order.activeRefundRequest!.returnTrackingNumber!,
                        )}`,
                      )
                    }
                    style={{ marginTop: 8 }}
                  />
                ) : null}
              </View>
            ) : null}
            {['pending_review', 'wait_for_delivery'].includes(
              order.activeRefundRequest.status,
            ) && (
              <Button
                testID="refund-cancel-button"
                variant="outline"
                icon="close-circle-outline"
                title="Talebi İptal Et"
                onPress={handleCancelRefund}
                isLoading={cancelRefundMutation.isPending}
                disabled={cancelRefundMutation.isPending}
                style={{ marginTop: 12, borderColor: colors.danger[600]! }}
              />
            )}
          </Card>
        )}

        {/* Refund — request button (paid+ orders, buyer only, no active request) */}
        {order.isBuyer &&
          !order.activeRefundRequest &&
          order.payment?.status === 'completed' &&
          !['cancelled', 'refunded'].includes(order.status) && (
            <Card variant="elevated" style={styles.card}>
              <Text variant="label" style={styles.sectionTitle}>
                İade İşlemleri
              </Text>
              <Text variant="caption" style={styles.refundIntro}>
                Ödeme tamamlandı. Gerekirse iade işlemi başlatabilirsiniz.
              </Text>
              <Button
                testID="refund-request-button"
                variant="outline"
                icon="return-up-back"
                title="İade Talep Et"
                onPress={() => setRefundModalVisible(true)}
                style={{ marginTop: 8 }}
              />
            </Card>
          )}

        {/* Help */}
        <Card variant="elevated" style={styles.card}>
          <Pressable onPress={() => router.push('/help')}>
            <View style={styles.helpCard}>
              <Ionicons name="help-circle" size={24} color={colors.primary[600]!} />
              <Text style={{ flex: 1, marginLeft: 12 }}>
                Yardıma mı ihtiyacınız var?
              </Text>
              <Ionicons name="chevron-forward" size={20} color={colors.text.muted} />
            </View>
          </Pressable>
        </Card>

        <View style={{ height: 50 }} />
      </ScrollView>

      {/* Refund Request Modal */}
      <Modal
        isOpen={refundModalVisible}
        onClose={() => {
          setRefundModalVisible(false);
          setEvidenceAssets([]);
        }}
        title="İade Talebi Oluştur"
      >
        <ScrollView>
          <Text variant="caption" style={styles.refundModalHint}>
            Lütfen iade nedeninizi seçin ve gerekiyorsa kısa bir açıklama ekleyin.
          </Text>

          <Text variant="caption" style={styles.refundModalLabel}>
            İade Nedeni
          </Text>
          <RadioGroup
            value={refundReason}
            onChange={setRefundReason}
            options={REFUND_REASONS}
          />

          <Input
            label="Açıklama (isteğe bağlı)"
            placeholder="Sorunu kısaca anlatın..."
            value={refundDescription}
            onChangeText={setRefundDescription}
            multiline
            numberOfLines={4}
            containerStyle={{ marginTop: 12 }}
            inputStyle={{ minHeight: 80 }}
          />

          {/* Kanıt Fotoğrafı — yalnızca kanıt gerektiren sebeplerde (web ile parite) */}
          {evidenceRequired ? (
            <View style={styles.evidenceSection}>
              <Text variant="caption" style={styles.refundModalLabel}>
                Kanıt Fotoğrafı <Text style={styles.evidenceRequiredMark}>*</Text>
              </Text>
              <Text variant="caption" style={styles.evidenceHint}>
                Bu sebep için en az bir fotoğraf ekleyin (en fazla {MAX_EVIDENCE_PHOTOS}).
              </Text>
              <View style={styles.evidenceGrid}>
                {evidenceAssets.map((a, i) => (
                  <View key={`${a.uri}-${i}`} style={styles.evidenceThumbWrap}>
                    <Image source={{ uri: a.uri }} style={styles.evidenceThumb} />
                    <Pressable
                      style={styles.evidenceRemove}
                      onPress={() => removeEvidence(i)}
                      hitSlop={6}
                      accessibilityRole="button"
                      accessibilityLabel="Fotoğrafı kaldır"
                    >
                      <Ionicons name="close" size={14} color={colors.white} />
                    </Pressable>
                  </View>
                ))}
                {evidenceAssets.length < MAX_EVIDENCE_PHOTOS ? (
                  <Pressable
                    style={styles.evidenceAdd}
                    onPress={pickEvidence}
                    accessibilityRole="button"
                    accessibilityLabel="Fotoğraf ekle"
                  >
                    <Ionicons name="camera-outline" size={22} color={colors.text.muted} />
                    <Text style={styles.evidenceAddText}>Ekle</Text>
                  </Pressable>
                ) : null}
              </View>
            </View>
          ) : null}

          <View style={styles.refundModalActions}>
            <Button
              variant="ghost"
              title="Vazgeç"
              onPress={() => {
                setRefundModalVisible(false);
                setEvidenceAssets([]);
              }}
              disabled={refundMutation.isPending}
            />
            <Button
              variant="primary"
              title="Talebi Gönder"
              onPress={submitRefund}
              isLoading={refundMutation.isPending}
              disabled={refundMutation.isPending || (evidenceRequired && evidenceAssets.length === 0)}
            />
          </View>
        </ScrollView>
      </Modal>

      <Snackbar
        visible={snackbar.visible}
        onDismiss={() => setSnackbar({ visible: false, message: '', variant: 'default' })}
        duration={3500}
        variant={snackbar.variant}
      >
        {snackbar.message}
      </Snackbar>

      {/* Rating Modal */}
      <RatingModal
        visible={ratingModal.visible}
        onDismiss={() => setRatingModal({ ...ratingModal, visible: false })}
        type={ratingModal.type}
        orderId={order.id}
        productId={order.product.id}
        sellerId={order.seller.id}
        productTitle={order.product.title}
        sellerName={order.seller.displayName}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ['order', id] });
          setSnackbar({
            visible: true,
            variant: 'success',
            message: 'Değerlendirmeniz alındı. Onaylandıktan sonra yayınlanacak.',
          });
        }}
      />
    </View>
  );
}

// Timeline Item Component
function TimelineItem({
  icon,
  label,
  date,
  isActive,
  isLast = false,
  testID,
}: {
  icon: string;
  label: string;
  date: string;
  isActive: boolean;
  isLast?: boolean;
  testID?: string;
}) {
  return (
    <View testID={testID} style={styles.timelineItem}>
      <View style={styles.timelineIcon}>
        <View style={[
          styles.iconCircle,
          isActive ? styles.iconCircleActive : styles.iconCircleInactive,
        ]}>
          <Ionicons
            name={icon as any}
            size={16}
            color={isActive ? colors.white : colors.text.subtle}
          />
        </View>
        {!isLast && (
          <View style={[
            styles.timelineLine,
            isActive ? styles.timelineLineActive : styles.timelineLineInactive,
          ]} />
        )}
      </View>
      <View style={styles.timelineContent}>
        <Text style={isActive ? styles.activeLabel : styles.inactiveLabel}>
          {label}
        </Text>
        <Text variant="caption" style={styles.timelineDate}>{date}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface.alt,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  centeredContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    flex: 1,
    padding: 16,
  },
  card: {
    marginBottom: 12,
  },
  statusHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  orderNumber: {
    color: colors.text.muted,
  },
  timeline: {
    marginTop: 8,
  },
  timelineItem: {
    flexDirection: 'row',
  },
  timelineIcon: {
    alignItems: 'center',
    width: 32,
  },
  iconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconCircleActive: {
    backgroundColor: colors.primary[600]!,
  },
  iconCircleInactive: {
    backgroundColor: colors.surface.alt,
  },
  timelineLine: {
    width: 2,
    height: 32,
    marginVertical: 4,
  },
  timelineLineActive: {
    backgroundColor: colors.primary[600]!,
  },
  timelineLineInactive: {
    backgroundColor: colors.surface.alt,
  },
  timelineContent: {
    flex: 1,
    marginLeft: 12,
    paddingBottom: 24,
  },
  activeLabel: {
    color: colors.text.heading,
    fontWeight: '500',
  },
  inactiveLabel: {
    color: colors.text.subtle,
  },
  timelineDate: {
    color: colors.text.muted,
    marginTop: 2,
  },
  sectionTitle: {
    marginBottom: 12,
    color: colors.text.heading,
  },
  trackingRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  trackingInfo: {
    flex: 1,
    marginLeft: 12,
  },
  trackLink: {
    color: colors.primary[600]!,
    marginTop: 4,
  },
  productCard: {
    flexDirection: 'row',
  },
  productImage: {
    width: 80,
    height: 80,
    borderRadius: radius.md,
    backgroundColor: colors.surface.alt,
  },
  productInfo: {
    flex: 1,
    marginLeft: 12,
  },
  conditionText: {
    color: colors.text.muted,
    marginTop: 4,
  },
  productPrice: {
    color: colors.primary[600]!,
    fontWeight: 'bold',
    marginTop: 4,
  },
  sellerCard: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  sellerInfo: {
    flex: 1,
    marginLeft: 12,
  },
  sellerLink: {
    color: colors.primary[600]!,
  },
  addressText: {
    color: colors.text.muted,
    marginTop: 2,
  },
  priceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  totalPrice: {
    color: colors.primary[600]!,
    fontWeight: 'bold',
  },
  confirmNote: {
    textAlign: 'center',
    color: colors.text.muted,
  },
  ratingButtons: {
    gap: 8,
  },
  rateButton: {
    borderColor: colors.primary[600]!,
  },
  ratedMessage: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
  },
  ratedText: {
    marginLeft: 8,
    color: colors.success[700]!,
  },
  helpCard: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  refundHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  refundHeaderText: {
    flex: 1,
    color: colors.text.heading,
  },
  refundMeta: {
    color: colors.text.muted,
    marginBottom: 6,
  },
  refundIntro: {
    color: colors.text.muted,
  },
  refundTrackingBox: {
    backgroundColor: colors.surface.alt,
    padding: 12,
    borderRadius: radius.md,
    marginTop: 8,
  },
  refundTrackingHint: {
    color: colors.text.muted,
    marginBottom: 4,
  },
  refundTrackingNumber: {
    fontWeight: 'bold',
    color: colors.text.heading,
    fontSize: 16,
  },
  refundModalHint: {
    color: colors.text.muted,
    marginBottom: 12,
  },
  refundModalLabel: {
    color: colors.text.heading,
    fontWeight: '600',
    marginTop: 8,
    marginBottom: 4,
  },
  refundModalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 16,
  },
  evidenceSection: {
    marginTop: 12,
  },
  evidenceRequiredMark: {
    color: colors.danger[600]!,
    fontWeight: '700',
  },
  evidenceHint: {
    color: colors.text.muted,
    marginBottom: 8,
  },
  evidenceGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  evidenceThumbWrap: {
    width: 72,
    height: 72,
    borderRadius: radius.md,
    overflow: 'visible',
  },
  evidenceThumb: {
    width: 72,
    height: 72,
    borderRadius: radius.md,
    backgroundColor: colors.gray[100],
  },
  evidenceRemove: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.danger[600]!,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.white,
  },
  evidenceAdd: {
    width: 72,
    height: 72,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.border.DEFAULT,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface.alt,
  },
  evidenceAddText: {
    fontSize: 11,
    color: colors.text.muted,
    marginTop: 2,
  },
});
