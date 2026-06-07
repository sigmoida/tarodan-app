import { View, ScrollView, StyleSheet, Pressable, Image, Alert, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  theme,
  Button,
  Card,
  Divider,
  Spinner,
  Snackbar,
  Modal,
  Text,
  Input,
  StatusBadge,
  ScreenHeader,
  tradeStatusConfig,
} from '@tarodan/ui-native';
import { useState } from 'react';
import { router, useLocalSearchParams, Stack } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { format } from 'date-fns';
import { tr } from 'date-fns/locale';
import { tradesApi, paymentsApi } from '../../src/services/api';
import { useAuthStore } from '../../src/stores/authStore';
import { useTranslation } from '../../src/i18n';
import { captureException } from '../../src/services/sentry';
import { resolveImageUrl } from '../../src/utils/imageUrl';

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

interface TradeShipment {
  id: string;
  direction: 'to_warehouse' | 'from_warehouse';
  senderUserId?: string | null;
  recipientUserId?: string | null;
  trackingNumber?: string | null;
  status?: string | null;
  carrier?: string | null;
}

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
  createdAt: string;
  initiator: { id: string; displayName: string; avatar?: string };
  receiver: { id: string; displayName: string; avatar?: string };
  items: TradeItem[];
  shipments?: TradeShipment[];
  canCancel?: boolean;
  firstWarehouseArrivalAt?: string | null;
}

