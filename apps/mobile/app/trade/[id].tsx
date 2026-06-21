import { View, ScrollView, StyleSheet, Pressable, Image, Linking, Clipboard } from 'react-native';
import {
  theme,
  Button,
  Card,
  Spinner,
  Snackbar,
  Modal,
  Text,
  Input,
  StatusBadge,
  ScreenHeader,
  tradeStatusConfig,
  appAlert,
} from '@tarodan/ui-native';
import { useState, useEffect } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { format } from 'date-fns';
import { tr } from 'date-fns/locale';
import { tradesApi, paymentsApi } from '../../src/services/api';
import { ThemedRefreshControl, TradeAddressPicker } from '../../src/components/common';
import { useRefresh } from '../../src/hooks/useRefresh';
import { useAuthStore } from '../../src/stores/authStore';
import { useTranslation } from '../../src/i18n';
import { captureException } from '../../src/services/sentry';
import { resolveImageUrl } from '../../src/utils/imageUrl';
import { formatPrice } from '../../src/utils/format';

const { colors } = theme;

type TFn = (key: string, params?: Record<string, string | number>) => string;

// Status meta (icon + color) used for the top status banner. Localized labels
// for the new auto-shipping flow are applied later via NEW_STATUS_KEYS.
const TRADE_STATUSES = {
  pending: { label: 'Bekliyor', color: colors.warning[600]!, icon: 'time-outline' },
  accepted: { label: 'Kabul Edildi', color: colors.success[600]!, icon: 'checkmark-circle-outline' },
  rejected: { label: 'Reddedildi', color: colors.danger[600]!, icon: 'close-circle-outline' },
  countered: { label: 'Karşı Teklif', color: colors.info[600]!, icon: 'swap-horizontal' },
  awaiting_payment: { label: 'Ödeme Bekleniyor', color: colors.warning[600]!, icon: 'card-outline' },
  shipping_to_warehouse: { label: 'Depoya Gönderim', color: colors.info[600]!, icon: 'cube-outline' },
  at_warehouse: { label: 'Depoda', color: colors.info[600]!, icon: 'business-outline' },
  admin_reviewing: { label: 'İnceleniyor', color: colors.info[600]!, icon: 'search-outline' },
  shipping_to_recipients: { label: 'Alıcılara Gönderim', color: colors.primary[600]!, icon: 'airplane-outline' },
  returning: { label: 'İade Sürecinde', color: colors.warning[600]!, icon: 'return-up-back-outline' },
  // Legacy fallbacks
  initiator_shipped: { label: 'Kargo Yolda', color: colors.info[600]!, icon: 'cube-outline' },
  receiver_shipped: { label: 'Kargo Yolda', color: colors.info[600]!, icon: 'cube-outline' },
  both_shipped: { label: 'Kargo Yolda', color: colors.primary[600]!, icon: 'airplane-outline' },
  completed: { label: 'Tamamlandı', color: colors.success[600]!, icon: 'checkmark-done-circle-outline' },
  cancelled: { label: 'İptal Edildi', color: colors.text.muted, icon: 'ban-outline' },
  disputed: { label: 'İtiraz Var', color: colors.danger[600]!, icon: 'warning-outline' },
};

// Statü açıklamaları — banner altındaki bilgilendirme kartı (web parity).
const STATUS_DESCRIPTIONS: Record<string, string> = {
  pending: 'Karşı tarafın teklifi yanıtlaması bekleniyor.',
  accepted: 'Takas kabul edildi. Şimdi ürünler Tarodan deposuna kargolanacak.',
  awaiting_payment: 'Nakit fark ödemesi bekleniyor. Ödeme tamamlanınca kargo süreci başlar.',
  shipping_to_warehouse: 'Her iki taraf da ürününü Tarodan deposuna kargoluyor.',
  at_warehouse: 'Ürünler Tarodan deposuna ulaştı.',
  admin_reviewing: 'Ekibimiz ürünleri inceliyor. Onay sonrası size kargolanacak.',
  shipping_to_recipients: 'Ürünler depodan size doğru kargolanıyor.',
  returning: 'Takas reddedildi. Ürünleriniz size iade ediliyor.',
  completed: 'Takas başarıyla tamamlandı.',
  rejected: 'Bu takas teklifi reddedildi.',
  cancelled: 'Bu takas iptal edildi.',
  disputed: 'Bu takas için bir itiraz açıldı. Ekibimiz inceliyor.',
};

// Statüye göre aktif son tarih alanı.
function deadlineForStatus(trade: Trade): string | null {
  if (trade.status === 'pending') return trade.responseDeadline ?? null;
  if (trade.status === 'awaiting_payment') return trade.paymentDeadline ?? null;
  if (trade.status === 'shipping_to_warehouse') return trade.shippingDeadline ?? null;
  if (trade.status === 'shipping_to_recipients') return trade.confirmationDeadline ?? null;
  return null;
}

// Kalan süreyi "2g 04:15:30" / "04:15:30" biçiminde döndürür; süre dolduysa null.
function formatCountdown(deadlineIso: string | null | undefined, nowMs: number): string | null {
  if (!deadlineIso) return null;
  const end = new Date(deadlineIso).getTime();
  if (isNaN(end)) return null;
  const diff = end - nowMs;
  if (diff <= 0) return null;
  const totalSec = Math.floor(diff / 1000);
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  const hms = `${pad(hours)}:${pad(mins)}:${pad(secs)}`;
  return days > 0 ? `${days}g ${hms}` : hms;
}

const SHIPMENT_STATUS_CHIP: Record<string, { labelKey: string; bg: string; fg: string; icon?: string }> = {
  label_created: { labelKey: 'trade.shipmentStatus.label_created', bg: colors.surface.alt, fg: colors.text.muted },
  pending: { labelKey: 'trade.shipmentStatus.pending', bg: colors.surface.alt, fg: colors.text.muted },
  picked_up: { labelKey: 'trade.shipmentStatus.picked_up', bg: colors.info[50]!, fg: colors.info[600]! },
  in_transit: { labelKey: 'trade.shipmentStatus.in_transit', bg: colors.info[50]!, fg: colors.info[600]! },
  at_delivery_branch: { labelKey: 'trade.shipmentStatus.at_delivery_branch', bg: colors.info[50]!, fg: colors.info[600]! },
  out_for_delivery: { labelKey: 'trade.shipmentStatus.out_for_delivery', bg: colors.info[50]!, fg: colors.info[600]! },
  delivered: { labelKey: 'trade.shipmentStatus.delivered', bg: colors.success[50]!, fg: colors.success[600]!, icon: '✓' },
  failed: { labelKey: 'trade.shipmentStatus.failed', bg: colors.warning[50]!, fg: colors.warning[600]! },
  cancelled: { labelKey: 'trade.shipmentStatus.cancelled', bg: colors.warning[50]!, fg: colors.warning[600]! },
  returned: { labelKey: 'trade.shipmentStatus.returned', bg: colors.warning[50]!, fg: colors.warning[600]! },
  return_in_progress: { labelKey: 'trade.shipmentStatus.return_in_progress', bg: colors.warning[50]!, fg: colors.warning[600]! },
};

function ShipmentStatusChip({ status, t, testID }: { status?: string | null; t: TFn; testID?: string }) {
  const meta = (status && SHIPMENT_STATUS_CHIP[status]) || {
    labelKey: 'trade.shipmentStatus.fallback',
    bg: colors.surface.alt,
    fg: colors.text.muted,
    icon: undefined as string | undefined,
  };
  return (
    <View testID={testID} style={[styles.shipmentChip, { backgroundColor: meta.bg }]}>
      {meta.icon ? <Text style={[styles.shipmentChipText, { color: meta.fg }]}>{meta.icon} </Text> : null}
      <Text style={[styles.shipmentChipText, { color: meta.fg }]}>{t(meta.labelKey)}</Text>
    </View>
  );
}

