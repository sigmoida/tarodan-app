import { View, ScrollView, StyleSheet, TouchableOpacity, Image, Alert, Linking } from 'react-native';
import {
  Text,
  Button,
  Card,
  Divider,
  ActivityIndicator,
  Snackbar,
  TextInput,
  Modal,
  Portal,
  Checkbox,
  RadioButton,
} from 'react-native-paper';
import { LinearGradient } from 'expo-linear-gradient';
import { useState, useEffect } from 'react';
import { router, useLocalSearchParams, Stack } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { format } from 'date-fns';
import { tr } from 'date-fns/locale';
import { tradesApi, paymentsApi, api } from '../../src/services/api';
import { useAuthStore } from '../../src/stores/authStore';
import { TarodanColors } from '../../src/theme';
import { formatApiErrorMessage } from '../../src/utils/formatApiErrorMessage';
import { transformImageUrl } from '../../src/utils/imageUrl';
import { useTranslation } from '../../src/i18n';

const TRADE_STATUSES = {
  pending: { label: 'Bekliyor', color: TarodanColors.warning, icon: 'time-outline' },
  accepted: { label: 'Kabul Edildi', color: TarodanColors.success, icon: 'checkmark-circle-outline' },
  rejected: { label: 'Reddedildi', color: TarodanColors.error, icon: 'close-circle-outline' },
  countered: { label: 'Karşı Teklif', color: TarodanColors.info, icon: 'swap-horizontal' },
  initiator_shipped: { label: 'Kargo Gönderildi', color: TarodanColors.info, icon: 'cube-outline' },
  receiver_shipped: { label: 'Karşı Taraf Gönderdi', color: TarodanColors.info, icon: 'cube-outline' },
  both_shipped: { label: 'Her İki Kargo Yolda', color: TarodanColors.primary, icon: 'airplane-outline' },
  initiator_received: {
    label: 'Teslim Alındı',
    color: TarodanColors.success,
    icon: 'checkmark-done-circle-outline',
  },
  receiver_received: {
    label: 'Teslim Alındı',
    color: TarodanColors.success,
    icon: 'checkmark-done-circle-outline',
  },
  completed: { label: 'Tamamlandı', color: TarodanColors.success, icon: 'checkmark-done-circle-outline' },
  cancelled: { label: 'İptal Edildi', color: TarodanColors.textSecondary, icon: 'ban-outline' },
  disputed: { label: 'İtiraz Var', color: TarodanColors.error, icon: 'warning-outline' },
};

interface TradeItem {
  id: string;
  productId: string;
  side: 'initiator' | 'receiver';
  quantity: number;
  valueAtTrade: number;
  product: {
    id: string;
    title: string;
    price: number;
    images: { url: string }[];
  };
}

interface TradeShipmentInfo {
  carrier?: string;
  trackingNumber?: string;
  status?: string;
}

interface TradeShipment {
  id: string;
  direction: 'to_warehouse' | 'from_warehouse' | 'return' | string;
  senderUserId?: string | null;
  recipientUserId?: string | null;
  carrier?: string | null;
  trackingNumber?: string | null;
  status?: string | null;
  shippedAt?: string | null;
  deliveredAt?: string | null;
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
  initiatorShipment?: TradeShipmentInfo | null;
  receiverShipment?: TradeShipmentInfo | null;
  shipments?: TradeShipment[];
  cashPayment?: {
    id?: string;
    commission?: number;
    totalAmount?: number;
    status?: string;
  } | null;
  completedAt: string | null;
  createdAt: string;
  initiator: { id: string; displayName: string; avatar?: string };
  receiver: { id: string; displayName: string; avatar?: string };
  items: TradeItem[];
}

/**
 * Web `apps/web/src/app/trades/[id]/page.tsx` SHIPMENT_STATUS_CHIP eşleniği —
 * Sürat Kargo otomatik takip durumlarını rozetle gösterir.
 */
const SHIPMENT_STATUS_CHIP: Record<
  string,
  { label: string; bg: string; fg: string; border: string; icon?: string }
> = {
  label_created: {
    label: 'Etiket Hazır',
    bg: TarodanColors.backgroundTertiary,
    fg: TarodanColors.textSecondary,
    border: TarodanColors.border,
  },
  pending: {
    label: 'Bekleniyor',
    bg: TarodanColors.backgroundTertiary,
    fg: TarodanColors.textSecondary,
    border: TarodanColors.border,
  },
  in_transit: {
    label: 'Yolda',
    bg: TarodanColors.infoLight,
    fg: '#1d4ed8',
    border: '#bfdbfe',
  },
  delivered: {
    label: 'Depoya Ulaştı',
    bg: TarodanColors.successLight,
    fg: '#15803d',
    border: '#bbf7d0',
    icon: '✓',
  },
};

function ShipmentStatusChip({ status }: { status?: string | null }) {
  const meta =
    (status && SHIPMENT_STATUS_CHIP[status]) || {
      label: 'Beklemede',
      bg: TarodanColors.backgroundTertiary,
      fg: TarodanColors.textSecondary,
      border: TarodanColors.border,
    };
  return (
    <View
      style={[
        styles.shipmentChip,
        { backgroundColor: meta.bg, borderColor: meta.border },
      ]}
    >
      {meta.icon ? (
        <Text style={[styles.shipmentChipIcon, { color: meta.fg }]}>
          {meta.icon}
        </Text>
      ) : null}
      <Text style={[styles.shipmentChipLabel, { color: meta.fg }]}>
        {meta.label}
      </Text>
    </View>
  );
}

/**
 * GET /trades/:id gövdesi TradeResponseDto: initiatorItems/receiverItems, initiatorName…
 * Ekran: items[] + initiator/receiver { displayName }
 */