export default function TradeDetailScreen() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams();
  const { user } = useAuthStore();
  const queryClient = useQueryClient();

  const [snackbar, setSnackbar] = useState({ visible: false, message: '' });
  const [counterModalVisible, setCounterModalVisible] = useState(false);
  const [counterCashAmount, setCounterCashAmount] = useState('');
  const [counterMessage, setCounterMessage] = useState('');
  const [disputeModalVisible, setDisputeModalVisible] = useState(false);
  const [disputeReason, setDisputeReason] = useState<
    'shipment_lost' | 'shipment_damaged' | 'wrong_item' | 'other'
  >('shipment_lost');
  const [disputeDescription, setDisputeDescription] = useState('');

  // Fetch trade details
  const { data: trade, isLoading } = useQuery<Trade>({
    queryKey: ['trade', id],
    queryFn: async () => {
      const response = await tradesApi.getOne(id as string);
      return response.data?.data ?? response.data;
    },
    enabled: !!id,
  });

  // Accept trade mutation
  const acceptMutation = useMutation({
    mutationFn: () => tradesApi.accept(id as string),
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

  // Reject trade mutation
  const rejectMutation = useMutation({
    mutationFn: () => tradesApi.reject(id as string),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trade', id] });
      queryClient.invalidateQueries({ queryKey: ['trades'] });
      setSnackbar({ visible: true, message: 'Takas reddedildi' });
    },
    onError: (error: any) => {
      setSnackbar({ visible: true, message: error.response?.data?.message || 'İşlem başarısız' });
    },
  });

  // Counter offer mutation
  const counterMutation = useMutation({
    mutationFn: () => tradesApi.counter(id as string, {
      initiatorItems: [],
      receiverItems: [],
      cashAmount: parseFloat(counterCashAmount) || 0,
      message: counterMessage,
    } as any),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trade', id] });
      setCounterModalVisible(false);
      setSnackbar({ visible: true, message: 'Karşı teklif gönderildi!' });
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
      router.push(
        `/payment/${paymentId}?provider=paytr&tradeCash=1` as any,
      );
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

  const handleBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)' as never);
  };

  if (isLoading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.surface.alt }} edges={['top']}>
        <ScreenHeader title="Takas Detayı" variant="light" onBack={handleBack} />
        <View style={styles.loadingContainer}>
          <Spinner size="lg" />
        </View>
      </SafeAreaView>
    );
  }

  if (!trade) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.surface.alt }} edges={['top']}>
        <ScreenHeader title="Takas Detayı" variant="light" onBack={handleBack} />
        <View style={styles.errorContainer}>
          <Text>Takas bulunamadı</Text>
          <Button variant="primary" title="Geri Dön" onPress={handleBack} />
        </View>
      </SafeAreaView>
    );
  }

  const isInitiator = user?.id === trade.initiatorId;
  const isReceiver = user?.id === trade.receiverId;
  const otherPartyRaw = isInitiator ? trade.receiver : trade.initiator;
  const otherParty = otherPartyRaw ?? { id: '', displayName: 'Kullanıcı', avatar: undefined };
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
  const initiatorItems = tradeItems.filter(item => item.side === 'initiator');
  const receiverItems = tradeItems.filter(item => item.side === 'receiver');

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
    <SafeAreaView style={styles.container} edges={['top']}>
      <Stack.Screen options={{ title: `Takas #${trade.tradeNumber}` }} />
      <ScreenHeader
        title={`Takas #${trade.tradeNumber}`}
        variant="light"
        onBack={handleBack}
      />

      <ScrollView style={styles.content}>
        {/* Status Banner */}
        <View style={[styles.statusBanner, { backgroundColor: statusInfo.color + '15' }]}>
          <Ionicons name={statusInfo.icon as any} size={24} color={statusInfo.color} />
          <Text style={[styles.statusText, { color: statusInfo.color }]}>
            {statusInfo.label}
          </Text>
          {hasBadge ? (
            <StatusBadge status={trade.status} config={tradeStatusConfig} size="sm" />
          ) : null}
          {trade.status === 'pending' && trade.responseDeadline && (
            <Text style={styles.deadlineText}>
              Son: {format(new Date(trade.responseDeadline), 'dd MMM HH:mm', { locale: tr })}
            </Text>
          )}
        </View>

        {/* Trade Info */}
        <Card style={styles.card}>
          <View style={styles.tradeHeader}>
            <Text variant="h3">Takas #{trade.tradeNumber}</Text>
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

        {/* My Items */}
        <Card style={styles.card}>
          <Text variant="label" style={styles.sectionTitle}>
            {isInitiator ? 'Teklif Ettiğiniz' : 'Alacağınız'} Ürünler
          </Text>
          {myItems.map((item) => (
            <Pressable
              key={item.id}
              style={({ pressed }) => [styles.itemRow, pressed && { opacity: 0.85 }]}
              onPress={() => router.push(`/product/${item.product.id}`)}
            >
              <Image
                source={{ uri: resolveImageUrl(item.product.images) }}
                style={styles.itemImage}
              />
              <View style={styles.itemInfo}>
                <Text variant="body" numberOfLines={1}>{item.product.title}</Text>
                <Text variant="caption" style={styles.itemPrice}>
                  ₺{Number(item.valueAtTrade).toLocaleString('tr-TR')}
                </Text>
              </View>
            </Pressable>
          ))}
          <Divider style={styles.divider} />
          <View style={styles.totalRow}>
            <Text variant="body">Toplam:</Text>
            <Text variant="label" style={styles.totalPrice}>
              ₺{(isInitiator ? initiatorTotal : receiverTotal).toLocaleString('tr-TR')}
            </Text>
          </View>
        </Card>

        {/* Their Items */}
        <Card style={styles.card}>
          <Text variant="label" style={styles.sectionTitle}>
            {isInitiator ? 'Alacağınız' : 'Vereceğiniz'} Ürünler
          </Text>
          {theirItems.map((item) => (
            <Pressable
              key={item.id}
              style={({ pressed }) => [styles.itemRow, pressed && { opacity: 0.85 }]}
              onPress={() => router.push(`/product/${item.product.id}`)}
            >
              <Image
                source={{ uri: resolveImageUrl(item.product.images) }}
                style={styles.itemImage}
              />
              <View style={styles.itemInfo}>
                <Text variant="body" numberOfLines={1}>{item.product.title}</Text>
                <Text variant="caption" style={styles.itemPrice}>
                  ₺{Number(item.valueAtTrade).toLocaleString('tr-TR')}
                </Text>
              </View>
            </Pressable>
          ))}
          <Divider style={styles.divider} />
          <View style={styles.totalRow}>
            <Text variant="body">Toplam:</Text>
            <Text variant="label" style={styles.totalPrice}>
              ₺{(isInitiator ? receiverTotal : initiatorTotal).toLocaleString('tr-TR')}
            </Text>
          </View>
        </Card>

        {/* Cash Adjustment */}
        {trade.cashAmount && trade.cashAmount > 0 && (
          <Card style={styles.card}>
            <Text variant="label" style={styles.sectionTitle}>Nakit Fark</Text>
            <View style={styles.cashRow}>
              <MaterialCommunityIcons name="cash" size={24} color={colors.primary[600]!} />
              <Text variant="body" style={styles.cashText}>
                {trade.cashPayerId === user?.id ? 'Ödeyeceğiniz' : 'Alacağınız'} tutar:
              </Text>
              <Text variant="h3" style={styles.cashAmount}>
                ₺{Number(trade.cashAmount).toLocaleString('tr-TR')}
              </Text>
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
                  {trade.initiator?.displayName ?? 'Kullanıcı'}:
                </Text>
                <Text variant="body">{trade.initiatorMessage}</Text>
              </View>
            )}
            {trade.receiverMessage && (
              <View style={styles.messageBox}>
                <Text variant="caption" style={styles.messageSender}>
                  {trade.receiver?.displayName ?? 'Kullanıcı'}:
                </Text>
                <Text variant="body">{trade.receiverMessage}</Text>
              </View>
            )}
          </Card>
        )}

        {/* Shipping Info */}
        {(trade.status === 'accepted' || trade.status.includes('shipped') || trade.status === 'completed') && (
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
                onPress={() => Linking.openURL(`https://www.araskargo.com.tr/ttrweb/takip_sonuc.jsp?kession=&siession=&evession=&action=tr&ara=1&soression=${theirTrackingNumber}`)}
                style={styles.trackButton}
              />
            )}
          </Card>
        )}

        {/* Inbound shipment info (Sürat Kargo, auto-issued) */}
        {trade.status === 'shipping_to_warehouse' && (isInitiator || isReceiver) && (
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
              <Text style={styles.inboundTrackingNumber}>
                {myToWarehouseShipment?.trackingNumber ?? '—'}
              </Text>
              <Text variant="caption" style={styles.inboundShipHint}>
                {t('trade.warehouseShipping.handIn')}
              </Text>
              <View style={styles.inboundChipRow}>
                <ShipmentStatusChip testID="trade-status-chip-my-inbound" status={myToWarehouseShipment?.status} t={t} />
              </View>
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
                <Text style={styles.inboundTrackingNumber}>
                  {(myFromWarehouseShipment.carrier === 'surat' ? 'Sürat Kargo' : myFromWarehouseShipment.carrier || '—')}
                  {myFromWarehouseShipment.trackingNumber ? ` · ${myFromWarehouseShipment.trackingNumber}` : ''}
                </Text>
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
          </Card>
        )}

        {/* Trade Protection */}
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

        {/* Actions */}
        <View style={styles.actions}>
          {/* Pending: Accept/Reject/Counter for receiver */}
          {trade.status === 'pending' && isReceiver && (
            <>
              <Button
                variant="primary"
                title="Kabul Et"
                onPress={handleAccept}
                isLoading={acceptMutation.isPending}
                style={styles.actionButton}
              />
              <Button
                variant="outline"
                title="Karşı Teklif"
                onPress={() => router.push(`/trade/counter/${id}` as any)}
                style={styles.actionButton}
              />
              <Button
                variant="outline"
                title="Reddet"
                onPress={handleReject}
                isLoading={rejectMutation.isPending}
                style={{ ...styles.actionButton, borderColor: colors.danger[600]! }}
              />
            </>
          )}

          {/* Cancel — backend-derived: state eligible + not locked by warehouse arrival */}
          {trade.canCancel && (isInitiator || isReceiver) && (
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
          {trade.status === 'awaiting_payment' && trade.cashPayerId === user?.id && (
            <>
              <Button
                testID="cash-pay-button"
                variant="primary"
                title={`Ödeme Yap (₺${Number(trade.cashAmount ?? 0).toLocaleString('tr-TR')})`}
                onPress={() => cashPayMutation.mutate()}
                isLoading={cashPayMutation.isPending}
                disabled={cashPayMutation.isPending}
                style={styles.actionButton}
              />
              <Text variant="caption" style={styles.confirmReceiptHint}>
                Nakit fark ödemesi tamamlanınca takas akışı başlar.
              </Text>
            </>
          )}
          {trade.status === 'awaiting_payment' && trade.cashPayerId && trade.cashPayerId !== user?.id && (
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
          />
        </View>

        <View style={{ height: 50 }} />
      </ScrollView>

      {/* Counter Offer Modal */}
      <Modal
        isOpen={counterModalVisible}
        onClose={() => setCounterModalVisible(false)}
        title="Karşı Teklif"
      >
        <Input
          label="Nakit Fark (₺)"
          value={counterCashAmount}
          onChangeText={setCounterCashAmount}
          keyboardType="numeric"
          containerStyle={{ marginBottom: 12 }}
        />
        <Input
          label="Mesajınız"
          value={counterMessage}
          onChangeText={setCounterMessage}
          multiline
          numberOfLines={3}
          containerStyle={{ marginBottom: 12 }}
          inputStyle={{ minHeight: 80 }}
        />
        <View style={styles.modalActions}>
          <Button variant="outline" title="İptal" onPress={() => setCounterModalVisible(false)} />
          <Button
            variant="primary"
            title="Gönder"
            onPress={() => counterMutation.mutate()}
            isLoading={counterMutation.isPending}
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
    </SafeAreaView>
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
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
  },
  itemImage: {
    width: 50,
    height: 50,
    borderRadius: 6,
    backgroundColor: colors.border.DEFAULT,
  },
  itemInfo: {
    flex: 1,
    marginLeft: 12,
  },
  itemPrice: {
    color: colors.primary[600]!,
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
    color: colors.primary[600]!,
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
    color: colors.primary[600]!,
    fontWeight: 'bold',
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
});