// Depo-escrow akışı için yatay ilerleme çubuğu (web ile parite).
const STEP_FLOW_STATUSES = new Set([
  'accepted',
  'awaiting_payment',
  'shipping_to_warehouse',
  'at_warehouse',
  'admin_reviewing',
  'shipping_to_recipients',
  'completed',
]);

// Statü → görünür adım. admin_reviewing, "Depoda" adımına denk gelir.
const STATUS_TO_STEP_KEY: Record<string, string> = {
  accepted: 'accepted',
  awaiting_payment: 'awaiting_payment',
  shipping_to_warehouse: 'shipping_to_warehouse',
  at_warehouse: 'at_warehouse',
  admin_reviewing: 'at_warehouse',
  shipping_to_recipients: 'shipping_to_recipients',
  completed: 'completed',
};

function TradeProgressStepper({ status, hasCash }: { status: string; hasCash: boolean }) {
  if (!STEP_FLOW_STATUSES.has(status)) return null;
  const steps = [
    { key: 'accepted', label: 'Kabul Edildi' },
    ...(hasCash ? [{ key: 'awaiting_payment', label: 'Ödeme' }] : []),
    { key: 'shipping_to_warehouse', label: 'Depoya Kargo' },
    { key: 'at_warehouse', label: 'Depoda' },
    { key: 'shipping_to_recipients', label: 'Size Kargo' },
    { key: 'completed', label: 'Tamamlandı' },
  ];
  const currentKey = STATUS_TO_STEP_KEY[status] ?? 'accepted';
  const current = Math.max(
    0,
    steps.findIndex((s) => s.key === currentKey),
  );
  // Tamamlanmış takasta son adım da dahil tüm adımlar "bitti" (tik) gösterilir.
  const isCompleted = status === 'completed';

  return (
    <View style={styles.stepperRow}>
      {steps.map((step, i) => {
        const done = i < current || isCompleted;
        const active = i === current && !isCompleted;
        const reached = i <= current;
        return (
          <View key={step.key} style={styles.stepCol}>
            <View style={styles.stepLineRow}>
              <View
                style={[
                  styles.stepLine,
                  {
                    backgroundColor: reached && i > 0 ? colors.primary[500]! : colors.border.DEFAULT,
                    opacity: i === 0 ? 0 : 1,
                  },
                ]}
              />
              <View
                style={[
                  styles.stepCircle,
                  done ? styles.stepDone : active ? styles.stepActive : styles.stepFuture,
                ]}
              >
                {done ? (
                  <Ionicons name="checkmark" size={14} color={colors.white} />
                ) : (
                  <Text style={[styles.stepNum, { color: active ? colors.white : colors.text.muted }]}>
                    {i + 1}
                  </Text>
                )}
              </View>
              <View
                style={[
                  styles.stepLine,
                  {
                    backgroundColor: done ? colors.primary[500]! : colors.border.DEFAULT,
                    opacity: i === steps.length - 1 ? 0 : 1,
                  },
                ]}
              />
            </View>
            <Text
              style={[
                styles.stepLabel,
                {
                  color: active ? colors.primary[700]! : done ? colors.text.body : colors.text.muted,
                  fontWeight: active ? '700' : '400',
                },
              ]}
              numberOfLines={2}
            >
              {step.label}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

interface TradeShipment {
  id: string;
  direction: 'to_warehouse' | 'from_warehouse' | 'return' | string;
  senderUserId?: string | null;
  recipientUserId?: string | null;
  trackingNumber?: string | null;
  status?: string | null;
  carrier?: string | null;
}

interface TradeCashPayment {
  id?: string;
  amount?: number;
  commission?: number;
  totalAmount?: number;
  status?: string;
  paidAt?: string | null;
}

interface TradeItem {
  id: string;
  productId?: string;
  side?: 'initiator' | 'receiver';
  quantity: number;
  valueAtTrade: number;
  // API'nin döndürdüğü düz alanlar (TradeItemResponseDto):
  productTitle?: string;
  productImage?: string;
  productImages?: Array<{ cardUrl?: string; detailUrl?: string }>;
  // Eski/iç içe şekil — savunmacı fallback.
  product?: {
    id?: string;
    title?: string;
    price?: number;
    images?: Array<{ url?: string; cardUrl?: string }> | string[];
  };
}

interface Trade {
  id: string;
  tradeNumber: string;
  status: string;
  initiatorId: string;
  receiverId: string;
  cashAmount: number | null;
  cashPayerId: string | null;
  initiatorMessage: string | null;
  receiverMessage: string | null;
  responseDeadline: string;
  initiatorShippedAt: string | null;
  receiverShippedAt: string | null;
  initiatorTrackingNumber: string | null;
  receiverTrackingNumber: string | null;
  completedAt: string | null;
  acceptedAt?: string | null;
  cancelledAt?: string | null;
  cancelReason?: string | null;
  createdAt: string;
  initiatorName: string;
  receiverName: string;
  // API ürünleri iki ayrı dizi olarak döndürür; eski `items` (side'lı) fallback.
  initiatorItems?: TradeItem[];
  receiverItems?: TradeItem[];
  items?: TradeItem[];
  shipments?: TradeShipment[];
  cashPayment?: TradeCashPayment | null;
  cashCommission?: number | null;
  paymentDeadline?: string | null;
  shippingDeadline?: string | null;
  confirmationDeadline?: string | null;
  version?: number;
  canCancel?: boolean;
  firstWarehouseArrivalAt?: string | null;
}

function CompareItemRow({ item, onPress }: { item: TradeItem; onPress: () => void }) {
  const qty = Number(item.quantity) || 1;
  return (
    <Pressable
      style={({ pressed }) => [styles.cmpItemRow, pressed && { opacity: 0.85 }]}
      onPress={onPress}
    >
      <Image
        source={{
          uri: resolveImageUrl(
            item.productImages?.[0] ?? item.productImage ?? item.product?.images,
          ),
        }}
        style={styles.cmpThumb}
      />
      <View style={styles.itemInfo}>
        <Text variant="bodySm" weight="medium" numberOfLines={1}>
          {item.productTitle || item.product?.title || 'Ürün'}
        </Text>
        <Text variant="caption" tone="muted">
          {qty}x · {formatPrice(item.valueAtTrade)}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color={colors.text.subtle} />
    </Pressable>
  );
}

export default function TradeDetailScreen() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams();
  const { user } = useAuthStore();
  const queryClient = useQueryClient();

  const [snackbar, setSnackbar] = useState({ visible: false, message: '' });
  const [rejectModalVisible, setRejectModalVisible] = useState(false);
  const [tradeAddressId, setTradeAddressId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [now, setNow] = useState(() => Date.now());
  const [disputeModalVisible, setDisputeModalVisible] = useState(false);
  const [disputeReason, setDisputeReason] = useState<
    'shipment_lost' | 'shipment_damaged' | 'wrong_item' | 'other'
  >('shipment_lost');
  const [disputeDescription, setDisputeDescription] = useState('');

  // Fetch trade details
  const { data: trade, isLoading, refetch } = useQuery<Trade>({
    queryKey: ['trade', id],
    queryFn: async () => {
      const response = await tradesApi.getOne(id as string);
      return response.data?.data ?? response.data;
    },
    enabled: !!id,
  });

  const { refreshing, onRefresh } = useRefresh(refetch);

  // Accept trade mutation
  const acceptMutation = useMutation({
    mutationFn: () => tradesApi.accept(id as string, undefined, tradeAddressId ?? undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trade', id] });
      queryClient.invalidateQueries({ queryKey: ['trades'] });
      setSnackbar({ visible: true, message: 'Takas kabul edildi!' });
    },
    onError: (error: any) => {
      captureException(error, {
        level: 'error',
        tags: { flow: 'trade.accept' },
        extra: { tradeId: String(id ?? '') },
      });
      setSnackbar({ visible: true, message: error.response?.data?.message || 'İşlem başarısız' });
    },
  });

  // Reject trade mutation — opsiyonel sebep ile (web parity)
  const rejectMutation = useMutation({
    mutationFn: () => tradesApi.reject(id as string, rejectReason.trim() || undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trade', id] });
      queryClient.invalidateQueries({ queryKey: ['trades'] });
      setRejectModalVisible(false);
      setRejectReason('');
      setSnackbar({ visible: true, message: 'Takas reddedildi' });
    },
    onError: (error: any) => {
      setSnackbar({ visible: true, message: error.response?.data?.message || 'İşlem başarısız' });
    },
  });

  // Confirm receipt mutation
  const confirmMutation = useMutation({
    mutationFn: () => tradesApi.confirmReceipt(id as string),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trade', id] });
      setSnackbar({ visible: true, message: 'Takas tamamlandı!' });
    },
    onError: (error: any) => {
      setSnackbar({ visible: true, message: error.response?.data?.message || 'İşlem başarısız' });
    },
  });

  // Cash payment mutation: awaiting_payment statüsünde, cashPayer'a "Ödeme Yap"
  // butonu verir. paymentsApi.initiateTradeCash → POST /payments/initiate-trade-cash
  const cashPayMutation = useMutation({
    mutationFn: () => paymentsApi.initiateTradeCash(id as string),
    onSuccess: (response: any) => {
      const data = response?.data?.data ?? response?.data ?? {};
      const paymentId = data.paymentId ?? data.id;
      if (!paymentId) {
        setSnackbar({ visible: true, message: 'Ödeme başlatılamadı (paymentId eksik).' });
        return;
      }
      // Token burada üretildi; URL'i geçerek ekranın tekrar initiate etmesini önle
      // (eski akış paymentId'yi initiateTradeCash'e tradeId sanıp yanlış çağırıyordu).
      const paymentUrl: string | undefined = data.paymentUrl;
      router.push({
        pathname: '/payment/[id]',
        params: {
          id: paymentId,
          provider: 'paytr',
          tradeCash: '1',
          tradeId: String(id),
          ...(paymentUrl ? { paymentUrl } : {}),
        },
      } as any);
    },
    onError: (error: any) => {
      captureException(error, {
        level: 'error',
        tags: { flow: 'trade.cashPay' },
        extra: { tradeId: String(id ?? '') },
      });
      setSnackbar({ visible: true, message: error?.response?.data?.message || 'Ödeme başlatılamadı' });
    },
  });

  // Cancel trade mutation
  const cancelMutation = useMutation({
    mutationFn: () => tradesApi.cancel(id as string),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trade', id] });
      queryClient.invalidateQueries({ queryKey: ['trades'] });
      setSnackbar({ visible: true, message: 'Takas iptal edildi' });
    },
    onError: (error: any) => {
      setSnackbar({ visible: true, message: error.response?.data?.message || 'İşlem başarısız' });
    },
  });

  const disputeMutation = useMutation({
    mutationFn: () =>
      tradesApi.raiseDispute(id as string, {
        reason: disputeReason,
        description: disputeDescription.trim(),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trade', id] });
      queryClient.invalidateQueries({ queryKey: ['trades'] });
      setDisputeModalVisible(false);
      setDisputeDescription('');
      setSnackbar({
        visible: true,
        message: t('trade.dispute.successMessage'),
      });
    },
    onError: (error: any) => {
      setSnackbar({
        visible: true,
        message: error.response?.data?.message || t('trade.dispute.errorMessage'),
      });
    },
  });

  // Geri sayım için saniyede bir tetiklenen tick.
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const handleBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)' as never);
  };

  if (isLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.surface.alt }}>
        <ScreenHeader title="Takas Detayı" onBack={handleBack} />
        <View style={styles.loadingContainer}>
          <Spinner size="lg" />
        </View>
      </View>
    );
  }

  if (!trade) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.surface.alt }}>
        <ScreenHeader title="Takas Detayı" onBack={handleBack} />
        <View style={styles.errorContainer}>
          <Text>Takas bulunamadı</Text>
          <Button variant="primary" title="Geri Dön" onPress={handleBack} />
        </View>
      </View>
    );
  }

  const isInitiator = user?.id === trade.initiatorId;
  const isReceiver = user?.id === trade.receiverId;
  const otherParty = isInitiator
    ? { id: trade.receiverId, displayName: trade.receiverName || 'Kullanıcı' }
    : { id: trade.initiatorId, displayName: trade.initiatorName || 'Kullanıcı' };
  const statusInfoBase = TRADE_STATUSES[trade.status as keyof typeof TRADE_STATUSES] || TRADE_STATUSES.pending;
  // Localize labels for the new auto-shipping flow statuses (i18n.tradeStatus.*)
  const NEW_STATUS_KEYS: Record<string, string> = {
    awaiting_payment: 'trade.tradeStatus.awaiting_payment',
    shipping_to_warehouse: 'trade.tradeStatus.shipping_to_warehouse',
    at_warehouse: 'trade.tradeStatus.at_warehouse',
    admin_reviewing: 'trade.tradeStatus.admin_reviewing',
    shipping_to_recipients: 'trade.tradeStatus.shipping_to_recipients',
  };
  const statusInfo = NEW_STATUS_KEYS[trade.status]
    ? { ...statusInfoBase, label: t(NEW_STATUS_KEYS[trade.status]) }
    : statusInfoBase;

  const tradeItems: TradeItem[] = Array.isArray(trade.items) ? trade.items : [];
  const initiatorItems = Array.isArray(trade.initiatorItems) && trade.initiatorItems.length
    ? trade.initiatorItems
    : tradeItems.filter(item => item.side === 'initiator');
  const receiverItems = Array.isArray(trade.receiverItems) && trade.receiverItems.length
    ? trade.receiverItems
    : tradeItems.filter(item => item.side === 'receiver');

  const myItems = isInitiator ? initiatorItems : receiverItems;
  const theirItems = isInitiator ? receiverItems : initiatorItems;

  const sideTotal = (items: TradeItem[]) =>
    items.reduce((sum, item) => sum + Number(item.valueAtTrade) * (Number(item.quantity) || 1), 0);
  const myTotal = sideTotal(myItems);
  const theirTotal = sideTotal(theirItems);

  const handleAccept = () => {
    if (!tradeAddressId) {
      appAlert('Teslimat Adresi', 'Lütfen bir teslimat adresi seçin veya ekleyin.');
      return;
    }
    appAlert(
      'Takası Kabul Et',
      'Bu takas teklifini kabul etmek istediğinize emin misiniz?',
      [
        { text: 'İptal', style: 'cancel' },
        { text: 'Kabul Et', onPress: () => acceptMutation.mutate() },
      ]
    );
  };

  const handleReject = () => setRejectModalVisible(true);

  const handleCancel = () => {
    appAlert(
      'Takası İptal Et',
      'Bu takas teklifini iptal etmek istediğinize emin misiniz?',
      [
        { text: 'Vazgeç', style: 'cancel' },
        { text: 'İptal Et', style: 'destructive', onPress: () => cancelMutation.mutate() },
      ]
    );
  };

  const shipments: TradeShipment[] = trade.shipments ?? [];
  const myToWarehouseShipment = user
    ? shipments.find((s) => s.direction === 'to_warehouse' && s.senderUserId === user.id)
    : undefined;
  const otherToWarehouseShipment = user
    ? shipments.find((s) => s.direction === 'to_warehouse' && s.senderUserId && s.senderUserId !== user.id)
    : undefined;
  const myFromWarehouseShipment = user
    ? shipments.find((s) => s.direction === 'from_warehouse' && s.recipientUserId === user.id)
    : undefined;
  const otherFromWarehouseShipment = user
    ? shipments.find(
        (s) => s.direction === 'from_warehouse' && s.recipientUserId && s.recipientUserId !== user.id,
      )
    : undefined;
  const myReturnShipment = user
    ? shipments.find(
        (s) => s.direction === 'return' && (s.recipientUserId === user.id || s.senderUserId === user.id),
      )
    : undefined;

  const copyCode = (code?: string | null) => {
    if (!code) return;
    Clipboard.setString(code);
    setSnackbar({ visible: true, message: 'Takip numarası kopyalandı' });
  };

  const countdown = formatCountdown(deadlineForStatus(trade), now);
  const statusDescription = STATUS_DESCRIPTIONS[trade.status];
  const cashPay = trade.cashPayment ?? null;
  const cashPaid = cashPay?.status === 'completed';
  const cashCommission = Number(cashPay?.commission ?? trade.cashCommission ?? 0);
  const cashTotal = Number(cashPay?.totalAmount ?? 0);

  const myTrackingNumber = isInitiator ? trade.initiatorTrackingNumber : trade.receiverTrackingNumber;
  const theirTrackingNumber = isInitiator ? trade.receiverTrackingNumber : trade.initiatorTrackingNumber;

  const renderOtherShipmentHint = (s?: string | null) => {
    if (s === 'delivered') return t('trade.warehouseShipping.counterpartyDelivered');
    if (s === 'picked_up' || s === 'in_transit' || s === 'at_delivery_branch' || s === 'out_for_delivery')
      return t('trade.warehouseShipping.counterpartyInTransit');
    if (s === 'cancelled') return t('trade.warehouseShipping.counterpartyCancelled');
    if (s === 'failed') return t('trade.warehouseShipping.counterpartyFailed');
    if (s === 'returned' || s === 'return_in_progress') return t('trade.warehouseShipping.counterpartyReturned');
    return t('trade.warehouseShipping.counterpartyWaiting');
  };

  // tradeStatusConfig'in kapsadığı statüler için StatusBadge; banner ayrıca
  // icon + tonal background için TRADE_STATUSES'tan beslenir.
  const hasBadge = !!tradeStatusConfig[trade.status];

  return (
    <View style={styles.container}>
      <ScreenHeader
        title={`Takas #${trade.tradeNumber}`}
        onBack={handleBack}
      />

      <ScrollView
        style={styles.content}
        refreshControl={<ThemedRefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* Status Banner */}
        <View style={[styles.statusBanner, { backgroundColor: statusInfo.color + '15' }]}>
          <Ionicons name={statusInfo.icon as any} size={24} color={statusInfo.color} />
          <Text style={[styles.statusText, { color: statusInfo.color }]}>
            {statusInfo.label}
          </Text>
          {hasBadge ? (
            <StatusBadge status={trade.status} config={tradeStatusConfig} size="sm" />
          ) : null}
        </View>

        {/* Status description — özel kartı olan statülerde (tamamlandı/depoda/iade)
            tekrar olmasın diye gizlenir. */}
        {statusDescription &&
          !['completed', 'at_warehouse', 'admin_reviewing', 'returning'].includes(trade.status) && (
            <View style={styles.descCard}>
              <Text variant="bodySm" tone="body">{statusDescription}</Text>
              {trade.cancelReason &&
              (trade.status === 'cancelled' || trade.status === 'rejected') ? (
                <Text variant="caption" tone="muted" style={{ marginTop: 4 }}>
                  Sebep: {trade.cancelReason}
                </Text>
              ) : null}
            </View>
          )}

        {/* Countdown */}
        {countdown && (
          <View style={styles.countdownCard}>
            <Ionicons name="time-outline" size={20} color={colors.primary[600]!} />
            <View style={{ flex: 1 }}>
              <Text style={styles.countdownText}>{countdown}</Text>
              <Text variant="caption" tone="muted">
                Lütfen süre dolmadan işleminizi tamamlayın
              </Text>
            </View>
          </View>
        )}

        {/* Progress Stepper (depo-escrow akışı) */}
        {STEP_FLOW_STATUSES.has(trade.status) && (
          <Card style={styles.card}>
            <TradeProgressStepper
              status={trade.status}
              hasCash={trade.cashAmount != null && Number(trade.cashAmount) > 0}
            />
          </Card>
        )}

        {/* Completed summary */}
        {trade.status === 'completed' && (
          <Card style={{ ...styles.card, ...styles.completedCard }}>
            <View style={styles.completedHeader}>
              <Ionicons name="checkmark-done-circle" size={28} color={colors.success[600]!} />
              <Text variant="h3" style={{ color: colors.success[700]!, flex: 1 }}>
                Takas Tamamlandı
              </Text>
            </View>
            <Text variant="caption" tone="muted" style={{ marginBottom: 12 }}>
              Takas başarıyla tamamlandı. İyi günlerde kullanın!
            </Text>
            <View style={styles.summaryDateRow}>
              <Text variant="caption" tone="muted">Oluşturuldu</Text>
              <Text variant="bodySm">
                {format(new Date(trade.createdAt), 'd MMM yyyy', { locale: tr })}
              </Text>
            </View>
            {trade.acceptedAt ? (
              <View style={styles.summaryDateRow}>
                <Text variant="caption" tone="muted">Kabul Edildi</Text>
                <Text variant="bodySm">
                  {format(new Date(trade.acceptedAt), 'd MMM yyyy', { locale: tr })}
                </Text>
              </View>
            ) : null}
            {trade.completedAt ? (
              <View style={styles.summaryDateRow}>
                <Text variant="caption" tone="muted">Tamamlandı</Text>
                <Text variant="bodySm">
                  {format(new Date(trade.completedAt), 'd MMM yyyy', { locale: tr })}
                </Text>
              </View>
            ) : null}
            <View style={styles.completedActions}>
              <Button
                variant="outline"
                title="Takaslarım"
                onPress={() => router.replace('/trades' as any)}
                style={{ flex: 1 }}
              />
              <Button
                variant="primary"
                title="İlanlara Göz At"
                onPress={() => router.push('/search')}
                style={{ flex: 1 }}
              />
            </View>
          </Card>
        )}

        {/* Warehouse review banner */}
        {(trade.status === 'at_warehouse' || trade.status === 'admin_reviewing') && (
          <Card style={{ ...styles.card, ...styles.infoBanner }}>
            <View style={styles.bannerRow}>
              <View style={styles.bannerIconCircle}>
                <Ionicons name="shield-checkmark" size={22} color={colors.white} />
              </View>
              <View style={{ flex: 1 }}>
                <Text variant="label" style={{ color: colors.info[700]! }}>
                  Ürünleriniz Tarodan Deposunda
                </Text>
                <Text variant="caption" tone="muted" style={{ marginTop: 2 }}>
                  Ekibimiz ürünleri inceliyor. İnceleme tamamlandığında bilgilendirileceksiniz.
                </Text>
              </View>
            </View>
          </Card>
        )}

        {/* Returning banner */}
        {trade.status === 'returning' && (
          <Card style={{ ...styles.card, ...styles.warningBanner }}>
            <View style={styles.bannerRow}>
              <View style={[styles.bannerIconCircle, { backgroundColor: colors.warning[500]! }]}>
                <Ionicons name="return-up-back" size={22} color={colors.white} />
              </View>
              <View style={{ flex: 1 }}>
                <Text variant="label" style={{ color: colors.warning[800]! }}>
                  Takas Reddedildi
                </Text>
                <Text variant="caption" tone="muted" style={{ marginTop: 2 }}>
                  Ürünleriniz size iade ediliyor.
                </Text>
                {trade.cancelReason ? (
                  <Text variant="caption" tone="muted" style={{ marginTop: 4 }}>
                    Sebep: {trade.cancelReason}
                  </Text>
                ) : null}
              </View>
            </View>
          </Card>
        )}

        {/* Trade Info */}
        <Card style={styles.card}>
          <View style={styles.tradeHeader}>
            <View style={styles.tradeHeaderTop}>
              <Text variant="h3">Takas #{trade.tradeNumber}</Text>
              {trade.version && trade.version > 1 ? (
                <View style={styles.versionBadge}>
                  <Text style={styles.versionBadgeText}>Karşı Teklif #{trade.version - 1}</Text>
                </View>
              ) : null}
            </View>
            <Text variant="caption" style={styles.dateText}>
              {format(new Date(trade.createdAt), 'dd MMMM yyyy HH:mm', { locale: tr })}
            </Text>
          </View>

          <Pressable
            style={({ pressed }) => [styles.otherParty, pressed && { opacity: 0.85 }]}
            onPress={() => router.push(`/seller/${otherParty.id}`)}
          >
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>
                {otherParty.displayName.charAt(0).toUpperCase()}
              </Text>
            </View>
            <View style={styles.otherPartyInfo}>
              <Text variant="body">{isInitiator ? 'Alıcı' : 'Teklif Eden'}</Text>
              <Text variant="label">{otherParty.displayName}</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.text.muted} />
          </Pressable>
        </Card>

        {/* Items Comparison */}
        <Card style={styles.card}>
          {/* My side */}
          <Text variant="overline" tone="muted" style={styles.sideLabel}>
            Senin Ürünlerin
          </Text>
          <View style={{ gap: 8 }}>
            {myItems.length > 0 ? (
              myItems.map((item) => (
                <CompareItemRow
                  key={item.id}
                  item={item}
                  onPress={() => {
                    const pid = item.productId ?? item.product?.id;
                    if (pid) router.push(`/product/${pid}`);
                  }}
                />
              ))
            ) : (
              <Text variant="caption" tone="subtle">Ürün yok</Text>
            )}
          </View>
          <View style={styles.cmpTotalRow}>
            <Text variant="caption" tone="muted">Toplam Değer</Text>
            <Text variant="h3" style={styles.cmpTotalValue}>{formatPrice(myTotal)}</Text>
          </View>

          {/* Swap divider */}
          <View style={styles.arrowRow}>
            <View style={styles.arrowLine} />
            <View style={styles.arrowCircle}>
              <Ionicons name="swap-vertical" size={18} color={colors.primary[600]!} />
            </View>
            <View style={styles.arrowLine} />
          </View>

          {/* Their side */}
          <Text variant="overline" tone="muted" style={styles.sideLabel}>
            {otherParty.displayName} Ürünleri
          </Text>
          <View style={{ gap: 8 }}>
            {theirItems.length > 0 ? (
              theirItems.map((item) => (
                <CompareItemRow
                  key={item.id}
                  item={item}
                  onPress={() => {
                    const pid = item.productId ?? item.product?.id;
                    if (pid) router.push(`/product/${pid}`);
                  }}
                />
              ))
            ) : (
              <Text variant="caption" tone="subtle">Ürün yok</Text>
            )}
          </View>
          <View style={styles.cmpTotalRow}>
            <Text variant="caption" tone="muted">Toplam Değer</Text>
            <Text variant="h3" style={styles.cmpTotalValue}>{formatPrice(theirTotal)}</Text>
          </View>
        </Card>

        {/* Cash Adjustment */}
        {trade.cashAmount != null && Number(trade.cashAmount) > 0 && (
          <Card style={{ ...styles.card, ...styles.cashCard }}>
            <View style={styles.cashHeaderRow}>
              <View style={{ flex: 1 }}>
                <Text variant="caption" tone="muted">Nakit Fark</Text>
                <Text variant="h2" style={styles.cashBig}>{formatPrice(Math.abs(Number(trade.cashAmount ?? 0)))}</Text>
                {cashCommission > 0 && cashTotal > 0 ? (
                  <Text variant="caption" tone="muted" style={{ marginTop: 2 }}>
                    Komisyon dahil toplam: {formatPrice(cashTotal)}
                  </Text>
                ) : null}
                <Text variant="caption" tone="muted" style={{ marginTop: 2 }}>
                  {trade.cashPayerId === user?.id
                    ? 'Bu tutarı siz ödeyeceksiniz'
                    : `${otherParty.displayName} ödeyecek`}
                </Text>
              </View>
              <View style={{ alignItems: 'flex-end', gap: 6 }}>
                <MaterialCommunityIcons name="cash-multiple" size={28} color={colors.success[600]!} />
                {cashPaid ? (
                  <View style={styles.paidChip}>
                    <Ionicons name="checkmark-circle" size={14} color={colors.success[700]!} />
                    <Text style={styles.paidChipText}>Ödendi</Text>
                  </View>
                ) : null}
              </View>
            </View>
          </Card>
        )}

        {/* Messages */}
        {(trade.initiatorMessage || trade.receiverMessage) && (
          <Card style={styles.card}>
            <Text variant="label" style={styles.sectionTitle}>Mesajlar</Text>
            {trade.initiatorMessage && (
              <View style={styles.messageBox}>
                <Text variant="caption" style={styles.messageSender}>
                  {trade.initiatorName ?? 'Kullanıcı'}:
                </Text>
                <Text variant="body">{trade.initiatorMessage}</Text>
              </View>
            )}
            {trade.receiverMessage && (
              <View style={styles.messageBox}>
                <Text variant="caption" style={styles.messageSender}>
                  {trade.receiverName ?? 'Kullanıcı'}:
                </Text>
                <Text variant="body">{trade.receiverMessage}</Text>
              </View>
            )}
          </Card>
        )}

        {/* Legacy Kargo Durumu — yalnızca eski (direkt-kargo) takaslarda; depo-escrow
            akışında bu alanlar boş olduğu için kart gösterilmez (kafa karıştırmasın). */}
        {(myTrackingNumber || theirTrackingNumber) && (
          <Card style={styles.card}>
            <Text variant="label" style={styles.sectionTitle}>Kargo Durumu</Text>

            <View style={styles.shippingRow}>
              <Ionicons
                name={myTrackingNumber ? 'checkmark-circle' : 'ellipse-outline'}
                size={20}
                color={myTrackingNumber ? colors.success[600]! : colors.text.muted}
              />
              <Text variant="body" style={styles.shippingText}>
                Sizin kargonuz: {myTrackingNumber || 'Henüz gönderilmedi'}
              </Text>
            </View>

            <View style={styles.shippingRow}>
              <Ionicons
                name={theirTrackingNumber ? 'checkmark-circle' : 'ellipse-outline'}
                size={20}
                color={theirTrackingNumber ? colors.success[600]! : colors.text.muted}
              />
              <Text variant="body" style={styles.shippingText}>
                Karşı taraf: {theirTrackingNumber || 'Henüz gönderilmedi'}
              </Text>
            </View>

            {theirTrackingNumber && (
              <Button
                variant="outline"
                title="Kargoyu Takip Et"
                onPress={() => Linking.openURL(`https://www.suratkargo.com.tr/KargoTakip/?kargotakipno=${encodeURIComponent(theirTrackingNumber)}`)}
                style={styles.trackButton}
              />
            )}
          </Card>
        )}

        {/* Inbound shipment info (Sürat Kargo, auto-issued) — kod oluştuğu an görünür
            (nakitsizde kabulde hemen, nakitlide ödeme sonrası) ve depo inceleme
            aşamaları boyunca kalır. */}
        {['shipping_to_warehouse', 'at_warehouse', 'admin_reviewing'].includes(trade.status) &&
          myToWarehouseShipment?.trackingNumber &&
          (isInitiator || isReceiver) && (
          <Card style={{ ...styles.card, ...styles.inboundCard }} testID="trade-inbound-card">
            <View style={styles.shippingRow}>
              <MaterialCommunityIcons name="truck-fast-outline" size={22} color={colors.primary[600]!} />
              <Text variant="label" style={{ ...styles.sectionTitle, marginBottom: 0, flex: 1 }}>
                {t('trade.warehouseShipping.title')}
              </Text>
            </View>
            <Text variant="caption" style={styles.protectionDesc}>
              {t('trade.warehouseShipping.subtitle')}
            </Text>
            <View style={styles.inboundShipBox}>
              <Text variant="caption" style={styles.messageSender}>{t('trade.warehouseShipping.yourShipment')}</Text>
              <View style={styles.trackingCodeRow}>
                <Text style={[styles.inboundTrackingNumber, { flex: 1 }]} numberOfLines={1}>
                  {myToWarehouseShipment?.trackingNumber ?? '—'}
                </Text>
                {myToWarehouseShipment?.trackingNumber ? (
                  <Pressable
                    onPress={() => copyCode(myToWarehouseShipment?.trackingNumber)}
                    style={styles.copyBtn}
                    hitSlop={8}
                  >
                    <Ionicons name="copy-outline" size={16} color={colors.primary[600]!} />
                    <Text variant="caption" tone="primary" weight="medium">Kopyala</Text>
                  </Pressable>
                ) : null}
              </View>
              {trade.status === 'shipping_to_warehouse' ? (
                <Text variant="caption" style={styles.inboundShipHint}>
                  {t('trade.warehouseShipping.handIn')}
                </Text>
              ) : (
                <Text variant="caption" style={styles.inboundShipHint}>
                  Ürününüz Tarodan deposuna ulaştı.
                </Text>
              )}
              <View style={styles.inboundChipRow}>
                <ShipmentStatusChip testID="trade-status-chip-my-inbound" status={myToWarehouseShipment?.status} t={t} />
              </View>
              {myToWarehouseShipment?.carrier === 'surat' && myToWarehouseShipment?.trackingNumber ? (
                <Button
                  variant="outline"
                  title="Sürat'ta Takip Et"
                  onPress={() =>
                    Linking.openURL(
                      `https://www.suratkargo.com.tr/KargoTakip/?kargotakipno=${encodeURIComponent(myToWarehouseShipment.trackingNumber!)}`,
                    )
                  }
                  style={styles.trackButton}
                />
              ) : null}
            </View>
            <Text variant="caption" style={styles.inboundShipHint}>
              {renderOtherShipmentHint(otherToWarehouseShipment?.status)}
            </Text>
          </Card>
        )}

        {/* Shipping to recipients — outbound from warehouse */}
        {trade.status === 'shipping_to_recipients' && (isInitiator || isReceiver) && (
          <Card style={{ ...styles.card, ...styles.inboundCard }} testID="trade-outbound-card">
            <View style={styles.shippingRow}>
              <MaterialCommunityIcons name="truck-delivery-outline" size={22} color={colors.info[600]!} />
              <Text variant="label" style={{ ...styles.sectionTitle, marginBottom: 0, flex: 1 }}>
                Kargonuz Yolda
              </Text>
            </View>
            {myFromWarehouseShipment ? (
              <View style={styles.inboundShipBox}>
                <Text variant="caption" style={styles.messageSender}>Size gönderilen kargo</Text>
                <View style={styles.trackingCodeRow}>
                  <Text style={[styles.inboundTrackingNumber, { flex: 1 }]} numberOfLines={1}>
                    {(myFromWarehouseShipment.carrier === 'surat' ? 'Sürat Kargo' : myFromWarehouseShipment.carrier || '—')}
                    {myFromWarehouseShipment.trackingNumber ? ` · ${myFromWarehouseShipment.trackingNumber}` : ''}
                  </Text>
                  {myFromWarehouseShipment.trackingNumber ? (
                    <Pressable
                      onPress={() => copyCode(myFromWarehouseShipment.trackingNumber)}
                      style={styles.copyBtn}
                      hitSlop={8}
                    >
                      <Ionicons name="copy-outline" size={16} color={colors.primary[600]!} />
                      <Text variant="caption" tone="primary" weight="medium">Kopyala</Text>
                    </Pressable>
                  ) : null}
                </View>
                <View style={styles.inboundChipRow}>
                  <ShipmentStatusChip testID="trade-status-chip-my-outbound" status={myFromWarehouseShipment.status} t={t} />
                </View>
                {myFromWarehouseShipment.carrier === 'surat' && myFromWarehouseShipment.trackingNumber && (
                  <Button
                    variant="outline"
                    title="Sürat'ta Takip Et"
                    onPress={() => Linking.openURL(`https://www.suratkargo.com.tr/KargoTakip/?kargotakipno=${encodeURIComponent(myFromWarehouseShipment.trackingNumber!)}`)}
                    style={styles.trackButton}
                  />
                )}
              </View>
            ) : (
              <View style={styles.inboundShipBox}>
                <Text variant="caption" style={styles.inboundShipHint}>
                  Takip bilgileri kısa süre içinde görünecek.
                </Text>
              </View>
            )}
            {otherFromWarehouseShipment ? (
              <View style={[styles.inboundShipBox, { marginTop: 8 }]}>
                <Text variant="caption" style={styles.messageSender}>Karşı tarafın kargosu</Text>
                <Text variant="bodySm" numberOfLines={1}>
                  {(otherFromWarehouseShipment.carrier === 'surat' ? 'Sürat Kargo' : otherFromWarehouseShipment.carrier || '—')}
                  {otherFromWarehouseShipment.trackingNumber ? ` · ${otherFromWarehouseShipment.trackingNumber}` : ''}
                </Text>
                <View style={styles.inboundChipRow}>
                  <ShipmentStatusChip status={otherFromWarehouseShipment.status} t={t} />
                </View>
              </View>
            ) : null}
          </Card>
        )}

        {/* Return shipment tracking */}
        {trade.status === 'returning' && myReturnShipment && (
          <Card style={{ ...styles.card, ...styles.inboundCard }} testID="trade-return-card">
            <View style={styles.shippingRow}>
              <MaterialCommunityIcons name="truck-fast-outline" size={22} color={colors.warning[600]!} />
              <Text variant="label" style={{ ...styles.sectionTitle, marginBottom: 0, flex: 1 }}>
                İade Kargosu
              </Text>
            </View>
            <View style={styles.inboundShipBox}>
              <View style={styles.trackingCodeRow}>
                <Text style={[styles.inboundTrackingNumber, { flex: 1 }]} numberOfLines={1}>
                  {myReturnShipment.carrier === 'surat' ? 'Sürat Kargo' : myReturnShipment.carrier || '—'}
                  {myReturnShipment.trackingNumber ? ` · ${myReturnShipment.trackingNumber}` : ''}
                </Text>
                {myReturnShipment.trackingNumber ? (
                  <Pressable
                    onPress={() => copyCode(myReturnShipment.trackingNumber)}
                    style={styles.copyBtn}
                    hitSlop={8}
                  >
                    <Ionicons name="copy-outline" size={16} color={colors.primary[600]!} />
                    <Text variant="caption" tone="primary" weight="medium">Kopyala</Text>
                  </Pressable>
                ) : null}
              </View>
              <View style={styles.inboundChipRow}>
                <ShipmentStatusChip status={myReturnShipment.status} t={t} />
              </View>
              {myReturnShipment.carrier === 'surat' && myReturnShipment.trackingNumber && (
                <Button
                  variant="outline"
                  title="Sürat'ta Takip Et"
                  onPress={() =>
                    Linking.openURL(
                      `https://www.suratkargo.com.tr/KargoTakip/?kargotakipno=${encodeURIComponent(myReturnShipment.trackingNumber!)}`,
                    )
                  }
                  style={styles.trackButton}
                />
              )}
            </View>
          </Card>
        )}

        {/* Trade Protection — yalnızca aktif/erken statülerde */}
        {(trade.status === 'pending' ||
          trade.status === 'accepted' ||
          trade.status === 'awaiting_payment') && (
          <Card style={styles.protectionCard}>
            <View style={styles.protectionContent}>
              <Ionicons name="shield-checkmark" size={24} color={colors.success[600]!} />
              <View style={styles.protectionTextContainer}>
                <Text variant="label">Takas Koruma Programı</Text>
                <Text variant="caption" style={styles.protectionDesc}>
                  Her iki taraf da ürünü teslim alana kadar işlem güvence altındadır.
                </Text>
              </View>
            </View>
          </Card>
        )}

        {/* Actions */}
        <View style={styles.actions}>
          {/* Pending: Accept/Reject/Counter for receiver */}
          {trade.status === 'pending' && isReceiver && (
            <>
              {/* Kabul ederken teslimat adresi (kargo kabulde başlar) */}
              <View style={{ marginBottom: 12 }}>
                <TradeAddressPicker label="Teslimat Adresi" onChange={setTradeAddressId} />
              </View>
              <Button
                variant="primary"
                title="Kabul Et"
                onPress={handleAccept}
                isLoading={acceptMutation.isPending}
                style={styles.actionButton}
              />
              <View style={styles.actionRow}>
                <Button
                  variant="outline"
                  title="Karşı Teklif"
                  onPress={() => router.push(`/trade/counter/${id}` as any)}
                  style={{ ...styles.actionButton, ...styles.actionItem }}
                />
                <Button
                  variant="outline"
                  title="Reddet"
                  onPress={handleReject}
                  isLoading={rejectMutation.isPending}
                  style={{ ...styles.actionButton, ...styles.actionItem, borderColor: colors.danger[600]! }}
                />
              </View>
            </>
          )}

          {/* Cancel — backend-derived: state eligible + not locked by warehouse arrival.
              Pending'de yalnızca teklifi yapan iptal edebilir; alıcı için aksiyon "Reddet". */}
          {trade.canCancel && (trade.status === 'pending' ? isInitiator : isInitiator || isReceiver) && (
            <Button
              variant="outline"
              title={
                trade.status === 'pending'
                  ? t('trade.cancel.offerCta')
                  : t('trade.cancel.tradeCta')
              }
              onPress={handleCancel}
              isLoading={cancelMutation.isPending}
              style={{ ...styles.actionButton, borderColor: colors.danger[600]! }}
            />
          )}

          {/* Cancel locked: surfaced when warehouse arrival removed the cancel option */}
          {!trade.canCancel &&
            trade.status === 'shipping_to_warehouse' &&
            trade.firstWarehouseArrivalAt &&
            (isInitiator || isReceiver) && (
              <Text variant="caption" style={styles.confirmReceiptHint}>
                {t('trade.cancel.lockedHint')}
              </Text>
            )}

          {/* awaiting_payment: cashPayer must initiate the cash payment */}
          {(trade.status === 'accepted' || trade.status === 'awaiting_payment') && trade.cashPayerId === user?.id && !cashPaid && (
            <View style={styles.payCta}>
              <Text variant="label" style={{ color: colors.primary[800]! }}>
                Ödemenizi Tamamlayın
              </Text>
              <Text variant="caption" tone="muted" style={{ marginTop: 2, marginBottom: 10 }}>
                Takas kabul edildi. Devam etmek için nakit fark ödemesini tamamlayın.
              </Text>
              <Button
                testID="cash-pay-button"
                variant="primary"
                title={`Ödeme Yap — ${formatPrice(Math.abs(cashTotal > 0 ? cashTotal : Number(trade.cashAmount ?? 0)))}${cashCommission > 0 ? ' (komisyon dahil)' : ''}`}
                onPress={() => cashPayMutation.mutate()}
                isLoading={cashPayMutation.isPending}
                disabled={cashPayMutation.isPending}
                style={styles.actionButton}
              />
            </View>
          )}
          {(trade.status === 'accepted' || trade.status === 'awaiting_payment') && trade.cashPayerId && trade.cashPayerId !== user?.id && !cashPaid && (
            <Text variant="caption" style={styles.confirmReceiptHint}>
              Karşı tarafın nakit fark ödemesi bekleniyor.
            </Text>
          )}

          {/* shipping_to_recipients: Confirm receipt (gated by delivered status) */}
          {trade.status === 'shipping_to_recipients' && (isInitiator || isReceiver) && (
            <>
              <Button
                testID="trade-confirm-delivery-button"
                variant="primary"
                title="Teslim Aldım"
                onPress={() => confirmMutation.mutate()}
                isLoading={confirmMutation.isPending}
                disabled={myFromWarehouseShipment?.status !== 'delivered'}
                style={styles.actionButton}
              />
              {myFromWarehouseShipment?.status !== 'delivered' && (
                <Text variant="caption" style={styles.confirmReceiptHint}>
                  {t('trade.confirmReceipt.waitingDelivered')}
                </Text>
              )}
              <Button
                testID="trade-raise-dispute-button"
                variant="outline"
                title={t('trade.dispute.openCta')}
                onPress={() => setDisputeModalVisible(true)}
                style={{ ...styles.actionButton, borderColor: colors.danger[600]! }}
              />
              <Text variant="caption" style={styles.confirmReceiptHint}>
                {t('trade.dispute.hint')}
              </Text>
            </>
          )}

          {/* Message other party */}
          <Button
            variant="ghost"
            title="Mesaj Gönder"
            onPress={() => router.push(`/messages/new?receiverId=${otherParty.id}`)}
            style={styles.actionButton}
          />
        </View>

        <View style={{ height: 50 }} />
      </ScrollView>

      {/* Reject Modal — opsiyonel sebep */}
      <Modal
        isOpen={rejectModalVisible}
        onClose={() => !rejectMutation.isPending && setRejectModalVisible(false)}
        title="Takası Reddet"
      >
        <Text variant="caption" tone="muted" style={{ marginBottom: 12 }}>
          Bu takas teklifini reddetmek üzeresiniz. İsterseniz bir sebep ekleyebilirsiniz (opsiyonel).
        </Text>
        <Input
          label="Sebep (opsiyonel)"
          value={rejectReason}
          onChangeText={setRejectReason}
          multiline
          numberOfLines={3}
          placeholder="Örn. Teklif uygun değil"
          containerStyle={{ marginBottom: 12 }}
          inputStyle={{ minHeight: 80 }}
        />
        <View style={styles.modalActions}>
          <Button
            variant="outline"
            title="Vazgeç"
            onPress={() => setRejectModalVisible(false)}
            disabled={rejectMutation.isPending}
          />
          <Button
            variant="primary"
            title="Reddet"
            onPress={() => rejectMutation.mutate()}
            isLoading={rejectMutation.isPending}
            style={{ backgroundColor: colors.danger[600]! }}
          />
        </View>
      </Modal>

      {/* Raise Dispute Modal */}
      <Modal
        isOpen={disputeModalVisible}
        onClose={() => !disputeMutation.isPending && setDisputeModalVisible(false)}
        title={t('trade.dispute.modalTitle')}
      >
        <Text variant="caption" style={{ marginBottom: 12 }}>
          {t('trade.dispute.modalIntro')}
        </Text>
        <View style={{ marginBottom: 12 }}>
          {([
            ['shipment_lost', t('trade.dispute.reasonShipmentLost')],
            ['shipment_damaged', t('trade.dispute.reasonShipmentDamaged')],
            ['wrong_item', t('trade.dispute.reasonWrongItem')],
            ['other', t('trade.dispute.reasonOther')],
          ] as const).map(([value, label]) => (
            <Button
              key={value}
              variant={disputeReason === value ? 'primary' : 'outline'}
              title={label}
              onPress={() => setDisputeReason(value as typeof disputeReason)}
              style={{ marginBottom: 6 }}
            />
          ))}
        </View>
        <Input
          label={t('trade.dispute.descriptionLabel')}
          value={disputeDescription}
          onChangeText={setDisputeDescription}
          multiline
          numberOfLines={4}
          placeholder={t('trade.dispute.descriptionPlaceholder')}
          containerStyle={{ marginBottom: 12 }}
          inputStyle={{ minHeight: 100 }}
        />
        <View style={styles.modalActions}>
          <Button
            variant="outline"
            title={t('trade.dispute.cancelCta')}
            onPress={() => setDisputeModalVisible(false)}
            disabled={disputeMutation.isPending}
          />
          <Button
            variant="primary"
            title={t('trade.dispute.submitCta')}
            onPress={() => {
              if (disputeDescription.trim().length < 10) {
                setSnackbar({
                  visible: true,
                  message: t('trade.dispute.minLengthError'),
                });
                return;
              }
              disputeMutation.mutate();
            }}
            isLoading={disputeMutation.isPending}
          />
        </View>
      </Modal>

      <Snackbar
        visible={snackbar.visible}
        onDismiss={() => setSnackbar({ ...snackbar, visible: false })}
        duration={3000}
      >
        {snackbar.message}
      </Snackbar>
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
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
  },
  content: {
    flex: 1,
  },
  statusBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 12,
    gap: 8,
  },
  statusText: {
    fontSize: 16,
    fontWeight: '600',
    flex: 1,
  },
  deadlineText: {
    fontSize: 12,
    color: colors.text.muted,
  },
  card: {
    margin: 16,
    marginTop: 0,
    backgroundColor: colors.surface.DEFAULT,
  },
  tradeHeader: {
    marginBottom: 16,
  },
  dateText: {
    color: colors.text.muted,
    marginTop: 4,
  },
  otherParty: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border.DEFAULT,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primary[600]!,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    color: colors.white,
    fontWeight: 'bold',
    fontSize: 16,
  },
  otherPartyInfo: {
    flex: 1,
    marginLeft: 12,
  },
  sectionTitle: {
    marginBottom: 12,
    color: colors.text.heading,
  },
  itemInfo: {
    flex: 1,
  },
  messageBox: {
    backgroundColor: colors.surface.alt,
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
  },
  messageSender: {
    color: colors.primary[600]!,
    fontWeight: '500',
    marginBottom: 4,
  },
  shippingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  shippingText: {
    flex: 1,
  },
  trackButton: {
    marginTop: 8,
  },
  protectionCard: {
    margin: 16,
    marginTop: 0,
    backgroundColor: colors.success[50]!,
    borderWidth: 1,
    borderColor: colors.success[200]!,
  },
  protectionContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  protectionTextContainer: {
    flex: 1,
    marginLeft: 12,
  },
  protectionDesc: {
    color: colors.text.muted,
    marginTop: 2,
  },
  actions: {
    padding: 16,
    gap: 12,
  },
  actionButton: {
    borderRadius: 8,
    alignSelf: 'stretch',
  },
  actionRow: {
    flexDirection: 'row',
    gap: 12,
  },
  actionItem: {
    flex: 1,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    marginTop: 8,
  },
  inboundCard: {
    borderWidth: 1,
    borderColor: colors.border.DEFAULT,
  },
  inboundShipBox: {
    marginTop: 12,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border.DEFAULT,
    backgroundColor: colors.surface.alt,
  },
  inboundTrackingNumber: {
    fontFamily: 'Courier',
    fontSize: 16,
    fontWeight: 'bold',
    color: colors.text.heading,
    marginTop: 4,
  },
  inboundChipRow: {
    flexDirection: 'row',
    marginTop: 8,
  },
  trackingCodeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  copyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: colors.primary[50]!,
  },
  inboundShipHint: {
    color: colors.text.muted,
    marginTop: 8,
  },
  confirmReceiptHint: {
    color: colors.text.muted,
    textAlign: 'center',
    marginTop: 4,
  },
  shipmentChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    alignSelf: 'flex-start',
  },
  shipmentChipText: {
    fontSize: 12,
    fontWeight: '600',
  },

  // ===== Progress stepper =====
  stepperRow: {
    flexDirection: 'row',
  },
  stepCol: {
    flex: 1,
    alignItems: 'center',
  },
  stepLineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
  },
  stepLine: {
    flex: 1,
    height: 2,
  },
  stepCircle: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepDone: {
    backgroundColor: colors.primary[500]!,
  },
  stepActive: {
    backgroundColor: colors.primary[600]!,
    borderWidth: 3,
    borderColor: colors.primary[100]!,
  },
  stepFuture: {
    backgroundColor: colors.surface.alt,
    borderWidth: 1,
    borderColor: colors.border.DEFAULT,
  },
  stepNum: {
    fontSize: 12,
    fontWeight: '600',
  },
  stepLabel: {
    fontSize: 10,
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 13,
  },

  // ===== Items comparison =====
  sideLabel: {
    marginBottom: 10,
  },
  cmpItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.surface.alt,
    borderRadius: 8,
    padding: 8,
  },
  cmpThumb: {
    width: 52,
    height: 52,
    borderRadius: 6,
    backgroundColor: colors.border.subtle,
  },
  cmpTotalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border.DEFAULT,
  },
  cmpTotalValue: {
    color: colors.primary[700]!,
    fontWeight: 'bold',
  },
  arrowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginVertical: 16,
  },
  arrowLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border.DEFAULT,
  },
  arrowCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.primary[50]!,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ===== Cash card =====
  cashCard: {
    backgroundColor: colors.success[50]!,
    borderWidth: 1,
    borderColor: colors.success[200]!,
  },
  cashHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  cashBig: {
    color: colors.success[700]!,
    fontWeight: 'bold',
    marginTop: 2,
  },
  paidChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.success[100]!,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  paidChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.success[700]!,
  },

  // ===== Status description + countdown =====
  descCard: {
    marginHorizontal: 16,
    marginTop: 12,
    padding: 12,
    borderRadius: 10,
    backgroundColor: colors.surface.DEFAULT,
    borderWidth: 1,
    borderColor: colors.border.subtle,
  },
  countdownCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: 16,
    marginTop: 12,
    padding: 12,
    borderRadius: 10,
    backgroundColor: colors.primary[50]!,
    borderWidth: 1,
    borderColor: colors.primary[100]!,
  },
  countdownText: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.primary[800]!,
    fontFamily: 'Courier',
  },

  // ===== Completed summary =====
  completedCard: {
    backgroundColor: colors.success[50]!,
    borderWidth: 1,
    borderColor: colors.success[200]!,
  },
  completedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  summaryDateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.success[200]!,
  },
  completedActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 16,
  },

  // ===== Status banners =====
  infoBanner: {
    backgroundColor: colors.info[50]!,
    borderWidth: 1,
    borderColor: colors.info[200]!,
  },
  warningBanner: {
    backgroundColor: colors.warning[50]!,
    borderWidth: 1,
    borderColor: colors.warning[200]!,
  },
  bannerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  bannerIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.info[500]!,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ===== Header version badge =====
  tradeHeaderTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  versionBadge: {
    backgroundColor: colors.primary[100]!,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  versionBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.primary[700]!,
  },

  // ===== Payment CTA =====
  payCta: {
    backgroundColor: colors.primary[50]!,
    borderWidth: 1,
    borderColor: colors.primary[100]!,
    borderRadius: 12,
    padding: 14,
  },
});
