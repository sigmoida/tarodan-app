import { View, ScrollView, StyleSheet, Pressable, Image, Linking, Platform } from 'react-native';
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
  appAlert,
  EmptyState,
} from '@tarodan/ui-native';
import type { BadgeVariant } from '@tarodan/ui-native';
import { useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { api, ordersApi, refundsApi, mediaApi, paymentsApi, elogoInvoicesApi, sellerInvoiceApi, type RNFile } from '../../src/services/api';
import { ThemedRefreshControl } from '../../src/components/common';
import { useRefresh } from '../../src/hooks/useRefresh';
import RatingModal from '../../src/components/RatingModal';
import { captureException } from '../../src/services/sentry';
import { formatCondition } from '../../src/utils/format';
import { apiStatusToUi, type UiOrderStatus } from '../../src/utils/orderStatus';
import { getOrderProductImageUri } from '../../src/utils/orderProductImage';

const { colors, radius } = theme;

interface OrderDetail {
  id: string;
  orderNumber: string;
  isMembership?: boolean;
  status: string;
  quantity?: number;
  cancellationType?: 'iptal' | 'iade' | null;
  totalAmount: number;
  shippingCost: number;
  buyerFeeAmount?: number;
  sellerFeeAmount?: number;
  commissionAmount?: number;
  pricing?: {
    subtotal: number;
    shippingAmount: number;
    buyerFeeAmount: number;
    sellerFeeAmount: number;
    commissionAmount: number;
    taxAmount?: number;
    totalAmount: number;
    sellerNetAmount: number;
  };
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
  // İPTAL akışında set edilir; İADE tamamlanınca backend bunu YAZMAZ (tarih için
  // activeRefundRequest.refundedAt'a düşülür).
  cancelledAt?: string | null;
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
    refundedAt?: string | null;
    returnTrackingNumber?: string | null;
    returnProvider?: string | null;
  } | null;
}

// 14 gün koşulsuz iade (Mesafeli Satış cayma hakkı): sebep/foto opsiyonel.
// "changed_mind" (fikrim değişti) artık kabul ediliyor; ilk seçenek.
const REFUND_REASONS: Array<{ value: string; label: string }> = [
  { value: 'changed_mind', label: 'Fikrim değişti / vazgeçtim' },
  { value: 'damaged', label: 'Hasarlı geldi' },
  { value: 'not_as_described', label: 'Açıklamayla uyuşmuyor' },
  { value: 'wrong_item', label: 'Yanlış ürün geldi' },
  { value: 'missing_parts', label: 'Eksik parça var' },
  { value: 'other', label: 'Diğer' },
];

const MAX_EVIDENCE_PHOTOS = 5;
// Saticiya ödeme = teslim + 14 gün cayma penceresi (+1 gün grace). Banner/escrow metni.
const COOLING_OFF_DAYS = 14;

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
  refunded: { label: 'İade Edildi', variant: 'secondary' },
  refund_requested: { label: 'İade Sürecinde', variant: 'danger' },
};

// Rozet önceliği (liste ile aynı mantık): aktif iade > iptal > normal durum.
// - activeRefundRequest dolu ama HENÜZ tamamlanmadıysa → 'refund_requested'
//   ("İade Sürecinde"), sipariş 'delivered' kalsa bile.
// - İade TAMAMLANDIYSA (status 'refunded') → 'refunded' ("İade Edildi");
//   pickActiveRefundRequest tamamlanmış talebi de döndürdüğü için bu ayrım şart,
//   yoksa biten iade "İade Sürecinde" görünür.
// - cancellationType === 'iptal' → 'cancelled' ("İptal Edildi"); status 'refunded'
//   olsa bile "İade Edildi" DEME.
const badgeStatusOf = (o: any): string => {
  if (o?.activeRefundRequest) {
    return o.activeRefundRequest.status === 'refunded' ? 'refunded' : 'refund_requested';
  }
  if (o?.cancellationType === 'iptal') return 'cancelled';
  return o?.status;
};

