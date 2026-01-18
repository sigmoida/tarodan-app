import { View, ScrollView, StyleSheet, TouchableOpacity, Image, Alert, Linking } from 'react-native';
import { Text, Button, Card, Chip, Divider, ActivityIndicator, Snackbar, TextInput, Modal, Portal } from 'react-native-paper';
import { useState } from 'react';
import { router, useLocalSearchParams, Stack } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { format } from 'date-fns';
import { tr } from 'date-fns/locale';
import { api } from '../../src/services/api';
import { useAuthStore } from '../../src/stores/authStore';
import { TarodanColors } from '../../src/theme';

const TRADE_STATUSES = {
  pending: { label: 'Bekliyor', color: TarodanColors.warning, icon: 'time-outline' },
  accepted: { label: 'Kabul Edildi', color: TarodanColors.success, icon: 'checkmark-circle-outline' },
  rejected: { label: 'Reddedildi', color: TarodanColors.error, icon: 'close-circle-outline' },
  countered: { label: 'Karşı Teklif', color: TarodanColors.info, icon: 'swap-horizontal' },
  initiator_shipped: { label: 'Kargo Gönderildi', color: TarodanColors.info, icon: 'cube-outline' },
  receiver_shipped: { label: 'Karşı Taraf Gönderdi', color: TarodanColors.info, icon: 'cube-outline' },
  both_shipped: { label: 'Her İki Kargo Yolda', color: TarodanColors.primary, icon: 'airplane-outline' },
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
}

export default function TradeDetailScreen() {
  const { id } = useLocalSearchParams();
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  
  const [snackbar, setSnackbar] = useState({ visible: false, message: '' });
  const [counterModalVisible, setCounterModalVisible] = useState(false);
  const [shippingModalVisible, setShippingModalVisible] = useState(false);
  const [trackingNumber, setTrackingNumber] = useState('');
  const [counterCashAmount, setCounterCashAmount] = useState('');
  const [counterMessage, setCounterMessage] = useState('');

  // Fetch trade details
  const { data: trade, isLoading, refetch } = useQuery<Trade>({
    queryKey: ['trade', id],
    queryFn: async () => {
      const response = await api.get(`/trades/${id}`);
      return response.data;
    },
    enabled: !!id,
  });

  // Accept trade mutation
  const acceptMutation = useMutation({
    mutationFn: () => api.patch(`/trades/${id}/accept`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trade', id] });
      queryClient.invalidateQueries({ queryKey: ['trades'] });
      setSnackbar({ visible: true, message: 'Takas kabul edildi!' });
    },
    onError: (error: any) => {
      setSnackbar({ visible: true, message: error.response?.data?.message || 'İşlem başarısız' });
    },
  });

  // Reject trade mutation
  const rejectMutation = useMutation({
    mutationFn: () => api.patch(`/trades/${id}/reject`),
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
    mutationFn: () => api.patch(`/trades/${id}/counter`, {
      cashAmount: parseFloat(counterCashAmount) || 0,
      message: counterMessage,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trade', id] });
      setCounterModalVisible(false);
      setSnackbar({ visible: true, message: 'Karşı teklif gönderildi!' });
    },
    onError: (error: any) => {
      setSnackbar({ visible: true, message: error.response?.data?.message || 'İşlem başarısız' });
    },
  });

  // Ship trade mutation
  const shipMutation = useMutation({
    mutationFn: () => api.patch(`/trades/${id}/ship`, { trackingNumber }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trade', id] });
      setShippingModalVisible(false);
      setTrackingNumber('');
      setSnackbar({ visible: true, message: 'Kargo bilgisi kaydedildi!' });
    },
    onError: (error: any) => {
      setSnackbar({ visible: true, message: error.response?.data?.message || 'İşlem başarısız' });
    },
  });

  // Confirm receipt mutation
  const confirmMutation = useMutation({
    mutationFn: () => api.patch(`/trades/${id}/confirm`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trade', id] });
      setSnackbar({ visible: true, message: 'Takas tamamlandı!' });
    },
    onError: (error: any) => {
      setSnackbar({ visible: true, message: error.response?.data?.message || 'İşlem başarısız' });
    },
  });

  // Cancel trade mutation
  const cancelMutation = useMutation({
    mutationFn: () => api.patch(`/trades/${id}/cancel`),
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
  const statusInfo = TRADE_STATUSES[trade.status as keyof typeof TRADE_STATUSES] || TRADE_STATUSES.pending;

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

  const canShip = (trade.status === 'accepted' || trade.status === 'initiator_shipped' || trade.status === 'receiver_shipped') &&
    ((isInitiator && !trade.initiatorShippedAt) || (isReceiver && !trade.receiverShippedAt));

  const canConfirm = trade.status === 'both_shipped';

  const myTrackingNumber = isInitiator ? trade.initiatorTrackingNumber : trade.receiverTrackingNumber;
  const theirTrackingNumber = isInitiator ? trade.receiverTrackingNumber : trade.initiatorTrackingNumber;

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

          {/* Accepted: Ship button */}
          {canShip && (
            <Button
              mode="contained"
              onPress={() => setShippingModalVisible(true)}
              icon="cube-send"
              style={styles.actionButton}
            >
              Kargo Gönderildi
            </Button>
          )}

          {/* Both shipped: Confirm receipt */}
          {canConfirm && (
            <Button
              mode="contained"
              onPress={() => confirmMutation.mutate()}
              loading={confirmMutation.isPending}
              icon="checkmark-done"
              style={[styles.actionButton, { backgroundColor: TarodanColors.success }]}
            >
              Teslim Aldım
            </Button>
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

      {/* Shipping Modal */}
      <Portal>
        <Modal
          visible={shippingModalVisible}
          onDismiss={() => setShippingModalVisible(false)}
          contentContainerStyle={styles.modal}
        >
          <Text variant="titleLarge" style={styles.modalTitle}>Kargo Bilgisi</Text>
          <TextInput
            label="Takip Numarası"
            value={trackingNumber}
            onChangeText={setTrackingNumber}
            mode="outlined"
            style={styles.modalInput}
            placeholder="Kargo takip numaranızı girin"
          />
          <Text variant="bodySmall" style={styles.modalNote}>
            Takip numarası karşı tarafla paylaşılacaktır.
          </Text>
          <View style={styles.modalActions}>
            <Button mode="outlined" onPress={() => setShippingModalVisible(false)}>
              İptal
            </Button>
            <Button
              mode="contained"
              onPress={() => shipMutation.mutate()}
              loading={shipMutation.isPending}
              disabled={!trackingNumber.trim()}
            >
              Kaydet
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
});
