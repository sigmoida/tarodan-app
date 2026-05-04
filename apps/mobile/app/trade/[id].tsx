import { View, ScrollView, StyleSheet, TouchableOpacity, Image, Alert, Linking } from 'react-native';
import { Button, Card, Chip, Divider, ActivityIndicator, Snackbar, Modal, Portal } from 'react-native-paper';
import { Text, TextInput } from '../../src/components/common';
import { useState } from 'react';
import { router, useLocalSearchParams, Stack } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { format } from 'date-fns';
import { tr } from 'date-fns/locale';
import { tradesApi, addressesApi, paymentsApi } from '../../src/services/api';
import { useAuthStore } from '../../src/stores/authStore';
import { TarodanColors } from '../../src/theme';
import { useTranslation } from '../../src/i18n/LanguageContext';
import { captureException } from '../../src/services/sentry';

type TFn = (key: string, params?: Record<string, string | number>) => string;

const TRADE_STATUSES = {
  pending: { label: 'Bekliyor', color: TarodanColors.warning, icon: 'time-outline' },
  accepted: { label: 'Kabul Edildi', color: TarodanColors.success, icon: 'checkmark-circle-outline' },
  rejected: { label: 'Reddedildi', color: TarodanColors.error, icon: 'close-circle-outline' },
  countered: { label: 'Karşı Teklif', color: TarodanColors.info, icon: 'swap-horizontal' },
  awaiting_payment: { label: 'Ödeme Bekleniyor', color: TarodanColors.warning, icon: 'card-outline' },
  shipping_to_warehouse: { label: 'Depoya Gönderim', color: TarodanColors.info, icon: 'cube-outline' },
  at_warehouse: { label: 'Depoda', color: TarodanColors.info, icon: 'business-outline' },
  admin_reviewing: { label: 'İnceleniyor', color: TarodanColors.info, icon: 'search-outline' },
  shipping_to_recipients: { label: 'Alıcılara Gönderim', color: TarodanColors.primary, icon: 'airplane-outline' },
  returning: { label: 'İade Sürecinde', color: TarodanColors.warning, icon: 'return-up-back-outline' },
  // Legacy fallbacks
  initiator_shipped: { label: 'Kargo Yolda', color: TarodanColors.info, icon: 'cube-outline' },
  receiver_shipped: { label: 'Kargo Yolda', color: TarodanColors.info, icon: 'cube-outline' },
  both_shipped: { label: 'Kargo Yolda', color: TarodanColors.primary, icon: 'airplane-outline' },
  completed: { label: 'Tamamlandı', color: TarodanColors.success, icon: 'checkmark-done-circle-outline' },
  cancelled: { label: 'İptal Edildi', color: TarodanColors.textSecondary, icon: 'ban-outline' },
  disputed: { label: 'İtiraz Var', color: TarodanColors.error, icon: 'warning-outline' },
};

const SHIPMENT_STATUS_CHIP: Record<string, { labelKey: string; bg: string; fg: string; icon?: string }> = {
  label_created: { labelKey: 'trade.shipmentStatus.label_created', bg: TarodanColors.backgroundSecondary, fg: TarodanColors.textSecondary },
  pending: { labelKey: 'trade.shipmentStatus.pending', bg: TarodanColors.backgroundSecondary, fg: TarodanColors.textSecondary },
  picked_up: { labelKey: 'trade.shipmentStatus.picked_up', bg: TarodanColors.info + '20', fg: TarodanColors.info },
  in_transit: { labelKey: 'trade.shipmentStatus.in_transit', bg: TarodanColors.info + '20', fg: TarodanColors.info },
  at_delivery_branch: { labelKey: 'trade.shipmentStatus.at_delivery_branch', bg: TarodanColors.info + '20', fg: TarodanColors.info },
  out_for_delivery: { labelKey: 'trade.shipmentStatus.out_for_delivery', bg: TarodanColors.info + '20', fg: TarodanColors.info },
  delivered: { labelKey: 'trade.shipmentStatus.delivered', bg: TarodanColors.success + '20', fg: TarodanColors.success, icon: '✓' },
  failed: { labelKey: 'trade.shipmentStatus.failed', bg: TarodanColors.warning + '20', fg: TarodanColors.warning },
  cancelled: { labelKey: 'trade.shipmentStatus.cancelled', bg: TarodanColors.warning + '20', fg: TarodanColors.warning },
  returned: { labelKey: 'trade.shipmentStatus.returned', bg: TarodanColors.warning + '20', fg: TarodanColors.warning },
  return_in_progress: { labelKey: 'trade.shipmentStatus.return_in_progress', bg: TarodanColors.warning + '20', fg: TarodanColors.warning },
};

