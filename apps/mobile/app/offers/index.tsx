import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Image,
  RefreshControl,
  Modal,
  TextInput,
  FlatList,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { TarodanColors } from '../../src/theme/colors';
import { useAuthStore } from '../../src/stores/authStore';
import { offersApi, ordersApi } from '../../src/services/api';
import { transformImageUrl } from '../../src/utils/imageUrl';
import { formatApiErrorMessage } from '../../src/utils/formatApiErrorMessage';
import { useTranslation } from '../../src/i18n/LanguageContext';

interface Offer {
  id: string;
  amount: number;
  status: 'pending' | 'accepted' | 'rejected' | 'countered' | 'cancelled' | 'expired';
  orderId?: string | null;
  orderStatus?: string | null;
  message?: string;
  expiresAt: string;
  createdAt: string;
  /** Karşı teklif sonrası alıcı onayı bekleniyor mu (web ile parite). */
  buyerMustAccept?: boolean;
  product: {
    id: string;
    title: string;
    price: number;
    imageUrl?: string;
    images?: { cardUrl?: string }[];
    categoryId?: string | null;
  };
  buyer?: { id: string; displayName: string; avatarUrl?: string };
  seller?: { id: string; displayName: string; avatarUrl?: string };
}

type TabType = 'received' | 'sent';
type OfferStatus = Offer['status'];

const STATUS_CONFIG: Record<OfferStatus, { label: string; color: string; bg: string; icon: keyof typeof Ionicons.glyphMap }> = {
  pending:   { label: 'Bekliyor',      color: '#D97706', bg: '#FEF3C7', icon: 'time-outline' },
  accepted:  { label: 'Kabul Edildi',   color: '#059669', bg: '#D1FAE5', icon: 'checkmark-circle-outline' },
  rejected:  { label: 'Reddedildi',     color: '#DC2626', bg: '#FEE2E2', icon: 'close-circle-outline' },
  countered: { label: 'Karşı Teklif',   color: '#2563EB', bg: '#DBEAFE', icon: 'swap-horizontal-outline' },
  cancelled: { label: 'İptal Edildi',   color: '#6B7280', bg: '#F3F4F6', icon: 'close-circle-outline' },
  expired:   { label: 'Süresi Doldu',   color: '#6B7280', bg: '#F3F4F6', icon: 'alert-circle-outline' },
};

function getProductImage(product: Offer['product']): string {
  const img = product.images?.[0];
  const src = img?.cardUrl ?? product.imageUrl;
  return transformImageUrl(src);
}

function getTimeRemaining(expiresAt: string): string | null {
  const diff = new Date(expiresAt).getTime() - Date.now();
  if (diff <= 0) return null;
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  if (hours > 24) return `${Math.floor(hours / 24)} gün`;
  return `${hours}s ${minutes}d`;
}

function formatTimeAgo(
  iso: string,
  t: (key: string, params?: Record<string, string | number>) => string,
): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 0) return t('time.ago.justNow');
  const m = Math.floor(diff / 60000);
  const h = Math.floor(diff / 3600000);
  const d = Math.floor(diff / 86400000);
  if (m < 1) return t('time.ago.justNow');
  if (m < 60) return t('time.ago.minutes', { count: m });
  if (h < 24) return t('time.ago.hours', { count: h });
  if (d < 30) return t('time.ago.days', { count: d });
  const mo = Math.floor(d / 30);
  return t('time.ago.months', { count: mo });
}

function formatPrice(n: number): string {
  return `₺${n.toLocaleString('tr-TR')}`;
}