function normalizeTradeFromApi(raw: Record<string, unknown> | Trade | null | undefined): Trade | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, any>;
  if (
    r.initiator &&
    r.receiver &&
    Array.isArray(r.items) &&
    r.items.length > 0 &&
    r.items[0]?.product?.title
  ) {
    return r as Trade;
  }

  const initiatorItems = Array.isArray(r.initiatorItems) ? r.initiatorItems : [];
  const receiverItems = Array.isArray(r.receiverItems) ? r.receiverItems : [];

  const mapItem = (item: any, side: 'initiator' | 'receiver'): TradeItem => {
    const card =
      item?.productImage ||
      item?.productImages?.[0]?.cardUrl ||
      item?.productImages?.[0]?.detailUrl ||
      '';
    const url = card ? transformImageUrl(card) : '';
    return {
      id: String(item.id),
      productId: String(item.productId),
      side,
      quantity: Number(item.quantity ?? 1),
      valueAtTrade: Number(item.valueAtTrade),
      product: {
        id: String(item.productId),
        title: String(item.productTitle ?? 'Ürün'),
        price: Number(item.valueAtTrade),
        images: url ? [{ url }] : [],
      },
    };
  };

  const items: TradeItem[] = [
    ...initiatorItems.map((i: any) => mapItem(i, 'initiator')),
    ...receiverItems.map((i: any) => mapItem(i, 'receiver')),
  ];

  return {
    ...r,
    initiator: {
      id: String(r.initiatorId),
      displayName: String(r.initiatorName ?? 'Kullanıcı'),
    },
    receiver: {
      id: String(r.receiverId),
      displayName: String(r.receiverName ?? 'Kullanıcı'),
    },
    items,
  } as Trade;
}