function ShipmentStatusChip({ status, t }: { status?: string | null; t: TFn }) {
  const meta = (status && SHIPMENT_STATUS_CHIP[status]) || {
    labelKey: 'trade.shipmentStatus.fallback',
    bg: TarodanColors.backgroundSecondary,
    fg: TarodanColors.textSecondary,
    icon: undefined as string | undefined,
  };
  return (
    <View style={[styles.shipmentChip, { backgroundColor: meta.bg }]}>
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

  // Fetch trade details
  const { data: trade, isLoading, refetch } = useQuery<Trade>({
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

  const initiatorItems = trade.items.filter(item => item.side === 'initiator');
  const receiverItems = trade.items.filter(item => item.side === 'receiver');

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

  const canConfirm =
    trade.status === 'shipping_to_recipients' && myFromWarehouseShipment?.status === 'delivered';

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

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: `Takas #${trade.tradeNumber}` }} />

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

        {/* Cash Adjustment */}
        {trade.cashAmount && trade.cashAmount > 0 && (
          <Card style={styles.card}>
            <Card.Content>
              <Text variant="titleSmall" style={styles.sectionTitle}>Nakit Fark</Text>
              <View style={styles.cashRow}>
                <MaterialCommunityIcons name="cash" size={24} color={TarodanColors.primary} />
                <Text variant="bodyMedium" style={styles.cashText}>
                  {trade.cashPayerId === user?.id ? 'Ödeyeceğiniz' : 'Alacağınız'} tutar:
                </Text>
                <Text variant="titleMedium" style={styles.cashAmount}>
                  ₺{Number(trade.cashAmount).toLocaleString('tr-TR')}
                </Text>
              </View>
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
                  Sizin kargonuz: {myTrackingNumber || 'Henüz gönderilmedi'}
                </Text>
              </View>
              
              <View style={styles.shippingRow}>
                <Ionicons 
                  name={theirTrackingNumber ? 'checkmark-circle' : 'ellipse-outline'} 
                  size={20} 
                  color={theirTrackingNumber ? TarodanColors.success : TarodanColors.textSecondary} 
                />
                <Text variant="bodyMedium" style={styles.shippingText}>
                  Karşı taraf: {theirTrackingNumber || 'Henüz gönderilmedi'}
                </Text>
              </View>

              {theirTrackingNumber && (
                <Button
                  mode="outlined"
                  onPress={() => Linking.openURL(`https://www.araskargo.com.tr/ttrweb/takip_sonuc.jsp?kession=&siession=&evession=&action=tr&ara=1&soression=${theirTrackingNumber}`)}
                  style={styles.trackButton}
                >
                  Kargoyu Takip Et
                </Button>
              )}
            </Card.Content>
          </Card>
        )}

        {/* Inbound shipment info (Sürat Kargo, auto-issued) */}
        {trade.status === 'shipping_to_warehouse' && (isInitiator || isReceiver) && (
          <Card style={[styles.card, styles.inboundCard]}>
            <Card.Content>
              <View style={styles.shippingRow}>
                <MaterialCommunityIcons name="truck-fast-outline" size={22} color={TarodanColors.primary} />
                <Text variant="titleSmall" style={[styles.sectionTitle, { marginBottom: 0, flex: 1 }]}>
                  {t('trade.warehouseShipping.title')}
                </Text>
              </View>
              <Text variant="bodySmall" style={styles.protectionDesc}>
                {t('trade.warehouseShipping.subtitle')}
              </Text>
              <View style={styles.inboundShipBox}>
                <Text variant="bodySmall" style={styles.messageSender}>{t('trade.warehouseShipping.yourShipment')}</Text>
                <Text style={styles.inboundTrackingNumber}>
                  {myToWarehouseShipment?.trackingNumber ?? '—'}
                </Text>
                <Text variant="bodySmall" style={styles.inboundShipHint}>
                  {t('trade.warehouseShipping.handIn')}
                </Text>
                <View style={styles.inboundChipRow}>
                  <ShipmentStatusChip status={myToWarehouseShipment?.status} t={t} />
                </View>
              </View>
              <Text variant="bodySmall" style={styles.inboundShipHint}>
                {renderOtherShipmentHint(otherToWarehouseShipment?.status)}
              </Text>
            </Card.Content>
          </Card>
        )}

        {/* Shipping to recipients — outbound from warehouse */}
        {trade.status === 'shipping_to_recipients' && (isInitiator || isReceiver) && (
          <Card style={[styles.card, styles.inboundCard]}>
            <Card.Content>
              <View style={styles.shippingRow}>
                <MaterialCommunityIcons name="truck-delivery-outline" size={22} color={TarodanColors.info} />
                <Text variant="titleSmall" style={[styles.sectionTitle, { marginBottom: 0, flex: 1 }]}>
                  Kargonuz Yolda
                </Text>
              </View>
              {myFromWarehouseShipment ? (
                <View style={styles.inboundShipBox}>
                  <Text variant="bodySmall" style={styles.messageSender}>Size gönderilen kargo</Text>
                  <Text style={styles.inboundTrackingNumber}>
                    {(myFromWarehouseShipment.carrier === 'surat' ? 'Sürat Kargo' : myFromWarehouseShipment.carrier || '—')}
                    {myFromWarehouseShipment.trackingNumber ? ` · ${myFromWarehouseShipment.trackingNumber}` : ''}
                  </Text>
                  <View style={styles.inboundChipRow}>
                    <ShipmentStatusChip status={myFromWarehouseShipment.status} t={t} />
                  </View>
                  {myFromWarehouseShipment.carrier === 'surat' && myFromWarehouseShipment.trackingNumber && (
                    <Button
                      mode="outlined"
                      onPress={() => Linking.openURL(`https://www.suratkargo.com.tr/KargoTakip/?kargotakipno=${encodeURIComponent(myFromWarehouseShipment.trackingNumber!)}`)}
                      style={styles.trackButton}
                      icon="truck"
                    >
                      Sürat'ta Takip Et
                    </Button>
                  )}
                </View>
              ) : (
                <View style={styles.inboundShipBox}>
                  <Text variant="bodySmall" style={styles.inboundShipHint}>
                    Takip bilgileri kısa süre içinde görünecek.
                  </Text>
                </View>
              )}
            </Card.Content>
          </Card>
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
                onPress={() => router.push(`/trade/counter/${id}` as any)}
                style={styles.actionButton}
                icon="swap-horizontal"
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

          {/* awaiting_payment: cashPayer must initiate the cash payment */}
          {trade.status === 'awaiting_payment' && trade.cashPayerId === user?.id && (
            <>
              <Button
                mode="contained"
                onPress={() => cashPayMutation.mutate()}
                loading={cashPayMutation.isPending}
                disabled={cashPayMutation.isPending}
                icon="credit-card-outline"
                buttonColor={TarodanColors.primary}
                style={styles.actionButton}
              >
                Ödeme Yap (₺{Number(trade.cashAmount ?? 0).toLocaleString('tr-TR')})
              </Button>
              <Text variant="bodySmall" style={styles.confirmReceiptHint}>
                Nakit fark ödemesi tamamlanınca takas akışı başlar.
              </Text>
            </>
          )}
          {trade.status === 'awaiting_payment' && trade.cashPayerId && trade.cashPayerId !== user?.id && (
            <Text variant="bodySmall" style={styles.confirmReceiptHint}>
              Karşı tarafın nakit fark ödemesi bekleniyor.
            </Text>
          )}

          {/* shipping_to_recipients: Confirm receipt (gated by delivered status) */}
          {trade.status === 'shipping_to_recipients' && (isInitiator || isReceiver) && (
            <>
              <Button
                mode="contained"
                onPress={() => confirmMutation.mutate()}
                loading={confirmMutation.isPending}
                disabled={myFromWarehouseShipment?.status !== 'delivered'}
                icon="checkmark-done"
                style={[styles.actionButton, { backgroundColor: TarodanColors.success }]}
              >
                Teslim Aldım
              </Button>
              {myFromWarehouseShipment?.status !== 'delivered' && (
                <Text variant="bodySmall" style={styles.confirmReceiptHint}>
                  {t('trade.confirmReceipt.waitingDelivered')}
                </Text>
              )}
            </>
          )}

          {/* Message other party */}
          <Button
            mode="text"
            onPress={() => router.push(`/messages/new?receiverId=${otherParty.id}`)}
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
  trackButton: {
    marginTop: 8,
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
  modalNote: {
    color: TarodanColors.textSecondary,
    marginBottom: 16,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    marginTop: 8,
  },
  inboundCard: {
    borderWidth: 1,
    borderColor: TarodanColors.border,
  },
  inboundShipBox: {
    marginTop: 12,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: TarodanColors.border,
    backgroundColor: TarodanColors.backgroundSecondary,
  },
  inboundTrackingNumber: {
    fontFamily: 'Courier',
    fontSize: 16,
    fontWeight: 'bold',
    color: TarodanColors.textPrimary,
    marginTop: 4,
  },
  inboundChipRow: {
    flexDirection: 'row',
    marginTop: 8,
  },
  inboundShipHint: {
    color: TarodanColors.textSecondary,
    marginTop: 8,
  },
  confirmReceiptHint: {
    color: TarodanColors.textSecondary,
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