export default function OrderDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const queryClient = useQueryClient();
  const [ratingModal, setRatingModal] = useState<{
    visible: boolean;
    type: 'product' | 'seller';
  }>({ visible: false, type: 'product' });
  const [refundModalVisible, setRefundModalVisible] = useState(false);
  const [refundReason, setRefundReason] = useState<string>('changed_mind');
  const [refundDescription, setRefundDescription] = useState('');
  const [evidenceAssets, setEvidenceAssets] = useState<RNFile[]>([]);
  // Adet bazlı kısmi iade: kaç adet iade edilecek (quantity>1 olan siparişlerde seçilir).
  const [refundQuantity, setRefundQuantity] = useState(1);

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
          // Adet bazlı kısmi iade: backend detayında üst-seviye quantity yoksa
          // items[0].quantity'ye düş (tek-ürünlü siparişte 1).
          quantity: data.quantity ?? data.items?.[0]?.quantity ?? 1,
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

  // eLogo e-Arşiv (gerçek yasal fatura) — yalnız HAZIRSA buton çıkar.
  const orderStatus = order?.status;
  const { data: elogoInvoice } = useQuery({
    queryKey: ['elogo-invoice', id],
    queryFn: async () => {
      try {
        const res = await elogoInvoicesApi.byOrder(id as string);
        return res.data ?? null;
      } catch {
        return null;
      }
    },
    enabled:
      !!id &&
      !!orderStatus &&
      orderStatus !== 'pending' &&
      orderStatus !== 'cancelled' &&
      orderStatus !== 'refunded',
  });
  const [downloadingInvoice, setDownloadingInvoice] = useState(false);
  const handleViewInvoice = async () => {
    if (!elogoInvoice?.id) return;
    setDownloadingInvoice(true);
    try {
      const res = await elogoInvoicesApi.pdf(elogoInvoice.id);
      const url = res.data?.url;
      if (url) {
        await Linking.openURL(url);
      } else {
        setSnackbar({ visible: true, message: 'Fatura henüz hazır değil', variant: 'danger' });
      }
    } catch {
      setSnackbar({ visible: true, message: 'Fatura açılamadı', variant: 'danger' });
    } finally {
      setDownloadingInvoice(false);
    }
  };

  // Kurumsal satıcının siparişe yüklediği ürün faturası (varsa alıcı/satıcı indirebilir).
  const { data: sellerInvoice } = useQuery({
    queryKey: ['seller-invoice', id],
    queryFn: async () => {
      try {
        const res = await sellerInvoiceApi.status(id as string);
        return res.data ?? null;
      } catch {
        return null;
      }
    },
    enabled:
      !!id &&
      !!orderStatus &&
      orderStatus !== 'pending' &&
      orderStatus !== 'cancelled' &&
      orderStatus !== 'refunded',
  });
  const [downloadingSellerInvoice, setDownloadingSellerInvoice] = useState(false);
  const handleViewSellerInvoice = async () => {
    setDownloadingSellerInvoice(true);
    try {
      const res = await sellerInvoiceApi.download(id as string);
      const url = res.data?.url;
      if (url) {
        await Linking.openURL(url);
      } else {
        setSnackbar({ visible: true, message: 'Fatura bulunamadı', variant: 'danger' });
      }
    } catch {
      setSnackbar({ visible: true, message: 'Fatura açılamadı', variant: 'danger' });
    } finally {
      setDownloadingSellerInvoice(false);
    }
  };

  // Refund request mutation
  const refundMutation = useMutation({
    mutationFn: async () => {
      const body: {
        reason: string;
        description?: string;
        evidencePhotoUrls?: string[];
        refundQuantity?: number;
      } = {
        reason: refundReason,
      };
      const desc = refundDescription.trim();
      if (desc.length > 0) body.description = desc;
      // Adet bazlı kısmi iade: yalnızca çok adetli siparişte ve tüm adetten azsa gönder.
      const orderQty = order?.quantity ?? 1;
      if (orderQty > 1 && refundQuantity < orderQty) {
        body.refundQuantity = refundQuantity;
      }
      // Kanıt fotoğrafları opsiyonel (14 gün koşulsuz iade). Eklenmişse yükle.
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
      setRefundQuantity(1);
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
      appAlert('İzin Gerekli', 'Fotoğraf eklemek için galeri erişim izni gerekiyor.');
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

  // Gönder — 14 gün koşulsuz iade: sebep/foto opsiyonel, ek doğrulama yok.
  const submitRefund = () => {
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
    appAlert(
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

  // Sipariş iptal mutation (kargo ÖNCESİ — POST /orders/:id/cancel).
  // Alıcı onay butonu kaldırıldı: teslim+14 gün sonunda satıcıya ödeme otomatik
  // serbest kalır; alıcının erken onayı artık payout'u tetiklemiyor.
  const cancelOrderMutation = useMutation({
    mutationFn: async () => ordersApi.cancel(id as string),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['order', id] });
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      setSnackbar({ visible: true, message: 'Siparişiniz iptal edildi.', variant: 'success' });
    },
    onError: (err: any) => {
      captureException(err, {
        level: 'error',
        tags: { flow: 'order.cancel' },
        extra: { orderId: String(id ?? '') },
      });
      const msg =
        err?.response?.data?.message ||
        (Array.isArray(err?.response?.data?.message)
          ? err.response.data.message.join(', ')
          : 'Sipariş iptal edilemedi.');
      setSnackbar({
        visible: true,
        message: typeof msg === 'string' ? msg : 'Sipariş iptal edilemedi.',
        variant: 'danger',
      });
    },
  });

  const handleCancelOrder = () => {
    // 'pending' = ödeme bekleyen sipariş (henüz ödeme alınmadı) → iade vaadi verme.
    const isUnpaid = order?.status === 'pending';
    appAlert(
      'Siparişi İptal Et',
      isUnpaid
        ? 'Sipariş iptal edilecek. Devam edilsin mi?'
        : 'Sipariş iptal edilecek ve ödemeniz iade edilecek. Devam edilsin mi?',
      [
        { text: 'Vazgeç', style: 'cancel' },
        {
          text: 'İptal Et',
          style: 'destructive',
          onPress: () => cancelOrderMutation.mutate(),
        },
      ],
    );
  };

  // Ödeme bekleyen siparişi öde — web ile parite: ÖNCE POST /payments/initiate ile bir
  // ödeme (paymentId) oluştur, SONRA ödeme ekranına git. Doğrudan order.id ile gidersek
  // ödeme ekranı /payments/{orderId}/status'u çağırıp "Ödeme bilgisi yüklenemedi" hatası
  // veriyordu (ekran paymentId bekler, orderId değil).
  const initiatePaymentMutation = useMutation({
    mutationFn: async () => {
      const res: any = await paymentsApi.initiate(id as string);
      return res.data?.data ?? res.data ?? {};
    },
    onSuccess: (data: any) => {
      const paymentId = data?.paymentId || data?.id || data?.payment?.id || (id as string);
      // PAYMENT_BYPASS ortamı: gerçek PayTR token üretilmez → bypass-complete + success
      // (checkout akışıyla aynı; aksi halde ödeme ekranı boş kart formunda takılır).
      if (data?.useBypass === true) {
        paymentsApi.bypassComplete(paymentId).catch((e: any) =>
          captureException(e, {
            level: 'error',
            tags: { flow: 'order.payBypass' },
            extra: { paymentId, orderId: String(id ?? '') },
          }),
        );
        router.replace({
          pathname: '/payment/success',
          params: { paymentId, orderId: String(id) },
        } as any);
        return;
      }
      router.push({
        pathname: '/payment/[id]',
        params: { id: paymentId, orderId: String(id), provider: 'paytr', guest: '0' },
      } as any);
    },
    onError: (err: any) => {
      captureException(err, {
        level: 'error',
        tags: { flow: 'order.payInitiate' },
        extra: { orderId: String(id ?? '') },
      });
      const raw = err?.response?.data?.message;
      const msg = Array.isArray(raw) ? raw.join(', ') : raw || 'Ödeme başlatılamadı. Lütfen tekrar deneyin.';
      setSnackbar({ visible: true, message: typeof msg === 'string' ? msg : 'Ödeme başlatılamadı.', variant: 'danger' });
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

  // Üyelik/dijital siparişler (sanal ürün + platform satıcısı, "MEM-" sipariş no) fiziksel
  // ürün gibi davranmaz: değerlendirme/iade/teslimat adresi/kargo gösterilmez.
  const isMembershipOrder =
    !!order && (order.isMembership ?? order.orderNumber?.startsWith('MEM-') ?? false);

  const canRate =
    order && !isMembershipOrder && ['delivered', 'completed'].includes(order.status);

  // Kargo öncesi = İPTAL, kargo sonrası = İADE (backend cancel endpoint pending/paid/
  // preparing'de geçerli → UI status pending/processing). apiStatusToUi paid+preparing'i
  // 'processing'e indirger; 'pending' ödeme bekleyen sipariştir (ayrı ödeme kartı var).
  const isPreShipment = !!order && ['pending', 'processing'].includes(order.status);
  const isPostShipment =
    !!order &&
    ['shipped', 'delivered', 'awaiting_confirmation', 'completed'].includes(order.status);

  // İptal: kullanıcı kargo öncesi iptal etti (cancellationType='iptal') veya sipariş
  // 'cancelled'. İptal edilen siparişte kargo/escrow/iade gibi kartlar GEÇERSİZ.
  const isCancelled =
    !!order && (order.status === 'cancelled' || order.cancellationType === 'iptal');

  // Kargo/Teslimat kartı: SADECE gerçek gönderi varken. shipment trackingNumber
  // DOLU + order.status kargo sonrası bir durumda. İptal/iade/teslim öncesi gizli.
  // Teslim edilmiş/tamamlanmış siparişte kart, stale shipment.status'a değil
  // order.status'a göre "Teslim Edildi" gösterir.
  const isDelivered =
    !!order && ['delivered', 'awaiting_confirmation', 'completed'].includes(order.status);
  // Kargo takip kartı, gönderi GERÇEKTEN oluşturulduğunda (shippedAt dolu) gösterilir.
  // Sürat gönderisi/trackingNumber ödeme anında oluşabildiği için yalnız trackingNumber'a
  // bakmak "kargoya verilmeden takip linki" hatasına yol açıyordu; shippedAt tek doğru sinyal.
  const showTrackingCard =
    !!order &&
    !!order.trackingNumber &&
    !!order.shippedAt &&
    isPostShipment &&
    !isCancelled &&
    order.status !== 'refunded';

  // Ödeme alındı mı — backend status'u 'pending_payment'ta gecikse bile paidAt /
  // payment.status / kargo-sonrası durum ödemenin alındığını gösterir (web ile parite:
  // web "ödendi"yi status !== 'pending_payment' ile belirler). Aksi halde ödenmiş sipariş
  // "Ödeme Bekliyor" görünüyordu.
  const isPaid =
    !!order &&
    (!!order.paidAt ||
      order.payment?.status === 'completed' ||
      ['processing', 'shipped', 'delivered', 'awaiting_confirmation', 'completed'].includes(
        order.status,
      ));

  // Saticiya ödeme = teslim + 14 gün (iade penceresi). Teslim edilmişse tahmini
  // serbest kalma tarihini göster; açık iade varken hold dondurulur (bekletme rozeti).
  const payoutReleaseDate = (() => {
    if (!order?.deliveredAt) return null;
    const d = new Date(order.deliveredAt);
    d.setDate(d.getDate() + COOLING_OFF_DAYS);
    return d;
  })();
  const hasActiveRefund = !!order?.activeRefundRequest;

  // Timeline son adımı: sipariş iade/iptal durumundaysa mutlu-yolda bitmesin.
  const isRefundedOrder = order?.status === 'refunded' || hasActiveRefund;
  const showRefundCancelStep = isCancelled || isRefundedOrder;
  const refundCancelLabel: string = isCancelled
    ? 'İptal Edildi'
    : order?.activeRefundRequest
      ? REFUND_STATUS_LABELS[order.activeRefundRequest.status]?.label ?? 'İade Sürecinde'
      : 'İade Edildi';
  // Adımın tarihi: İPTAL → order.cancelledAt; İADE → refundedAt (yoksa talebin
  // açılış tarihi). refundedAt üst seviyede gelmez, activeRefundRequest içinde gelir.
  const refundCancelDate: string | undefined = isCancelled
    ? order?.cancelledAt ?? undefined
    : order?.activeRefundRequest?.refundedAt
      ?? order?.activeRefundRequest?.createdAt
      ?? order?.cancelledAt
      ?? undefined;

  // 14 GÜNDEN SONRA İADE YOK: teslimden 14 günden fazla geçtiyse iade penceresi
  // kapalı (backend de reddeder). Teslim edilmemişse pencere henüz başlamadı.
  const isPastRefundWindow = (() => {
    if (!order?.deliveredAt) return false;
    const d = new Date(order.deliveredAt);
    if (Number.isNaN(d.getTime())) return false;
    const ageDays = (Date.now() - d.getTime()) / (1000 * 3600 * 24);
    return ageDays > COOLING_OFF_DAYS;
  })();

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <Spinner size="lg" />
      </View>
    );
  }

  if (!order) {
    return (
      <EmptyState
        fullscreen
        icon="receipt-outline"
        title="Sipariş bulunamadı"
        actionLabel="Geri Dön"
        onAction={() => router.canGoBack() ? router.back() : router.replace('/(tabs)')}
      />
    );
  }

  return (
    <View style={styles.container}>
      <ScreenHeader title="Sipariş Detayı" onBack={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)'))} />

      <ScrollView
        style={styles.content}
        refreshControl={<ThemedRefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* Escrow bilgisi — alıcı onay butonu KALDIRILDI. Satıcıya ödeme teslimden
            14 gün sonra otomatik serbest kalır; alıcının onayı payout'u erkene almaz.
            Açık iade varken ödeme bekletilir (bekletme rozeti). */}
        {order.isBuyer !== false &&
          !isMembershipOrder &&
          isPostShipment &&
          !isCancelled &&
          order.status !== 'refunded' && (
            <Card variant="elevated" style={styles.card} testID="order-escrow-info">
              <View style={styles.escrowHeaderRow}>
                <Ionicons name="shield-checkmark-outline" size={20} color={colors.info[600]!} />
                <Text variant="label" style={styles.escrowHeaderText}>
                  Ödeme Güvencesi
                </Text>
                {hasActiveRefund && (
                  <StatusBadge
                    status="frozen"
                    config={{ frozen: { label: 'İade nedeniyle bekletiliyor', variant: 'warning' } }}
                    size="sm"
                  />
                )}
              </View>
              {hasActiveRefund ? (
                <Text variant="caption" style={styles.escrowText}>
                  Açık iade talebiniz olduğu için satıcıya ödeme, iade süreci sonuçlanana
                  kadar bekletiliyor.
                </Text>
              ) : payoutReleaseDate ? (
                <Text variant="caption" style={styles.escrowText}>
                  Satıcıya ödeme, teslimden 14 gün sonra otomatik serbest kalır.
                  Tahmini serbest kalma: {formatDate(payoutReleaseDate.toISOString())}.
                  Bu süre içinde dilediğiniz zaman iade talep edebilirsiniz.
                </Text>
              ) : (
                <Text variant="caption" style={styles.escrowText}>
                  Satıcıya ödeme, teslimattan 14 gün sonra otomatik serbest kalır.
                  Onaylamanıza gerek yoktur; bu süre içinde iade talep edebilirsiniz.
                </Text>
              )}
            </Card>
          )}

        {/* Order Status */}
        <Card variant="elevated" style={styles.card}>
          <View style={styles.statusHeader}>
            <Text variant="caption" style={styles.orderNumber}>
              Sipariş #{order.orderNumber}
            </Text>
            <StatusBadge status={badgeStatusOf(order)} config={uiOrderStatusConfig} size="sm" />
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
              isActive={isPaid}
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
              isLast={!showRefundCancelStep}
            />
            {/* İade/iptal durumunda timeline mutlu-yolda bitmesin; gerçek son
                durumu (İptal/İade Sürecinde/İade Edildi) ek adım olarak yansıt. */}
            {showRefundCancelStep && (
              <TimelineItem
                testID="order-refundcancel-timeline"
                icon={isCancelled ? 'close-circle' : 'arrow-undo'}
                label={refundCancelLabel}
                date={formatDate(refundCancelDate)}
                isActive
                isLast
              />
            )}
          </View>
        </Card>

        {/* İptal bilgisi — sipariş iptal edildiğinde (kargo öncesi iptal ya da
            'cancelled'). İptalde kargo/escrow/iade kartları gizli; yalnız bu bilgi.
            'refunded' + cancellationType='iptal' de İPTAL sayılır (İade Edildi değil). */}
        {isCancelled && (
          <Card variant="elevated" style={styles.card} testID="order-cancelled-info">
            <View style={styles.cancelledHeaderRow}>
              <Ionicons name="close-circle-outline" size={20} color={colors.danger[600]!} />
              <Text variant="label" style={styles.cancelledHeaderText}>
                Sipariş İptal Edildi
              </Text>
            </View>
            <Text variant="caption" style={styles.escrowText}>
              Bu sipariş iptal edildi. Ödemeniz iade işlemine alındı; bankanıza yansıması
              birkaç iş günü sürebilir.
            </Text>
          </Card>
        )}

        {/* Ödeme Bekliyor — alıcı ödemeyi tamamlasın (örn. kabul edilen tekliften oluşan sipariş).
            Ödeme alınmışsa (isPaid) gösterilmez; aksi halde ödenmiş sipariş "Ödeme Bekliyor" görünürdü. */}
        {order.status === 'pending' && !isPaid && order.isBuyer !== false && (
          <Card variant="elevated" style={styles.card}>
            <Text variant="label" style={styles.sectionTitle}>Ödeme Bekliyor</Text>
            <Text variant="caption" style={styles.confirmNote}>
              Siparişinizi tamamlamak için ödemeyi yapın.
            </Text>
            <Button
              testID="order-pay-button"
              variant="primary"
              fullWidth
              isLoading={initiatePaymentMutation.isPending}
              title={`Ödeme Yap · ${formatPrice(order.totalAmount)}`}
              onPress={() => initiatePaymentMutation.mutate()}
              style={{ marginTop: 12 }}
            />
          </Card>
        )}

        {/* Kargo Takip — yalnız gerçek gönderi varken (trackingNumber dolu + kargo
            sonrası durum). İptal/iade/teslim öncesi gösterilmez. Teslim edilmiş/
            tamamlanmış siparişte kart, eski shipment.status'a değil order.status'a
            göre "Teslim Edildi" durumunu yansıtır. */}
        {showTrackingCard && (
          <Card variant="elevated" style={styles.card} testID="order-tracking-card">
            <View style={styles.trackingHeaderRow}>
              <Text variant="label" style={styles.sectionTitle}>Kargo Takip</Text>
              <StatusBadge
                status={isDelivered ? 'delivered' : 'shipped'}
                config={uiOrderStatusConfig}
                size="sm"
              />
            </View>
            <View style={styles.trackingRow}>
              <Ionicons
                name={isDelivered ? 'checkmark-circle' : 'location'}
                size={20}
                color={isDelivered ? colors.success[600]! : colors.primary[600]!}
              />
              <View style={styles.trackingInfo}>
                <Text testID="order-tracking-number">{order.trackingNumber}</Text>
                {isDelivered ? (
                  <Text variant="caption" style={styles.trackingDeliveredText}>
                    Kargonuz teslim edildi.
                  </Text>
                ) : order.trackingUrl ? (
                  <Pressable onPress={() => Linking.openURL(order.trackingUrl!)}>
                    <Text style={styles.trackLink}>Kargo Sitesinde Takip Et</Text>
                  </Pressable>
                ) : null}
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
                  Durum: {formatCondition(order.product?.condition)}
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

        {/* Shipping Address — üyelik/dijital siparişlerde gösterilmez */}
        {!isMembershipOrder && (
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
        )}

        {/* Price Summary */}
        <Card variant="elevated" style={styles.card}>
          <Text variant="label" style={styles.sectionTitle}>Ödeme Özeti</Text>
          <View style={styles.priceRow}>
            <Text>Ürün Tutarı</Text>
            {/* KDV hariç ürün tutarı; pricing yoksa ham ürün fiyatına düş */}
            <Text>{formatPrice(order.pricing?.subtotal ?? order.product.price)}</Text>
          </View>
          {/* KDV: yalnızca kurumsal satıcıda (taxAmount > 0) ayrı satır */}
          {(order.pricing?.taxAmount ?? 0) > 0 && (
            <View style={styles.priceRow}>
              <Text>KDV</Text>
              <Text>{formatPrice(order.pricing!.taxAmount!)}</Text>
            </View>
          )}
          {!isMembershipOrder && (
            <View style={styles.priceRow}>
              <Text>Kargo</Text>
              <Text>{formatPrice(order.shippingCost)}</Text>
            </View>
          )}
          {(order.pricing?.buyerFeeAmount ?? order.buyerFeeAmount ?? 0) > 0 && (
            <View style={styles.priceRow}>
              <Text>Platform ücreti</Text>
              <Text>{formatPrice(order.pricing?.buyerFeeAmount ?? order.buyerFeeAmount ?? 0)}</Text>
            </View>
          )}
          {order.isSeller &&
            ((order.pricing?.sellerFeeAmount ?? order.sellerFeeAmount ?? 0) > 0 ||
              order.pricing?.sellerNetAmount != null) && (
              <>
                <View style={styles.priceRow}>
                  <Text>Platform kesintisi</Text>
                  <Text>{formatPrice(order.pricing?.sellerFeeAmount ?? order.sellerFeeAmount ?? 0)}</Text>
                </View>
                <View style={styles.priceRow}>
                  <Text style={{ color: colors.success[600], fontWeight: '600' }}>Net kazanç</Text>
                  <Text style={{ color: colors.success[600], fontWeight: '600' }}>
                    {formatPrice(order.pricing?.sellerNetAmount ?? 0)}
                  </Text>
                </View>
              </>
            )}
          <Divider style={{ marginVertical: 8 }} />
          <View style={styles.priceRow}>
            <Text variant="h3">Toplam</Text>
            <Text variant="h3" style={styles.totalPrice}>
              {formatPrice(order.totalAmount)}
            </Text>
          </View>
        </Card>

        {/* Fatura — yalnız gerçek e-Arşiv HAZIRSA çıkar */}
        {elogoInvoice?.id && (
          <Card variant="elevated" style={styles.card} testID="order-invoice-card">
            <Text variant="label" style={styles.sectionTitle}>Fatura</Text>
            <Text variant="caption" style={{ color: colors.text.muted, marginBottom: 8 }}>
              Faturanız e-posta adresinize gönderildi
              {elogoInvoice.invoiceNumber ? ` · No: ${elogoInvoice.invoiceNumber}` : ''}
            </Text>
            <Button
              variant="outline"
              fullWidth
              onPress={handleViewInvoice}
              isLoading={downloadingInvoice}
              disabled={downloadingInvoice}
              title="Faturayı Görüntüle / İndir"
            />
          </Card>
        )}

        {/* Kurumsal satıcı faturası (elle yüklenen PDF) — indirme + satıcıya yükleme yönlendirmesi */}
        {sellerInvoice &&
          (sellerInvoice.invoice || (sellerInvoice.canUpload && sellerInvoice.isSeller)) && (
            <Card variant="elevated" style={styles.card} testID="seller-invoice-card">
              <Text variant="label" style={styles.sectionTitle}>Satıcı Faturası</Text>
              {sellerInvoice.invoice ? (
                <>
                  <Text variant="caption" style={{ color: colors.text.muted, marginBottom: 8 }}>
                    {sellerInvoice.invoice.fileName}
                  </Text>
                  <Button
                    variant="outline"
                    fullWidth
                    onPress={handleViewSellerInvoice}
                    isLoading={downloadingSellerInvoice}
                    disabled={downloadingSellerInvoice}
                    title="Satıcı Faturasını Görüntüle / İndir"
                  />
                  {sellerInvoice.canUpload && (
                    <Text variant="caption" style={{ color: colors.text.muted, marginTop: 8 }}>
                      Faturayı değiştirmek için tarodan.com sipariş sayfasını kullanın.
                    </Text>
                  )}
                </>
              ) : (
                <Text variant="caption" style={{ color: colors.text.muted }}>
                  Bu sipariş için fatura yüklemek üzere tarodan.com sipariş sayfasını kullanın.
                </Text>
              )}
            </Card>
          )}

        {/* İPTAL (kargo öncesi) — alıcı, sipariş henüz kargoya verilmeden iptal eder.
            Kargo SONRASI iptal yok; o aşamada İade Talep Et akışı kullanılır.
            Ödeme bekleyen (pending) sipariş için ayrı "Ödeme Yap" kartı var; iptal de
            mümkün olduğundan onu da kapsar. */}
        {order.isBuyer &&
          !isMembershipOrder &&
          isPreShipment &&
          !order.activeRefundRequest && (
            <Card variant="elevated" style={styles.card}>
              <Text variant="label" style={styles.sectionTitle}>
                Sipariş İptali
              </Text>
              <Text variant="caption" style={styles.confirmNote}>
                Sipariş henüz kargoya verilmedi. İptal ederseniz ödemeniz iade edilir.
              </Text>
              <Button
                testID="order-cancel-button"
                variant="outline"
                icon="close-circle-outline"
                fullWidth
                title="Siparişi İptal Et"
                onPress={handleCancelOrder}
                isLoading={cancelOrderMutation.isPending}
                disabled={cancelOrderMutation.isPending}
                style={{ marginTop: 12, borderColor: colors.danger[600]! }}
              />
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

        {/* Refund — existing request banner. İptal edilen siparişte gösterilmez
            (yalnız iptal bilgisi kalır). */}
        {order.activeRefundRequest && !isCancelled && (
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

        {/* İADE (kargo sonrası) — buyer, ödeme tamamlanmış, aktif iade yok, kargolanmış.
            14 gün koşulsuz cayma: sebep/foto opsiyonel. Üyelik/dijital siparişler hariç
            (kendi iptal akışı var). Kargo öncesi bu kart yerine "Siparişi İptal Et" çıkar. */}
        {order.isBuyer &&
          !isMembershipOrder &&
          isPostShipment &&
          !order.activeRefundRequest &&
          order.payment?.status === 'completed' &&
          !isCancelled &&
          order.status !== 'refunded' &&
          (isPastRefundWindow ? (
            // 14 günden sonra iade yok
            <Card variant="elevated" style={styles.card}>
              <Text variant="label" style={styles.sectionTitle}>
                İade Süresi Doldu
              </Text>
              <Text variant="caption" style={styles.refundIntro}>
                14 günlük iade süresi doldu; bu sipariş için artık iade talebi
                oluşturulamaz.
              </Text>
            </Card>
          ) : (
            <Card variant="elevated" style={styles.card}>
              <Text variant="label" style={styles.sectionTitle}>
                İade İşlemleri
              </Text>
              <Text variant="caption" style={styles.refundIntro}>
                Teslimattan sonra 14 gün içinde sebep belirtmeden iade talep edebilirsiniz.
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
          ))}

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
          setRefundQuantity(1);
        }}
        title="İade Talebi Oluştur"
      >
        <ScrollView>
          <Text variant="caption" style={styles.refundModalHint}>
            Teslimattan sonra 14 gün içinde sebep belirtmeden iade hakkınız vardır.
            Sebep, açıklama ve fotoğraf isteğe bağlıdır.
          </Text>

          {/* Adet bazlı kısmi iade — yalnız çok adetli siparişte (örn. 3 al, 2 iade et). */}
          {(order.quantity ?? 1) > 1 && (
            <View style={styles.qtySection}>
              <Text variant="caption" style={styles.refundModalLabel}>
                İade Edilecek Adet
              </Text>
              <Text variant="caption" style={styles.evidenceHint}>
                Bu siparişte {order.quantity} adet var. Kaç adet iade edeceğinizi seçin.
              </Text>
              <View style={styles.qtyRow}>
                <Pressable
                  testID="refund-qty-dec"
                  accessibilityRole="button"
                  accessibilityLabel="Adet azalt"
                  onPress={() => setRefundQuantity((q) => Math.max(1, q - 1))}
                  disabled={refundQuantity <= 1}
                  style={[styles.qtyBtn, refundQuantity <= 1 && styles.qtyBtnDisabled]}
                  hitSlop={6}
                >
                  <Ionicons name="remove" size={20} color={colors.text.heading} />
                </Pressable>
                <Text testID="refund-qty-value" variant="h3" style={styles.qtyValue}>
                  {refundQuantity}
                </Text>
                <Pressable
                  testID="refund-qty-inc"
                  accessibilityRole="button"
                  accessibilityLabel="Adet artır"
                  onPress={() =>
                    setRefundQuantity((q) => Math.min(order.quantity ?? 1, q + 1))
                  }
                  disabled={refundQuantity >= (order.quantity ?? 1)}
                  style={[
                    styles.qtyBtn,
                    refundQuantity >= (order.quantity ?? 1) && styles.qtyBtnDisabled,
                  ]}
                  hitSlop={6}
                >
                  <Ionicons name="add" size={20} color={colors.text.heading} />
                </Pressable>
              </View>
            </View>
          )}

          <Text variant="caption" style={styles.refundModalLabel}>
            İade Nedeni (isteğe bağlı)
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

          {/* Kanıt Fotoğrafı — opsiyonel (14 gün koşulsuz iade). İsteyen ekleyebilir. */}
          <View style={styles.evidenceSection}>
              <Text variant="caption" style={styles.refundModalLabel}>
                Kanıt Fotoğrafı (isteğe bağlı)
              </Text>
              <Text variant="caption" style={styles.evidenceHint}>
                Dilerseniz fotoğraf ekleyin (en fazla {MAX_EVIDENCE_PHOTOS}).
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

          <View style={styles.refundModalActions}>
            <Button
              variant="ghost"
              title="Vazgeç"
              onPress={() => {
                setRefundModalVisible(false);
                setEvidenceAssets([]);
                setRefundQuantity(1);
              }}
              disabled={refundMutation.isPending}
            />
            <Button
              variant="primary"
              title="Talebi Gönder"
              onPress={submitRefund}
              isLoading={refundMutation.isPending}
              disabled={refundMutation.isPending}
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
  trackingHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
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
  trackingDeliveredText: {
    color: colors.text.muted,
    marginTop: 4,
  },
  cancelledHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  cancelledHeaderText: {
    flex: 1,
    color: colors.text.heading,
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
  escrowHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  escrowHeaderText: {
    flex: 1,
    color: colors.text.heading,
  },
  escrowText: {
    color: colors.text.muted,
    lineHeight: 18,
  },
  qtySection: {
    marginTop: 4,
    marginBottom: 4,
  },
  qtyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginTop: 8,
  },
  qtyBtn: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border.DEFAULT,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface.alt,
  },
  qtyBtnDisabled: {
    opacity: 0.4,
  },
  qtyValue: {
    minWidth: 32,
    textAlign: 'center',
    color: colors.text.heading,
  },
  evidenceSection: {
    marginTop: 12,
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