export default function TradeDetailScreen() {
  const { t } = useTranslation();
  const { id: idParam } = useLocalSearchParams();
  const id = Array.isArray(idParam) ? idParam[0] : idParam;
  const { user } = useAuthStore();
  const queryClient = useQueryClient();

  const [snackbar, setSnackbar] = useState({ visible: false, message: '' });
  const [counterModalVisible, setCounterModalVisible] = useState(false);
  const [counterCashAmount, setCounterCashAmount] = useState('');
  const [counterMessage, setCounterMessage] = useState('');

  const [cashPaymentLoading, setCashPaymentLoading] = useState(false);
  const [cardError, setCardError] = useState<string | null>(null);
  const [savedCards, setSavedCards] = useState<
    Array<{
      id: string;
      cardBrand: string;
      lastFour: string;
      expiryMonth: number;
      expiryYear: number;
      isDefault?: boolean;
    }>
  >([]);
  const [selectedSavedCard, setSelectedSavedCard] = useState<string | null>(null);
  const [useNewCard, setUseNewCard] = useState(false);
  const [cardName, setCardName] = useState('');
  const [cardNumber, setCardNumber] = useState('');
  const [cardExpiry, setCardExpiry] = useState('');
  const [cardCvc, setCardCvc] = useState('');
  const [saveCard, setSaveCard] = useState(false);
  const [cardsFetched, setCardsFetched] = useState(false);

  // Fetch trade details
  const invalidateTradeCaches = () => {
    queryClient.invalidateQueries({ queryKey: ['trade', id] });
    queryClient.invalidateQueries({ queryKey: ['trades'] });
    queryClient.invalidateQueries({ queryKey: ['products'] });
    queryClient.invalidateQueries({
      predicate: (q) => Array.isArray(q.queryKey) && q.queryKey[0] === 'product',
    });
    queryClient.invalidateQueries({ queryKey: ['listings'] });
    queryClient.invalidateQueries({ queryKey: ['my-listings'] });
    queryClient.invalidateQueries({ queryKey: ['my-tradeable-products'] });
  };

  const { data: trade, isLoading } = useQuery<Trade | null>({
    queryKey: ['trade', id],
    queryFn: async () => {
      const response = await tradesApi.getOne(String(id));
      const d = response.data as Record<string, unknown> | undefined;
      const raw = (d?.trade ?? d?.data ?? d) as Record<string, unknown> | undefined;
      return normalizeTradeFromApi(raw);
    },
    enabled: !!id,
  });

  /** Web `trades/[id]/page.tsx` ile aynı: nakit ödeme tamamlanmadan kargo adımı yok */
  const cashPaymentPending = Boolean(
    trade &&
      (Number(trade.cashAmount) || 0) > 0 &&
      trade.cashPayment?.status !== 'completed',
  );
  const isCashPayer = Boolean(trade && user && trade.cashPayerId === user.id);

  useEffect(() => {
    setCardsFetched(false);
    setSavedCards([]);
    setSelectedSavedCard(null);
    setUseNewCard(false);
    setCardError(null);
    setCardNumber('');
    setCardName('');
    setCardExpiry('');
    setCardCvc('');
    setSaveCard(false);
  }, [id]);

  useEffect(() => {
    if (!cashPaymentPending || !isCashPayer || cardsFetched) return;
    api
      .get('/payments/methods')
      .then((res) => {
        const cards = res.data?.methods || res.data || [];
        const list = Array.isArray(cards) ? cards : [];
        setSavedCards(list);
        const defaultCard = list.find((c: { isDefault?: boolean }) => c.isDefault);
        if (defaultCard) setSelectedSavedCard(defaultCard.id);
        else if (list.length > 0) setSelectedSavedCard(list[0].id);
        if (list.length === 0) setUseNewCard(true);
        setCardsFetched(true);
      })
      .catch(() => {
        setUseNewCard(true);
        setCardsFetched(true);
      });
  }, [cashPaymentPending, isCashPayer, cardsFetched]);

  // Accept trade mutation (web ile aynı isteğe bağlı mesaj)
  const acceptMutation = useMutation({
    mutationFn: () =>
      tradesApi.accept(String(id), 'Takas teklifini kabul ediyorum'),
    onSuccess: () => {
      invalidateTradeCaches();
      setSnackbar({ visible: true, message: 'Takas kabul edildi!' });
    },
    onError: (error: unknown) => {
      setSnackbar({ visible: true, message: formatApiErrorMessage(error, 'İşlem başarısız') });
    },
  });

  // Reject trade mutation
  const rejectMutation = useMutation({
    mutationFn: () => tradesApi.reject(String(id)),
    onSuccess: () => {
      invalidateTradeCaches();
      setSnackbar({ visible: true, message: 'Takas reddedildi' });
    },
    onError: (error: unknown) => {
      setSnackbar({ visible: true, message: formatApiErrorMessage(error, 'İşlem başarısız') });
    },
  });

  // Counter offer mutation
  const counterMutation = useMutation({
    mutationFn: () =>
      tradesApi.counter(String(id), {
        initiatorItems: [],
        receiverItems: [],
        cashAmount: parseFloat(counterCashAmount) || 0,
        message: counterMessage,
      }),
    onSuccess: () => {
      invalidateTradeCaches();
      setCounterModalVisible(false);
      setSnackbar({ visible: true, message: 'Karşı teklif gönderildi!' });
    },
    onError: (error: unknown) => {
      setSnackbar({ visible: true, message: formatApiErrorMessage(error, 'İşlem başarısız') });
    },
  });

  // Confirm receipt mutation
  const confirmMutation = useMutation({
    mutationFn: () => tradesApi.confirmReceipt(String(id)),
    onSuccess: () => {
      invalidateTradeCaches();
      setSnackbar({ visible: true, message: 'Takas tamamlandı!' });
    },
    onError: (error: unknown) => {
      setSnackbar({ visible: true, message: formatApiErrorMessage(error, 'İşlem başarısız') });
    },
  });

  // Cancel trade mutation
  const cancelMutation = useMutation({
    mutationFn: () => tradesApi.cancel(String(id)),
    onSuccess: () => {
      invalidateTradeCaches();
      setSnackbar({ visible: true, message: 'Takas iptal edildi' });
    },
    onError: (error: unknown) => {
      setSnackbar({ visible: true, message: formatApiErrorMessage(error, 'İşlem başarısız') });
    },
  });

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={TarodanColors.primary} />
      </View>
    );
  }

  if (!trade) {
    return (
      <View style={styles.errorContainer}>
        <Text>Takas bulunamadı</Text>
        <Button mode="contained" onPress={() => router.back()}>Geri Dön</Button>
      </View>
    );
  }

  const isInitiator = user?.id === trade.initiatorId;
  const isReceiver = user?.id === trade.receiverId;
  const otherParty = isInitiator ? trade.receiver : trade.initiator;
  const statusInfo = TRADE_STATUSES[trade.status as keyof typeof TRADE_STATUSES] || TRADE_STATUSES.pending;

  const initiatorItems = (trade.items || []).filter(item => item.side === 'initiator');
  const receiverItems = (trade.items || []).filter(item => item.side === 'receiver');

  const myItems = isInitiator ? initiatorItems : receiverItems;
  const theirItems = isInitiator ? receiverItems : initiatorItems;

  const initiatorTotal = initiatorItems.reduce((sum, item) => sum + Number(item.valueAtTrade), 0);
  const receiverTotal = receiverItems.reduce((sum, item) => sum + Number(item.valueAtTrade), 0);

  const handleAccept = () => {
    Alert.alert(
      'Takası Kabul Et',
      'Bu takas teklifini kabul etmek istediğinize emin misiniz?',
      [
        { text: 'İptal', style: 'cancel' },
        { text: 'Kabul Et', onPress: () => acceptMutation.mutate() },
      ]
    );
  };

  const handleReject = () => {
    Alert.alert(
      'Takası Reddet',
      'Bu takas teklifini reddetmek istediğinize emin misiniz?',
      [
        { text: 'İptal', style: 'cancel' },
        { text: 'Reddet', style: 'destructive', onPress: () => rejectMutation.mutate() },
      ]
    );
  };

  const handleCancel = () => {
    Alert.alert(
      'Takası İptal Et',
      'Bu takas teklifini iptal etmek istediğinize emin misiniz?',
      [
        { text: 'Vazgeç', style: 'cancel' },
        { text: 'İptal Et', style: 'destructive', onPress: () => cancelMutation.mutate() },
      ]
    );
  };

  /** Web `trades/[id]/page.tsx` handleCashPayment ile aynı akış */
  const handleCashPayment = async () => {
    if (!trade) return;
    setCashPaymentLoading(true);
    setCardError(null);
    try {
      const res = await paymentsApi.initiateTradeCash(trade.id);
      const raw = res.data as Record<string, unknown> | undefined;
      const data = (raw?.data ?? raw) as Record<string, unknown> | undefined;

      if (data?.useBypass && data?.paymentId) {
        try {
          const bypassRes = await paymentsApi.bypassComplete(String(data.paymentId));
          if (bypassRes.data?.success) {
            invalidateTradeCaches();
            setCashPaymentLoading(false);
            router.push(`/payment/success?paymentId=${encodeURIComponent(String(data.paymentId))}`);
            return;
          }
        } catch {
          setSnackbar({ visible: true, message: 'Test ödemesi tamamlanamadı' });
        }
        setCashPaymentLoading(false);
        return;
      }

      if (data?.paymentUrl) {
        if (saveCard && useNewCard && cardNumber && cardExpiry) {
          try {
            const [month, year] = cardExpiry.split('/');
            await api.post('/payments/methods', {
              cardNumber: cardNumber.replace(/\s/g, ''),
              cardHolder: cardName,
              expiryMonth: parseInt(month, 10),
              expiryYear: parseInt(`20${year}`, 10),
              cvv: cardCvc,
            });
          } catch {
            /* ignore */
          }
        }
        const url = String(data.paymentUrl);
        try {
          const canOpen = await Linking.canOpenURL(url);
          if (canOpen) await Linking.openURL(url);
          else
            setSnackbar({ visible: true, message: 'Ödeme bağlantısı açılamadı' });
        } catch {
          setSnackbar({ visible: true, message: 'Ödeme bağlantısı açılamadı' });
        }
        setCashPaymentLoading(false);
        return;
      }

      if (data?.paymentId) {
        setCashPaymentLoading(false);
        router.push(`/payment/${data.paymentId}` as `/payment/${string}`);
        return;
      }

      setSnackbar({ visible: true, message: 'Ödeme başlatılamadı' });
      setCashPaymentLoading(false);
    } catch (err: unknown) {
      setSnackbar({
        visible: true,
        message: formatApiErrorMessage(err, 'Ödeme başlatılamadı'),
      });
      setCashPaymentLoading(false);
    }
  };

  const canConfirm = trade.status === 'both_shipped';

  const myShipment = isInitiator ? trade.initiatorShipment : trade.receiverShipment;
  const theirShipment = isInitiator ? trade.receiverShipment : trade.initiatorShipment;
  const myTrackingNumber =
    myShipment?.trackingNumber ??
    (isInitiator ? trade.initiatorTrackingNumber : trade.receiverTrackingNumber);
  const theirTrackingNumber =
    theirShipment?.trackingNumber ??
    (isInitiator ? trade.receiverTrackingNumber : trade.initiatorTrackingNumber);

  // Web `trades/[id]/page.tsx` ile aynı: Sürat Kargo otomatik takip akışı.
  const shipments: TradeShipment[] = trade.shipments ?? [];
  const myToWarehouseShipment = user
    ? shipments.find(
        (s) => s.direction === 'to_warehouse' && s.senderUserId === user.id,
      )
    : undefined;
  const otherToWarehouseShipment = user
    ? shipments.find(
        (s) =>
          s.direction === 'to_warehouse' &&
          s.senderUserId &&
          s.senderUserId !== user.id,
      )
    : undefined;
  const myFromWarehouseShipment = user
    ? shipments.find(
        (s) =>
          s.direction === 'from_warehouse' && s.recipientUserId === user.id,
      )
    : undefined;

  const showInboundCard =
    trade.status === 'shipping_to_warehouse' ||
    Boolean(myToWarehouseShipment || otherToWarehouseShipment);

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: `${t('mobile.tradeDetailTitle')} #${trade.tradeNumber}` }} />

      <ScrollView style={styles.content}>
        {/* Status Banner */}
        <View style={[styles.statusBanner, { backgroundColor: statusInfo.color + '15' }]}>
          <Ionicons name={statusInfo.icon as any} size={24} color={statusInfo.color} />
          <Text style={[styles.statusText, { color: statusInfo.color }]}>
            {statusInfo.label}
          </Text>
          {trade.status === 'pending' && trade.responseDeadline && (
            <Text style={styles.deadlineText}>
              Son: {format(new Date(trade.responseDeadline), 'dd MMM HH:mm', { locale: tr })}
            </Text>
          )}
        </View>

        {/* Trade Info */}
        <Card style={styles.card}>
          <Card.Content>
            <View style={styles.tradeHeader}>
              <Text variant="titleMedium">Takas #{trade.tradeNumber}</Text>
              <Text variant="bodySmall" style={styles.dateText}>
                {format(new Date(trade.createdAt), 'dd MMMM yyyy HH:mm', { locale: tr })}
              </Text>
            </View>
            
            <TouchableOpacity 
              style={styles.otherParty}
              onPress={() => router.push(`/seller/${otherParty.id}`)}
            >
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>
                  {otherParty.displayName.charAt(0).toUpperCase()}
                </Text>
              </View>
              <View style={styles.otherPartyInfo}>
                <Text variant="bodyMedium">{isInitiator ? 'Alıcı' : 'Teklif Eden'}</Text>
                <Text variant="titleSmall">{otherParty.displayName}</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={TarodanColors.textSecondary} />
            </TouchableOpacity>
          </Card.Content>
        </Card>

        {/* My Items */}
        <Card style={styles.card}>
          <Card.Content>
            <Text variant="titleSmall" style={styles.sectionTitle}>
              {isInitiator ? 'Teklif Ettiğiniz' : 'Alacağınız'} Ürünler
            </Text>
            {myItems.map((item) => (
              <TouchableOpacity
                key={item.id}
                style={styles.itemRow}
                onPress={() => router.push(`/product/${item.product.id}`)}
              >
                <Image
                  source={{ uri: item.product.images?.[0]?.url || 'https://via.placeholder.com/50' }}
                  style={styles.itemImage}
                />
                <View style={styles.itemInfo}>
                  <Text variant="bodyMedium" numberOfLines={1}>{item.product.title}</Text>
                  <Text variant="bodySmall" style={styles.itemPrice}>
                    ₺{Number(item.valueAtTrade).toLocaleString('tr-TR')}
                  </Text>
                </View>
              </TouchableOpacity>
            ))}
            <Divider style={styles.divider} />
            <View style={styles.totalRow}>
              <Text variant="bodyMedium">Toplam:</Text>
              <Text variant="titleSmall" style={styles.totalPrice}>
                ₺{(isInitiator ? initiatorTotal : receiverTotal).toLocaleString('tr-TR')}
              </Text>
            </View>
          </Card.Content>
        </Card>

        {/* Their Items */}
        <Card style={styles.card}>
          <Card.Content>
            <Text variant="titleSmall" style={styles.sectionTitle}>
              {isInitiator ? 'Alacağınız' : 'Vereceğiniz'} Ürünler
            </Text>
            {theirItems.map((item) => (
              <TouchableOpacity
                key={item.id}
                style={styles.itemRow}
                onPress={() => router.push(`/product/${item.product.id}`)}
              >
                <Image
                  source={{ uri: item.product.images?.[0]?.url || 'https://via.placeholder.com/50' }}
                  style={styles.itemImage}
                />
                <View style={styles.itemInfo}>
                  <Text variant="bodyMedium" numberOfLines={1}>{item.product.title}</Text>
                  <Text variant="bodySmall" style={styles.itemPrice}>
                    ₺{Number(item.valueAtTrade).toLocaleString('tr-TR')}
                  </Text>
                </View>
              </TouchableOpacity>
            ))}
            <Divider style={styles.divider} />
            <View style={styles.totalRow}>
              <Text variant="bodyMedium">Toplam:</Text>
              <Text variant="titleSmall" style={styles.totalPrice}>
                ₺{(isInitiator ? receiverTotal : initiatorTotal).toLocaleString('tr-TR')}
              </Text>
            </View>
          </Card.Content>
        </Card>

        {/* Nakit fark & ödeme — web trades/[id] ile aynı yapı */}
        {trade.cashAmount != null && Number(trade.cashAmount) > 0 && (
          <Card style={[styles.card, styles.cashPaymentCard]}>
            <Card.Content>
              <View style={styles.cashPaymentHeaderRow}>
                <View style={styles.cashPaymentHeaderLeft}>
                  <Text variant="bodySmall" style={styles.cashPaymentMuted}>
                    Nakit Fark
                  </Text>
                  <Text variant="headlineSmall" style={styles.cashPaymentBigAmount}>
                    {Math.abs(Number(trade.cashAmount)).toLocaleString('tr-TR', {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}{' '}
                    TL
                  </Text>
                  {trade.cashPayment != null &&
                    Number(trade.cashPayment.commission) > 0 &&
                    trade.cashPayment.totalAmount != null && (
                      <Text variant="bodySmall" style={styles.cashCommissionHint}>
                        Komisyon dahil toplam:{' '}
                        {Number(trade.cashPayment.totalAmount).toLocaleString('tr-TR', {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}{' '}
                        TL
                      </Text>
                    )}
                </View>
                <View style={styles.cashPaymentHeaderRight}>
                  <Text variant="bodySmall" style={styles.cashPaymentMuted} numberOfLines={2}>
                    {trade.cashPayerId === trade.initiatorId
                      ? `${trade.initiator.displayName} ödeyecek`
                      : `${trade.receiver.displayName} ödeyecek`}
                  </Text>
                  {trade.cashPayment?.status === 'completed' && (
                    <View style={styles.cashPaidBadge}>
                      <Ionicons name="checkmark-circle" size={14} color="#15803d" />
                      <Text style={styles.cashPaidBadgeText}>Ödendi</Text>
                    </View>
                  )}
                </View>
              </View>

              {(trade.status === 'accepted' || trade.status === 'awaiting_payment') &&
                user &&
                trade.cashPayerId === user.id &&
                trade.cashPayment?.status !== 'completed' && (
                  <View style={styles.cashCheckoutSection}>
                    <LinearGradient
                      colors={[TarodanColors.primary, '#2563eb']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={styles.cashCheckoutBanner}
                    >
                      <View style={styles.cashCheckoutBannerTitleRow}>
                        <MaterialCommunityIcons name="credit-card-outline" size={20} color="#fff" />
                        <Text style={styles.cashCheckoutBannerTitle}>Ödemenizi Tamamlayın</Text>
                      </View>
                      <Text style={styles.cashCheckoutBannerSub}>
                        Takas kabul edildi. Devam etmek için nakit fark ödemesini tamamlayın.
                      </Text>
                    </LinearGradient>

                    {cardError ? (
                      <View style={styles.cashCardErrorBox}>
                        <Text style={styles.cashCardErrorText}>{cardError}</Text>
                      </View>
                    ) : null}

                    <View style={styles.cashStepRow}>
                      <View style={styles.cashStepNum}>
                        <Text style={styles.cashStepNumText}>1</Text>
                      </View>
                      <MaterialCommunityIcons name="credit-card-outline" size={20} color={TarodanColors.primary} />
                      <Text variant="titleSmall" style={styles.cashStepTitle}>
                        Kart Bilgileri
                      </Text>
                    </View>

                    <View style={styles.cashCardFormWrap}>
                      {savedCards.length > 0 && (
                        <View style={styles.savedCardsBlock}>
                          <Text variant="bodySmall" style={styles.savedCardsLabel}>
                            Kayıtlı Kartlarım
                          </Text>
                          <RadioButton.Group
                            onValueChange={(v) => {
                              if (v === '__new__') {
                                setUseNewCard(true);
                              } else {
                                setSelectedSavedCard(v);
                                setUseNewCard(false);
                              }
                            }}
                            value={useNewCard ? '__new__' : selectedSavedCard ?? '__new__'}
                          >
                            {savedCards.map((c) => (
                              <TouchableOpacity
                                key={c.id}
                                style={[
                                  styles.savedCardOption,
                                  !useNewCard && selectedSavedCard === c.id && styles.savedCardOptionSelected,
                                ]}
                                onPress={() => {
                                  setSelectedSavedCard(c.id);
                                  setUseNewCard(false);
                                }}
                                activeOpacity={0.7}
                              >
                                <RadioButton value={c.id} color={TarodanColors.primary} />
                                <View style={styles.savedCardOptionText}>
                                  <Text variant="bodyMedium">
                                    {c.cardBrand} •••• {c.lastFour}
                                  </Text>
                                  <Text variant="bodySmall" style={styles.cashPaymentMuted}>
                                    {String(c.expiryMonth).padStart(2, '0')}/{c.expiryYear}
                                  </Text>
                                </View>
                                {c.isDefault ? (
                                  <View style={styles.defaultCardTag}>
                                    <Text style={styles.defaultCardTagText}>Varsayılan</Text>
                                  </View>
                                ) : null}
                              </TouchableOpacity>
                            ))}
                            <TouchableOpacity
                              style={[styles.savedCardOption, useNewCard && styles.savedCardOptionSelected]}
                              onPress={() => setUseNewCard(true)}
                              activeOpacity={0.7}
                            >
                              <RadioButton value="__new__" color={TarodanColors.primary} />
                              <MaterialCommunityIcons name="plus" size={20} color={TarodanColors.textSecondary} />
                              <Text variant="bodyMedium" style={styles.newCardRadioLabel}>
                                Yeni Kart ile Öde
                              </Text>
                            </TouchableOpacity>
                          </RadioButton.Group>
                        </View>
                      )}

                      {(savedCards.length === 0 || useNewCard) && (
                        <View style={styles.newCardFields}>
                          <Text variant="bodySmall" style={styles.inputLabel}>
                            Kart Üzerindeki İsim
                          </Text>
                          <TextInput
                            mode="outlined"
                            value={cardName}
                            onChangeText={(t) => setCardName(t.toUpperCase())}
                            placeholder="AD SOYAD"
                            style={styles.cashInput}
                          />
                          <Text variant="bodySmall" style={styles.inputLabel}>
                            Kart Numarası
                          </Text>
                          <TextInput
                            mode="outlined"
                            value={cardNumber}
                            onChangeText={(t) => {
                              setCardError(null);
                              const digits = t.replace(/\D/g, '').slice(0, 16);
                              const formatted = digits.replace(/(\d{4})(?=\d)/g, '$1 ');
                              setCardNumber(formatted);
                            }}
                            placeholder="4508 3456 7890 1234"
                            keyboardType="number-pad"
                            style={styles.cashInput}
                          />
                          <View style={styles.cashExpiryRow}>
                            <View style={styles.cashExpiryCol}>
                              <Text variant="bodySmall" style={styles.inputLabel}>
                                Son Kullanma Tarihi
                              </Text>
                              <TextInput
                                mode="outlined"
                                value={cardExpiry}
                                onChangeText={(t) => {
                                  const v = t.replace(/\D/g, '').slice(0, 4);
                                  if (v.length >= 2) {
                                    setCardExpiry(`${v.slice(0, 2)}/${v.slice(2)}`);
                                  } else {
                                    setCardExpiry(v);
                                  }
                                }}
                                placeholder="AA/YY"
                                maxLength={5}
                                keyboardType="number-pad"
                                style={styles.cashInput}
                              />
                            </View>
                            <View style={styles.cashExpiryCol}>
                              <Text variant="bodySmall" style={styles.inputLabel}>
                                CVV/CVC
                              </Text>
                              <TextInput
                                mode="outlined"
                                value={cardCvc}
                                onChangeText={(t) => setCardCvc(t.replace(/\D/g, '').slice(0, 3))}
                                placeholder="•••"
                                maxLength={3}
                                secureTextEntry
                                keyboardType="number-pad"
                                style={styles.cashInput}
                              />
                            </View>
                          </View>
                          <View style={styles.saveCardRow}>
                            <Checkbox
                              status={saveCard ? 'checked' : 'unchecked'}
                              onPress={() => setSaveCard(!saveCard)}
                              color={TarodanColors.primary}
                            />
                            <Text
                              variant="bodySmall"
                              style={styles.saveCardLabel}
                              onPress={() => setSaveCard(!saveCard)}
                            >
                              Bu kartı gelecekteki alışverişlerim için kaydet
                            </Text>
                          </View>
                        </View>
                      )}

                      {!useNewCard && selectedSavedCard ? (
                        <View style={styles.savedCardCvvBlock}>
                          <Text variant="bodySmall" style={styles.inputLabel}>
                            CVV/CVC (Güvenlik için tekrar girin)
                          </Text>
                          <TextInput
                            mode="outlined"
                            value={cardCvc}
                            onChangeText={(t) => setCardCvc(t.replace(/\D/g, '').slice(0, 3))}
                            placeholder="•••"
                            maxLength={3}
                            secureTextEntry
                            keyboardType="number-pad"
                            style={[styles.cashInput, styles.cashCvvNarrow]}
                          />
                        </View>
                      ) : null}

                      <View style={styles.sslHintRow}>
                        <MaterialCommunityIcons name="shield-check" size={16} color="#22c55e" />
                        <Text variant="bodySmall" style={styles.sslHintText}>
                          256-bit SSL ile şifrelenmiş güvenli ödeme
                        </Text>
                      </View>
                    </View>

                    <Button
                      mode="contained"
                      onPress={handleCashPayment}
                      disabled={cashPaymentLoading}
                      style={styles.cashPayButton}
                      contentStyle={styles.cashPayButtonContent}
                      buttonColor="#16a34a"
                    >
                      <View style={styles.cashPayButtonInner}>
                        {cashPaymentLoading ? (
                          <ActivityIndicator size="small" color="#fff" />
                        ) : (
                          <MaterialCommunityIcons name="shield-check" size={20} color="#fff" />
                        )}
                        <Text style={styles.cashPayButtonLabel}>
                          {cashPaymentLoading
                            ? 'İşleniyor...'
                            : `Ödeme Yap – ${Number(
                                trade.cashPayment?.totalAmount ?? trade.cashAmount,
                              ).toLocaleString('tr-TR', {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              })} TL`}
                        </Text>
                      </View>
                    </Button>
                  </View>
                )}
            </Card.Content>
          </Card>
        )}

        {/* Messages */}
        {(trade.initiatorMessage || trade.receiverMessage) && (
          <Card style={styles.card}>
            <Card.Content>
              <Text variant="titleSmall" style={styles.sectionTitle}>Mesajlar</Text>
              {trade.initiatorMessage && (
                <View style={styles.messageBox}>
                  <Text variant="bodySmall" style={styles.messageSender}>
                    {trade.initiator.displayName}:
                  </Text>
                  <Text variant="bodyMedium">{trade.initiatorMessage}</Text>
                </View>
              )}
              {trade.receiverMessage && (
                <View style={styles.messageBox}>
                  <Text variant="bodySmall" style={styles.messageSender}>
                    {trade.receiver.displayName}:
                  </Text>
                  <Text variant="bodyMedium">{trade.receiverMessage}</Text>
                </View>
              )}
            </Card.Content>
          </Card>
        )}

        {/* Shipping Info */}
        {(trade.status === 'accepted' || trade.status.includes('shipped') || trade.status === 'completed') && (
          <Card style={styles.card}>
            <Card.Content>
              <Text variant="titleSmall" style={styles.sectionTitle}>Kargo Durumu</Text>
              
              <View style={styles.shippingRow}>
                <Ionicons
                  name={myTrackingNumber ? 'checkmark-circle' : 'ellipse-outline'}
                  size={20}
                  color={myTrackingNumber ? TarodanColors.success : TarodanColors.textSecondary}
                />
                <Text variant="bodyMedium" style={styles.shippingText}>
                  Sizin kargonuz:{' '}
                  {myTrackingNumber
                    ? `${myShipment?.carrier ? `${myShipment.carrier} · ` : ''}${myTrackingNumber}`
                    : 'Henüz gönderilmedi'}
                </Text>
              </View>

              <View style={styles.shippingRow}>
                <Ionicons
                  name={theirTrackingNumber ? 'checkmark-circle' : 'ellipse-outline'}
                  size={20}
                  color={theirTrackingNumber ? TarodanColors.success : TarodanColors.textSecondary}
                />
                <Text variant="bodyMedium" style={styles.shippingText}>
                  Karşı taraf:{' '}
                  {theirTrackingNumber
                    ? `${theirShipment?.carrier ? `${theirShipment.carrier} · ` : ''}${theirTrackingNumber}`
                    : 'Henüz gönderilmedi'}
                </Text>
              </View>
            </Card.Content>
          </Card>
        )}

        {/* Inbound shipment info card (auto-tracking, Sürat Kargo) — web trades/[id] mirror */}
        {showInboundCard && (
          <View style={styles.inboundCard}>
            <View style={styles.inboundHeaderRow}>
              <MaterialCommunityIcons
                name="truck-outline"
                size={20}
                color={TarodanColors.primary}
              />
              <Text variant="titleSmall" style={styles.inboundTitle}>
                Tarodan Deposuna Gönderim
              </Text>
            </View>
            <Text variant="bodySmall" style={styles.inboundSubtitle}>
              Sistem her iki tarafa Sürat Kargo takip numarası tahsis etti.
              Aşağıdaki numara ile en yakın Sürat şubesine giderek ürününüzü
              teslim edin.
            </Text>

            {/* Tek kart: yalnız kullanıcının kendi gönderisi */}
            <View style={styles.inboundShipBox}>
              <Text style={styles.inboundShipLabel}>Sizin gönderiniz</Text>
              <Text style={styles.inboundTrackingNumber}>
                {myToWarehouseShipment?.trackingNumber ?? '—'}
              </Text>
              <Text style={styles.inboundShipHint}>
                Bu numarayla Sürat Kargo şubesine gidip ürününüzü teslim edin.
              </Text>
              <View style={styles.inboundChipRow}>
                <ShipmentStatusChip status={myToWarehouseShipment?.status} />
              </View>
            </View>

            {/* Karşı tarafın durumu — numara YOK, tek satır ipucu.
                Tüm reachable ShipmentStatus değerlerini açıkça karşıla. */}
            <Text style={styles.confirmReceiptHint}>
              {(() => {
                const s = otherToWarehouseShipment?.status;
                if (s === 'delivered')
                  return '✓ Karşı tarafın gönderisi de depoya ulaştı.';
                if (
                  s === 'picked_up' ||
                  s === 'in_transit' ||
                  s === 'at_delivery_branch' ||
                  s === 'out_for_delivery'
                )
                  return 'Karşı tarafın gönderisi yolda.';
                if (s === 'cancelled')
                  return 'Karşı tarafın gönderisi iptal edildi; yetkili ekibimiz devreye girecek.';
                if (s === 'failed')
                  return 'Karşı tarafın gönderisinde bir aksaklık oluştu; yetkili ekibimiz inceliyor.';
                if (s === 'returned' || s === 'return_in_progress')
                  return 'Karşı tarafın gönderisi iade edildi.';
                return 'Karşı tarafın kargoya teslim etmesi bekleniyor.';
              })()}
            </Text>
          </View>
        )}

        {/* Trade Protection */}
        <Card style={styles.protectionCard}>
          <Card.Content style={styles.protectionContent}>
            <Ionicons name="shield-checkmark" size={24} color={TarodanColors.success} />
            <View style={styles.protectionTextContainer}>
              <Text variant="titleSmall">Takas Koruma Programı</Text>
              <Text variant="bodySmall" style={styles.protectionDesc}>
                Her iki taraf da ürünü teslim alana kadar işlem güvence altındadır.
              </Text>
            </View>
          </Card.Content>
        </Card>

        {/* Actions */}
        <View style={styles.actions}>
          {/* Pending: Accept/Reject/Counter for receiver */}
          {trade.status === 'pending' && isReceiver && (
            <>
              <Button
                mode="contained"
                onPress={handleAccept}
                loading={acceptMutation.isPending}
                style={[styles.actionButton, { backgroundColor: TarodanColors.success }]}
              >
                Kabul Et
              </Button>
              <Button
                mode="outlined"
                onPress={() => setCounterModalVisible(true)}
                style={styles.actionButton}
              >
                Karşı Teklif
              </Button>
              <Button
                mode="outlined"
                onPress={handleReject}
                loading={rejectMutation.isPending}
                textColor={TarodanColors.error}
                style={[styles.actionButton, { borderColor: TarodanColors.error }]}
              >
                Reddet
              </Button>
            </>
          )}

          {/* Pending: Cancel for initiator */}
          {trade.status === 'pending' && isInitiator && (
            <Button
              mode="outlined"
              onPress={handleCancel}
              loading={cancelMutation.isPending}
              textColor={TarodanColors.error}
              style={[styles.actionButton, { borderColor: TarodanColors.error }]}
            >
              Teklifi İptal Et
            </Button>
          )}

          {/* Both shipped: Confirm receipt */}
          {canConfirm && (
            <>
              <Button
                mode="contained"
                onPress={() => confirmMutation.mutate()}
                loading={confirmMutation.isPending}
                disabled={
                  confirmMutation.isPending ||
                  myFromWarehouseShipment?.status !== 'delivered'
                }
                icon="checkmark-done"
                style={[styles.actionButton, { backgroundColor: TarodanColors.success }]}
              >
                Teslim Aldım
              </Button>
              {myFromWarehouseShipment?.status !== 'delivered' && (
                <Text variant="bodySmall" style={styles.confirmReceiptHint}>
                  Kargonun teslim edildiği bilgisi bekleniyor.
                </Text>
              )}
            </>
          )}

          {/* Message other party */}
          <Button
            mode="text"
            onPress={() => router.push(`/messages/new?sellerId=${otherParty.id}`)}
            icon="chatbubble-outline"
          >
            Mesaj Gönder
          </Button>
        </View>

        <View style={{ height: 50 }} />
      </ScrollView>

      {/* Counter Offer Modal */}
      <Portal>
        <Modal
          visible={counterModalVisible}
          onDismiss={() => setCounterModalVisible(false)}
          contentContainerStyle={styles.modal}
        >
          <Text variant="titleLarge" style={styles.modalTitle}>Karşı Teklif</Text>
          <TextInput
            label="Nakit Fark (₺)"
            value={counterCashAmount}
            onChangeText={setCounterCashAmount}
            keyboardType="numeric"
            mode="outlined"
            style={styles.modalInput}
          />
          <TextInput
            label="Mesajınız"
            value={counterMessage}
            onChangeText={setCounterMessage}
            multiline
            numberOfLines={3}
            mode="outlined"
            style={styles.modalInput}
          />
          <View style={styles.modalActions}>
            <Button mode="outlined" onPress={() => setCounterModalVisible(false)}>
              İptal
            </Button>
            <Button
              mode="contained"
              onPress={() => counterMutation.mutate()}
              loading={counterMutation.isPending}
            >
              Gönder
            </Button>
          </View>
        </Modal>
      </Portal>

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
    backgroundColor: TarodanColors.backgroundSecondary,
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
    color: TarodanColors.textSecondary,
  },
  card: {
    margin: 16,
    marginTop: 0,
    backgroundColor: TarodanColors.background,
  },
  tradeHeader: {
    marginBottom: 16,
  },
  dateText: {
    color: TarodanColors.textSecondary,
    marginTop: 4,
  },
  otherParty: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: TarodanColors.border,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: TarodanColors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
  },
  otherPartyInfo: {
    flex: 1,
    marginLeft: 12,
  },
  sectionTitle: {
    marginBottom: 12,
    color: TarodanColors.textPrimary,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
  },
  itemImage: {
    width: 50,
    height: 50,
    borderRadius: 6,
    backgroundColor: TarodanColors.border,
  },
  itemInfo: {
    flex: 1,
    marginLeft: 12,
  },
  itemPrice: {
    color: TarodanColors.primary,
    fontWeight: '500',
    marginTop: 2,
  },
  divider: {
    marginVertical: 12,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  totalPrice: {
    color: TarodanColors.primary,
    fontWeight: 'bold',
  },
  cashRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  cashText: {
    flex: 1,
  },
  cashAmount: {
    color: TarodanColors.primary,
    fontWeight: 'bold',
  },
  cashPaymentCard: {
    backgroundColor: '#f0fdf4',
    borderWidth: 1,
    borderColor: '#bbf7d0',
  },
  cashPaymentHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 4,
  },
  cashPaymentHeaderLeft: {
    flex: 1,
    minWidth: 0,
  },
  cashPaymentHeaderRight: {
    alignItems: 'flex-end',
    maxWidth: '46%',
  },
  cashPaymentMuted: {
    color: TarodanColors.textSecondary,
  },
  cashPaymentBigAmount: {
    color: '#15803d',
    fontWeight: '700',
    marginTop: 4,
  },
  cashCommissionHint: {
    color: TarodanColors.textSecondary,
    marginTop: 6,
  },
  cashPaidBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 8,
    alignSelf: 'flex-end',
    backgroundColor: '#dcfce7',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
  },
  cashPaidBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#15803d',
  },
  cashCheckoutSection: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#bbf7d0',
    gap: 16,
  },
  cashCheckoutBanner: {
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginHorizontal: -4,
  },
  cashCheckoutBannerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  cashCheckoutBannerTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  cashCheckoutBannerSub: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 13,
    marginTop: 6,
    lineHeight: 18,
  },
  cashCardErrorBox: {
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fecaca',
    borderRadius: 8,
    padding: 12,
  },
  cashCardErrorText: {
    color: '#b91c1c',
    fontSize: 14,
  },
  cashStepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  cashStepNum: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: TarodanColors.primary + '22',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cashStepNumText: {
    fontSize: 12,
    fontWeight: '700',
    color: TarodanColors.primary,
  },
  cashStepTitle: {
    fontWeight: '600',
  },
  cashCardFormWrap: {
    backgroundColor: TarodanColors.backgroundSecondary,
    borderWidth: 1,
    borderColor: TarodanColors.border,
    borderRadius: 10,
    padding: 14,
  },
  savedCardsBlock: {
    marginBottom: 12,
  },
  savedCardsLabel: {
    fontWeight: '600',
    marginBottom: 10,
    color: TarodanColors.textPrimary,
  },
  savedCardOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderWidth: 2,
    borderColor: TarodanColors.border,
    borderRadius: 10,
    marginBottom: 8,
  },
  savedCardOptionSelected: {
    borderColor: TarodanColors.primary,
    backgroundColor: TarodanColors.primary + '12',
  },
  savedCardOptionText: {
    flex: 1,
    marginLeft: 4,
  },
  defaultCardTag: {
    backgroundColor: TarodanColors.primary + '22',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  defaultCardTagText: {
    fontSize: 11,
    fontWeight: '600',
    color: TarodanColors.primary,
  },
  newCardRadioLabel: {
    marginLeft: 4,
    flex: 1,
  },
  newCardFields: {
    gap: 4,
  },
  inputLabel: {
    marginTop: 8,
    marginBottom: 4,
    color: TarodanColors.textSecondary,
    fontWeight: '500',
  },
  cashInput: {
    backgroundColor: '#fff',
  },
  cashExpiryRow: {
    flexDirection: 'row',
    gap: 12,
  },
  cashExpiryCol: {
    flex: 1,
  },
  saveCardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    gap: 4,
  },
  saveCardLabel: {
    flex: 1,
    color: TarodanColors.textSecondary,
  },
  savedCardCvvBlock: {
    marginTop: 12,
  },
  cashCvvNarrow: {
    maxWidth: 140,
  },
  sslHintRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
  },
  sslHintText: {
    flex: 1,
    color: TarodanColors.textSecondary,
    fontSize: 12,
  },
  cashPayButton: {
    borderRadius: 10,
    marginTop: 4,
  },
  cashPayButtonContent: {
    paddingVertical: 6,
  },
  cashPayButtonInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  cashPayButtonLabel: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  messageBox: {
    backgroundColor: TarodanColors.backgroundSecondary,
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
  },
  messageSender: {
    color: TarodanColors.primary,
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
  inboundCard: {
    marginHorizontal: 16,
    marginBottom: 16,
    backgroundColor: TarodanColors.background,
    borderWidth: 1,
    borderColor: TarodanColors.border,
    borderRadius: 12,
    padding: 16,
  },
  inboundHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  inboundTitle: {
    color: TarodanColors.textPrimary,
    fontWeight: '600',
  },
  inboundSubtitle: {
    color: TarodanColors.textSecondary,
    marginBottom: 16,
  },
  inboundShipBox: {
    borderWidth: 1,
    borderColor: TarodanColors.border,
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
    backgroundColor: TarodanColors.backgroundSecondary,
  },
  inboundShipLabel: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    color: TarodanColors.textSecondary,
    marginBottom: 6,
  },
  inboundTrackingNumber: {
    fontFamily: 'Courier',
    fontSize: 17,
    fontWeight: '700',
    color: TarodanColors.textPrimary,
  },
  inboundShipHint: {
    fontSize: 12,
    color: TarodanColors.textSecondary,
    marginTop: 8,
    lineHeight: 16,
  },
  inboundChipRow: {
    flexDirection: 'row',
    marginTop: 10,
  },
  shipmentChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
  shipmentChipIcon: {
    fontSize: 12,
    fontWeight: '700',
  },
  shipmentChipLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  confirmReceiptHint: {
    color: TarodanColors.textSecondary,
    textAlign: 'center',
    marginTop: -4,
  },
  protectionCard: {
    margin: 16,
    marginTop: 0,
    backgroundColor: TarodanColors.success + '10',
    borderWidth: 1,
    borderColor: TarodanColors.success + '40',
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
    color: TarodanColors.textSecondary,
    marginTop: 2,
  },
  actions: {
    padding: 16,
    gap: 12,
  },
  actionButton: {
    borderRadius: 8,
  },
  modal: {
    backgroundColor: TarodanColors.background,
    margin: 20,
    padding: 20,
    borderRadius: 12,
  },
  modalTitle: {
    marginBottom: 16,
    textAlign: 'center',
  },
  modalInput: {
    marginBottom: 12,
    backgroundColor: TarodanColors.background,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    marginTop: 8,
  },
});