export default function OffersScreen() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const params = useLocalSearchParams<{ tab?: string | string[] }>();
  const tabFromUrl = (Array.isArray(params.tab) ? params.tab[0] : params.tab)?.toLowerCase();

  const { isAuthenticated, isLoading: authLoading } = useAuthStore();
  const [activeTab, setActiveTab] = useState<TabType>(
    tabFromUrl === 'sent' ? 'sent' : 'received',
  );
  const [offers, setOffers] = useState<Offer[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [estimatedNetByOfferId, setEstimatedNetByOfferId] = useState<Record<string, number>>({});

  const [counterModalVisible, setCounterModalVisible] = useState(false);
  const [counterOfferId, setCounterOfferId] = useState<string | null>(null);
  const [counterAmount, setCounterAmount] = useState('');

  const [buyerCounterModalVisible, setBuyerCounterModalVisible] = useState(false);
  const [buyerCounterOfferId, setBuyerCounterOfferId] = useState<string | null>(null);
  const [buyerCounterRefAmount, setBuyerCounterRefAmount] = useState<number | null>(null);
  const [buyerCounterAmount, setBuyerCounterAmount] = useState('');

  useEffect(() => {
    if (tabFromUrl === 'sent' || tabFromUrl === 'received') {
      setActiveTab(tabFromUrl);
    }
  }, [tabFromUrl]);

  const setTab = useCallback((tab: TabType) => {
    setActiveTab(tab);
    router.replace(`/offers?tab=${tab}`);
  }, []);

  const invalidateOfferRelatedCaches = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['offers'] });
    queryClient.invalidateQueries({ queryKey: ['products'] });
    queryClient.invalidateQueries({
      predicate: (q) => Array.isArray(q.queryKey) && q.queryKey[0] === 'product',
    });
    queryClient.invalidateQueries({ queryKey: ['listings'] });
    queryClient.invalidateQueries({ queryKey: ['my-listings'] });
  }, [queryClient]);

  const fetchOffers = useCallback(async () => {
    try {
      const res = await offersApi.getAll({ type: activeTab });
      const data = res.data?.data || res.data?.offers || [];
      setOffers(data);
    } catch (err) {
      Alert.alert('Hata', formatApiErrorMessage(err, 'Teklifler yüklenirken bir hata oluştu'));
    }
  }, [activeTab]);

  const loadOffers = useCallback(async () => {
    setLoading(true);
    await fetchOffers();
    setLoading(false);
  }, [fetchOffers]);

  useEffect(() => {
    if (isAuthenticated) loadOffers();
  }, [isAuthenticated, activeTab, loadOffers]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchOffers();
    setRefreshing(false);
  }, [fetchOffers]);

  useEffect(() => {
    const pendingReceivedOffers =
      activeTab === 'received'
        ? offers.filter((o) => o.status === 'pending' && !o.buyerMustAccept)
        : [];
    if (pendingReceivedOffers.length === 0) {
      setEstimatedNetByOfferId({});
      return;
    }
    let cancelled = false;
    ordersApi
      .getCommissionPreviewBatch(
        pendingReceivedOffers.map((o) => ({
          amount: Number(o.amount),
          categoryId: o.product?.categoryId ?? null,
        })),
      )
      .then((res) => {
        if (cancelled) return;
        if (res.data?.results && Array.isArray(res.data.results)) {
          const map: Record<string, number> = {};
          pendingReceivedOffers.forEach((o, i) => {
            const r = res.data.results[i];
            if (r != null && typeof r.sellerNetAmount === 'number') map[o.id] = r.sellerNetAmount;
          });
          setEstimatedNetByOfferId(map);
        }
      })
      .catch(() => {
        if (!cancelled) setEstimatedNetByOfferId({});
      });
    return () => {
      cancelled = true;
    };
  }, [activeTab, offers]);

  const handleAccept = async (offerId: string) => {
    setActionLoading(offerId);
    try {
      await offersApi.accept(offerId);
      invalidateOfferRelatedCaches();
      Alert.alert('Başarılı', 'Teklif kabul edildi');
      await fetchOffers();
    } catch (err: unknown) {
      Alert.alert('Hata', formatApiErrorMessage(err, 'Teklif kabul edilirken hata oluştu'));
    } finally {
      setActionLoading(null);
    }
  };

  const handleReject = async (offerId: string) => {
    setActionLoading(offerId);
    try {
      await offersApi.reject(offerId);
      invalidateOfferRelatedCaches();
      Alert.alert('Başarılı', 'Teklif reddedildi');
      await fetchOffers();
    } catch (err: unknown) {
      Alert.alert('Hata', formatApiErrorMessage(err, 'Teklif reddedilirken hata oluştu'));
    } finally {
      setActionLoading(null);
    }
  };

  const handleCancel = async (offerId: string) => {
    setActionLoading(offerId);
    try {
      await offersApi.cancel(offerId);
      invalidateOfferRelatedCaches();
      Alert.alert('Başarılı', 'Teklif iptal edildi');
      await fetchOffers();
    } catch (err: unknown) {
      Alert.alert('Hata', formatApiErrorMessage(err, 'Teklif iptal edilirken hata oluştu'));
    } finally {
      setActionLoading(null);
    }
  };

  const openCounterModal = (offerId: string) => {
    setCounterOfferId(offerId);
    setCounterAmount('');
    setCounterModalVisible(true);
  };

  const handleCounter = async () => {
    if (!counterOfferId) return;
    const amount = parseFloat(counterAmount.replace(',', '.'));
    if (isNaN(amount) || amount <= 0) {
      Alert.alert('Hata', 'Geçerli bir tutar girin');
      return;
    }
    setActionLoading(counterOfferId);
    setCounterModalVisible(false);
    try {
      await offersApi.counter(counterOfferId, amount);
      invalidateOfferRelatedCaches();
      Alert.alert('Başarılı', 'Karşı teklif gönderildi');
      await fetchOffers();
    } catch (err: unknown) {
      Alert.alert('Hata', formatApiErrorMessage(err, 'Karşı teklif gönderilirken hata oluştu'));
    } finally {
      setActionLoading(null);
      setCounterOfferId(null);
    }
  };

  const openBuyerCounterModal = (offer: Offer) => {
    setBuyerCounterOfferId(offer.id);
    setBuyerCounterRefAmount(Number(offer.amount));
    setBuyerCounterAmount('');
    setBuyerCounterModalVisible(true);
  };

  const handleBuyerCounter = async () => {
    if (!buyerCounterOfferId || buyerCounterRefAmount == null) return;
    const amount = parseFloat(buyerCounterAmount.replace(',', '.'));
    if (isNaN(amount) || amount <= 0) {
      Alert.alert('Hata', 'Geçerli bir tutar girin');
      return;
    }
    if (amount >= buyerCounterRefAmount) {
      Alert.alert(
        'Hata',
        `Satıcının karşı teklifi ₺${buyerCounterRefAmount.toLocaleString('tr-TR')}. Yeni tutar bundan düşük olmalıdır.`,
      );
      return;
    }
    setActionLoading(buyerCounterOfferId);
    setBuyerCounterModalVisible(false);
    try {
      await offersApi.buyerCounter(buyerCounterOfferId, amount);
      invalidateOfferRelatedCaches();
      Alert.alert('Başarılı', 'Karşı teklifiniz gönderildi; satıcı yanıtlayacak');
      await fetchOffers();
    } catch (err: unknown) {
      Alert.alert('Hata', formatApiErrorMessage(err, 'Karşı teklif gönderilirken hata oluştu'));
    } finally {
      setActionLoading(null);
      setBuyerCounterOfferId(null);
      setBuyerCounterRefAmount(null);
    }
  };

  // --- Auth gate ---
  if (authLoading) {
    return (
      <SafeAreaView style={styles.centered}>
        <ActivityIndicator size="large" color={TarodanColors.primary} />
      </SafeAreaView>
    );
  }

  if (!isAuthenticated) {
    return (
      <SafeAreaView style={styles.centered}>
        <Ionicons name="pricetag-outline" size={64} color={TarodanColors.primary} />
        <Text style={styles.authTitle}>Tekliflerim</Text>
        <Text style={styles.authSubtitle}>Tekliflerinizi görmek için giriş yapın</Text>
        <TouchableOpacity style={styles.loginBtn} onPress={() => router.push('/(auth)/login')}>
          <Text style={styles.loginBtnText}>Giriş Yap</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => router.push('/(auth)/register')}>
          <Text style={styles.registerLink}>Hesap Oluştur</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  // --- Offer card ---
  const renderOffer = ({ item: offer }: { item: Offer }) => {
    const status = STATUS_CONFIG[offer.status];
    const otherUser = activeTab === 'received' ? offer.buyer : offer.seller;
    const timeRemaining = offer.status === 'pending' ? getTimeRemaining(offer.expiresAt) : null;
    const isActionLoading = actionLoading === offer.id;
    const estimatedNet =
      activeTab === 'received' && offer.status === 'pending' && !offer.buyerMustAccept
        ? estimatedNetByOfferId[offer.id]
        : undefined;

    return (
      <View style={styles.card}>
        {/* Top row: image + info */}
        <View style={styles.cardRow}>
          <TouchableOpacity onPress={() => router.push(`/product/${offer.product.id}` as any)}>
            <Image source={{ uri: getProductImage(offer.product) }} style={styles.productImage} />
          </TouchableOpacity>

          <View style={styles.cardContent}>
            <TouchableOpacity onPress={() => router.push(`/product/${offer.product.id}` as any)}>
              <Text style={styles.productTitle} numberOfLines={2}>{offer.product.title}</Text>
            </TouchableOpacity>

            <Text style={styles.originalPrice}>
              İlan Fiyatı: <Text style={styles.strikethrough}>{formatPrice(offer.product.price)}</Text>
            </Text>

            {/* Status badge */}
            <View style={[styles.statusBadge, { backgroundColor: status.bg }]}>
              <Ionicons name={status.icon} size={14} color={status.color} />
              <Text style={[styles.statusText, { color: status.color }]}>{status.label}</Text>
            </View>
          </View>
        </View>

        {/* Offer amount */}
        <View style={styles.amountRow}>
          <View style={styles.amountBox}>
            <Text style={styles.amountLabel}>Teklif Tutarı</Text>
            <Text style={styles.amountValue}>{formatPrice(offer.amount)}</Text>
          </View>

          {estimatedNet != null && (
            <View style={styles.netBox}>
              <Text style={styles.netLabel}>Tahmini net (satıcı)</Text>
              <Text style={styles.netValue}>{formatPrice(estimatedNet)}</Text>
            </View>
          )}

          {timeRemaining && (
            <View style={styles.timeBox}>
              <Ionicons name="time-outline" size={14} color="#D97706" />
              <Text style={styles.timeText}>{timeRemaining} kaldı</Text>
            </View>
          )}
        </View>

        {/* Other user */}
        {otherUser && (
          <View style={styles.userRow}>
            {otherUser.avatarUrl ? (
              <Image source={{ uri: transformImageUrl(otherUser.avatarUrl) }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatar, styles.avatarPlaceholder]}>
                <Ionicons name="person" size={16} color={TarodanColors.textTertiary} />
              </View>
            )}
            <View>
              <Text style={styles.userLabel}>
                {activeTab === 'received' ? 'Teklif Veren' : 'Satıcı'}
              </Text>
              <Text style={styles.userName}>{otherUser.displayName}</Text>
            </View>
          </View>
        )}

        {/* Message */}
        {offer.message ? (
          <View style={styles.messageBox}>
            <Ionicons name="chatbubble-outline" size={14} color={TarodanColors.textTertiary} style={{ marginTop: 2 }} />
            <Text style={styles.messageText}>"{offer.message}"</Text>
          </View>
        ) : null}

        {/* Date */}
        <View style={styles.dateRow}>
          <Ionicons name="calendar-outline" size={14} color={TarodanColors.textTertiary} />
          <Text style={styles.dateText}>{formatTimeAgo(offer.createdAt, t)}</Text>
        </View>

        {/* Actions */}
        {offer.status === 'pending' && (
          <View style={styles.actionsRow}>
            {activeTab === 'received' && offer.buyerMustAccept ? (
              <View style={styles.waitingBanner}>
                <Ionicons name="time-outline" size={18} color="#B45309" />
                <Text style={styles.waitingBannerText}>
                  Alıcının karşı teklifinizi kabul veya reddetmesi bekleniyor.
                </Text>
              </View>
            ) : activeTab === 'received' ? (
              <>
                <TouchableOpacity
                  style={[styles.actionBtn, styles.acceptBtn]}
                  onPress={() => handleAccept(offer.id)}
                  disabled={isActionLoading}
                >
                  {isActionLoading ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <>
                      <Ionicons name="checkmark" size={16} color="#fff" />
                      <Text style={styles.actionBtnText}>Kabul Et</Text>
                    </>
                  )}
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.actionBtn, styles.rejectBtn]}
                  onPress={() => handleReject(offer.id)}
                  disabled={isActionLoading}
                >
                  <Ionicons name="close" size={16} color="#fff" />
                  <Text style={styles.actionBtnText}>Reddet</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.actionBtn, styles.counterBtn]}
                  onPress={() => openCounterModal(offer.id)}
                  disabled={isActionLoading}
                >
                  <Ionicons name="swap-horizontal" size={16} color="#fff" />
                  <Text style={styles.actionBtnText}>Karşı Teklif</Text>
                </TouchableOpacity>
              </>
            ) : offer.buyerMustAccept ? (
              <>
                <TouchableOpacity
                  style={[styles.actionBtn, styles.acceptBtn]}
                  onPress={() => handleAccept(offer.id)}
                  disabled={isActionLoading}
                >
                  {isActionLoading ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <>
                      <Ionicons name="checkmark" size={16} color="#fff" />
                      <Text style={styles.actionBtnText}>Karşı teklifi kabul et</Text>
                    </>
                  )}
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.actionBtn, styles.rejectBtn]}
                  onPress={() => handleReject(offer.id)}
                  disabled={isActionLoading}
                >
                  <Ionicons name="close" size={16} color="#fff" />
                  <Text style={styles.actionBtnText}>Reddet</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.actionBtn, styles.counterBtn]}
                  onPress={() => openBuyerCounterModal(offer)}
                  disabled={isActionLoading}
                >
                  <Ionicons name="trending-down" size={16} color="#fff" />
                  <Text style={styles.actionBtnText}>Daha düşük teklif</Text>
                </TouchableOpacity>
              </>
            ) : (
              <TouchableOpacity
                style={[styles.actionBtn, styles.cancelBtn]}
                onPress={() => handleCancel(offer.id)}
                disabled={isActionLoading}
              >
                {isActionLoading ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <>
                    <Ionicons name="close" size={16} color="#fff" />
                    <Text style={styles.actionBtnText}>İptal Et</Text>
                  </>
                )}
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Accepted → order link */}
        {offer.status === 'accepted' && offer.orderId && (
          <TouchableOpacity
            style={[styles.actionBtn, styles.orderBtn, { alignSelf: 'flex-start', marginTop: 12 }]}
            onPress={() => router.push(`/order-track?orderId=${offer.orderId}`)}
          >
            <Ionicons name="cube-outline" size={16} color="#fff" />
            <Text style={styles.actionBtnText}>Siparişi Görüntüle</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  // --- Empty state ---
  const renderEmpty = () => (
    <View style={styles.emptyContainer}>
      <View style={styles.emptyIconWrap}>
        <Ionicons
          name={activeTab === 'received' ? 'mail-open-outline' : 'paper-plane-outline'}
          size={48}
          color={TarodanColors.primary}
        />
      </View>
      <Text style={styles.emptyTitle}>
        {activeTab === 'received' ? 'Henüz gelen teklif yok' : 'Henüz gönderilen teklif yok'}
      </Text>
      <Text style={styles.emptySubtitle}>
        {activeTab === 'received'
          ? 'Alıcılar ilanlarınıza teklif verdiğinde burada görünecek.'
          : 'İlanlara göz atın ve ilk teklifinizi yapın!'}
      </Text>
      <TouchableOpacity style={styles.browseBtn} onPress={() => router.push('/listings')}>
        <Ionicons name="search-outline" size={18} color="#fff" />
        <Text style={styles.browseBtnText}>İlanlara Göz At</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={TarodanColors.textPrimary} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Tekliflerim</Text>
          <Text style={styles.headerSubtitle}>Tekliflerinizi yönetin</Text>
        </View>
      </View>

      {/* Tabs */}
      <View style={styles.tabContainer}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'received' && styles.tabActive]}
          onPress={() => setTab('received')}
        >
          <Ionicons
            name="mail-open-outline"
            size={18}
            color={activeTab === 'received' ? TarodanColors.primary : TarodanColors.textTertiary}
          />
          <Text style={[styles.tabText, activeTab === 'received' && styles.tabTextActive]}>
            Gelen
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'sent' && styles.tabActive]}
          onPress={() => setTab('sent')}
        >
          <Ionicons
            name="paper-plane-outline"
            size={18}
            color={activeTab === 'sent' ? TarodanColors.primary : TarodanColors.textTertiary}
          />
          <Text style={[styles.tabText, activeTab === 'sent' && styles.tabTextActive]}>
            Gönderilen
          </Text>
        </TouchableOpacity>
      </View>

      {/* Content */}
      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={TarodanColors.primary} />
          <Text style={styles.loadingText}>Teklifler yükleniyor...</Text>
        </View>
      ) : (
        <FlatList
          data={offers}
          keyExtractor={(item) => item.id}
          renderItem={renderOffer}
          ListEmptyComponent={renderEmpty}
          contentContainerStyle={offers.length === 0 ? { flex: 1 } : styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[TarodanColors.primary]} />
          }
        />
      )}

      {/* Counter modal (satıcı) */}
      <Modal visible={counterModalVisible} transparent animationType="fade" onRequestClose={() => setCounterModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Karşı Teklif</Text>
            <Text style={styles.modalSubtitle}>Yeni teklif tutarını girin</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Tutar (₺)"
              placeholderTextColor={TarodanColors.textTertiary}
              keyboardType="numeric"
              value={counterAmount}
              onChangeText={setCounterAmount}
              autoFocus
            />
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalCancelBtn]}
                onPress={() => setCounterModalVisible(false)}
              >
                <Text style={styles.modalCancelBtnText}>Vazgeç</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalBtn, styles.modalConfirmBtn]} onPress={handleCounter}>
                <Text style={styles.modalConfirmBtnText}>Gönder</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Alıcı karşı teklifi (satıcı tutarından düşük) */}
      <Modal
        visible={buyerCounterModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setBuyerCounterModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Daha düşük teklif</Text>
            <Text style={styles.modalSubtitle}>
              Satıcının karşı teklifi:{' '}
              {buyerCounterRefAmount != null
                ? `₺${buyerCounterRefAmount.toLocaleString('tr-TR')}`
                : '—'}
              . Bu tutarın altında, ilan fiyatının en az %50 kadarına uygun bir teklif yazın.
            </Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Yeni tutar (₺)"
              placeholderTextColor={TarodanColors.textTertiary}
              keyboardType="numeric"
              value={buyerCounterAmount}
              onChangeText={setBuyerCounterAmount}
              autoFocus
            />
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalCancelBtn]}
                onPress={() => setBuyerCounterModalVisible(false)}
              >
                <Text style={styles.modalCancelBtnText}>Vazgeç</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalBtn, styles.modalConfirmBtn]} onPress={handleBuyerCounter}>
                <Text style={styles.modalConfirmBtnText}>Gönder</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: TarodanColors.backgroundSecondary,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    backgroundColor: TarodanColors.backgroundSecondary,
  },

  // Auth gate
  authTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: TarodanColors.textPrimary,
    marginTop: 16,
  },
  authSubtitle: {
    fontSize: 14,
    color: TarodanColors.textSecondary,
    marginTop: 8,
    marginBottom: 24,
    textAlign: 'center',
  },
  loginBtn: {
    backgroundColor: TarodanColors.primary,
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 10,
    marginBottom: 12,
  },
  loginBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  registerLink: {
    color: TarodanColors.primary,
    fontSize: 14,
    fontWeight: '600',
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: TarodanColors.background,
    borderBottomWidth: 1,
    borderBottomColor: TarodanColors.border,
  },
  backBtn: {
    marginRight: 12,
    padding: 4,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: TarodanColors.textPrimary,
  },
  headerSubtitle: {
    fontSize: 12,
    color: TarodanColors.textTertiary,
    marginTop: 2,
  },

  // Tabs
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: TarodanColors.background,
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 8,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: TarodanColors.backgroundTertiary,
  },
  tabActive: {
    backgroundColor: TarodanColors.primaryLight,
    borderWidth: 1,
    borderColor: TarodanColors.primary,
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
    color: TarodanColors.textTertiary,
  },
  tabTextActive: {
    color: TarodanColors.primary,
  },

  // List
  listContent: {
    padding: 16,
    paddingBottom: 32,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: TarodanColors.textSecondary,
  },

  // Card
  card: {
    backgroundColor: TarodanColors.background,
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: TarodanColors.border,
  },
  cardRow: {
    flexDirection: 'row',
    gap: 12,
  },
  productImage: {
    width: 80,
    height: 80,
    borderRadius: 8,
    backgroundColor: TarodanColors.backgroundTertiary,
  },
  cardContent: {
    flex: 1,
    gap: 4,
  },
  productTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: TarodanColors.textPrimary,
    lineHeight: 20,
  },
  originalPrice: {
    fontSize: 12,
    color: TarodanColors.textTertiary,
    marginTop: 2,
  },
  strikethrough: {
    textDecorationLine: 'line-through',
  },

  // Status badge
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    marginTop: 4,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '600',
  },

  // Amount
  amountRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 10,
    marginTop: 12,
  },
  amountBox: {
    backgroundColor: TarodanColors.primaryLight,
    borderWidth: 1,
    borderColor: TarodanColors.primaryMedium,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  amountLabel: {
    fontSize: 10,
    color: TarodanColors.textTertiary,
    marginBottom: 2,
  },
  amountValue: {
    fontSize: 20,
    fontWeight: '700',
    color: TarodanColors.primary,
  },
  netBox: {
    backgroundColor: '#D1FAE5',
    borderWidth: 1,
    borderColor: '#6EE7B7',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    flex: 1,
    minWidth: 0,
  },
  netLabel: {
    fontSize: 10,
    color: TarodanColors.textTertiary,
    marginBottom: 2,
  },
  netValue: {
    fontSize: 16,
    fontWeight: '700',
    color: '#059669',
  },
  timeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  timeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#D97706',
  },

  // User
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: TarodanColors.backgroundTertiary,
  },
  avatarPlaceholder: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  userLabel: {
    fontSize: 10,
    color: TarodanColors.textTertiary,
  },
  userName: {
    fontSize: 13,
    fontWeight: '600',
    color: TarodanColors.textPrimary,
  },

  // Message
  messageBox: {
    flexDirection: 'row',
    gap: 6,
    backgroundColor: TarodanColors.backgroundSecondary,
    borderRadius: 8,
    padding: 10,
    marginTop: 10,
  },
  messageText: {
    flex: 1,
    fontSize: 13,
    color: TarodanColors.textSecondary,
    fontStyle: 'italic',
    lineHeight: 18,
  },

  // Date
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: TarodanColors.borderLight,
  },
  dateText: {
    fontSize: 12,
    color: TarodanColors.textTertiary,
  },

  // Actions
  actionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
  },
  waitingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
    minWidth: '100%',
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
  },
  waitingBannerText: {
    flex: 1,
    fontSize: 13,
    color: '#92400E',
    lineHeight: 18,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 8,
  },
  actionBtnText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  acceptBtn: {
    backgroundColor: TarodanColors.success,
  },
  rejectBtn: {
    backgroundColor: TarodanColors.error,
  },
  counterBtn: {
    backgroundColor: TarodanColors.info,
  },
  cancelBtn: {
    backgroundColor: '#6B7280',
  },
  orderBtn: {
    backgroundColor: TarodanColors.primary,
  },

  // Empty
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyIconWrap: {
    width: 80,
    height: 80,
    borderRadius: 20,
    backgroundColor: TarodanColors.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: TarodanColors.textPrimary,
    marginBottom: 8,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 14,
    color: TarodanColors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 20,
  },
  browseBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: TarodanColors.primary,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 10,
  },
  browseBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },

  // Counter modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalContent: {
    width: '100%',
    backgroundColor: TarodanColors.background,
    borderRadius: 16,
    padding: 24,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: TarodanColors.textPrimary,
    marginBottom: 4,
  },
  modalSubtitle: {
    fontSize: 13,
    color: TarodanColors.textSecondary,
    marginBottom: 16,
  },
  modalInput: {
    borderWidth: 1,
    borderColor: TarodanColors.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: TarodanColors.textPrimary,
    backgroundColor: TarodanColors.backgroundSecondary,
    marginBottom: 20,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 10,
  },
  modalBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  modalCancelBtn: {
    backgroundColor: TarodanColors.backgroundTertiary,
  },
  modalCancelBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: TarodanColors.textSecondary,
  },
  modalConfirmBtn: {
    backgroundColor: TarodanColors.primary,
  },
  modalConfirmBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
});
