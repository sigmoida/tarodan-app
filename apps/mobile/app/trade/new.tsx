import { View, ScrollView, StyleSheet, TouchableOpacity, Image, Alert } from 'react-native';
import { Text, TextInput, Button, Card, Chip, Divider, ActivityIndicator, Snackbar } from 'react-native-paper';
import { useState, useEffect } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { listingsApi, tradesApi, userApi } from '../../src/services/api';
import { useAuthStore } from '../../src/stores/authStore';
import { TarodanColors } from '../../src/theme';
import { getUpgradeMessage } from '../../src/utils/membershipLimits';
import { getImageUrl } from '../../src/utils/imageUrl';
import { getProductEffectivePrice } from '../../src/utils/productPrice';
import { formatApiErrorMessage } from '../../src/utils/formatApiErrorMessage';

interface Product {
  id: string;
  title: string;
  price: number;
  images?: any[];
  isTradeEnabled?: boolean;
  status?: string;
}

function firstQueryParam(v?: string | string[]) {
  if (v == null) return undefined;
  return Array.isArray(v) ? v[0] : v;
}

export default function NewTradeScreen() {
  const params = useLocalSearchParams<{
    listing?: string | string[];
    productId?: string | string[];
    targetProductId?: string | string[];
    targetSellerId?: string | string[];
  }>();
  /** Web: `?listing=` — mobil ürün sayfası `listing` + `productId` gönderir */
  const listingId =
    firstQueryParam(params.listing) ||
    firstQueryParam(params.productId) ||
    firstQueryParam(params.targetProductId);
  const targetSellerIdParam = (firstQueryParam(params.targetSellerId) || '').trim();

  const { user, isAuthenticated, limits, refreshUserData } = useAuthStore();
  const queryClient = useQueryClient();

  const [step, setStep] = useState(1); // 1: Select my items, 2: Select their items, 3: Review
  const [selectedMyItems, setSelectedMyItems] = useState<Product[]>([]);
  const [selectedTheirItems, setSelectedTheirItems] = useState<Product[]>([]);
  const [cashAmount, setCashAmount] = useState('');
  const [cashDirection, setCashDirection] = useState<'offer' | 'request'>('offer'); // offer = I pay, request = they pay
  const [message, setMessage] = useState('');
  const [snackbar, setSnackbar] = useState({ visible: false, message: '' });

  /** Web trades/new ile aynı: limits yüklüyse onu kullan; değilse üyelik kademesi */
  const canTrade =
    limits != null
      ? !!limits.canTrade
      : ['basic', 'premium', 'business'].includes((user?.membershipTier ?? '').toLowerCase());

  const { data: targetProduct } = useQuery({
    queryKey: ['trade-target-listing', listingId],
    queryFn: async () => {
      const res = await listingsApi.getOne(listingId!);
      return res.data?.product || res.data?.data || res.data;
    },
    enabled: !!listingId && !targetSellerIdParam && canTrade,
  });

  const targetSellerId =
    targetSellerIdParam || targetProduct?.seller?.id || targetProduct?.sellerId || '';

  const { data: myProducts, isLoading: loadingMyProducts } = useQuery({
    queryKey: ['my-tradeable-products', user?.id],
    queryFn: async () => {
      const response = await userApi.getMyProducts({ status: 'active' });
      const raw = response.data?.data || response.data?.products || response.data || [];
      const list = Array.isArray(raw) ? raw : [];
      return list.filter(
        (p: Product) =>
          p.status === 'active' &&
          p.isTradeEnabled !== false &&
          listingId &&
          p.id !== listingId,
      );
    },
    enabled: isAuthenticated && canTrade && !!user?.id,
  });

  const { data: theirProducts, isLoading: loadingTheirProducts } = useQuery({
    queryKey: ['seller-tradeable-products', targetSellerId],
    queryFn: async () => {
      const response = await listingsApi.getAll({
        sellerId: targetSellerId,
        tradeAvailable: true,
        status: 'active',
      });
      const raw = response.data?.data || response.data?.products || response.data || [];
      return Array.isArray(raw) ? raw : [];
    },
    enabled: !!targetSellerId && canTrade,
  });

  useEffect(() => {
    if (!listingId || !theirProducts?.length) return;
    const target = theirProducts.find((p: Product) => p.id === listingId);
    if (target) {
      setSelectedTheirItems((prev) => (prev.some((p) => p.id === listingId) ? prev : [target]));
    }
  }, [listingId, theirProducts]);

  const invalidateTradeRelatedQueries = () => {
    queryClient.invalidateQueries({ queryKey: ['trades'] });
    queryClient.invalidateQueries({ queryKey: ['my-tradeable-products'] });
    queryClient.invalidateQueries({ queryKey: ['seller-tradeable-products'] });
    queryClient.invalidateQueries({ queryKey: ['products'] });
    queryClient.invalidateQueries({
      predicate: (q) => Array.isArray(q.queryKey) && q.queryKey[0] === 'product',
    });
    queryClient.invalidateQueries({ queryKey: ['listings'] });
    queryClient.invalidateQueries({ queryKey: ['my-listings'] });
  };

  const createTradeMutation = useMutation({
    mutationFn: async () => {
      const cashVal = parseFloat(cashAmount.replace(',', '.')) || 0;
      let finalCash: number | undefined;
      if (cashVal > 0) {
        finalCash = cashDirection === 'offer' ? cashVal : -cashVal;
      }
      return tradesApi.create({
        receiverId: targetSellerId,
        initiatorItems: selectedMyItems.map((p) => ({ productId: p.id, quantity: 1 })),
        receiverItems: selectedTheirItems.map((p) => ({ productId: p.id, quantity: 1 })),
        cashAmount: finalCash,
        message: message.trim() || undefined,
      });
    },
    onSuccess: () => {
      invalidateTradeRelatedQueries();
      setSnackbar({ visible: true, message: 'Takas teklifi gönderildi!' });
      setTimeout(() => router.replace('/trades'), 1200);
    },
    onError: async (error: unknown) => {
      const msg = formatApiErrorMessage(error, 'Takas teklifi gönderilemedi');
      if (
        msg.includes('Takas özelliği') ||
        msg.includes('üyeliğinizde mevcut değil') ||
        msg.includes('takas özelliğine sahip değil')
      ) {
        await refreshUserData();
      }
      setSnackbar({ visible: true, message: msg });
    },
  });

  const myTotal = selectedMyItems.reduce((sum, p) => sum + getProductEffectivePrice(p), 0);
  const theirTotal = selectedTheirItems.reduce((sum, p) => sum + getProductEffectivePrice(p), 0);
  const cashValue = parseFloat(cashAmount.replace(',', '.')) || 0;
  const effectiveCash = cashDirection === 'offer' ? cashValue : -cashValue;
  const finalDiff = theirTotal - myTotal - effectiveCash;

  // Check premium access
  if (!canTrade) {
    const upgradeInfo = getUpgradeMessage('tradeFeature');
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color={TarodanColors.textOnPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Takas Teklifi</Text>
          <View style={{ width: 24 }} />
        </View>
        
        <View style={styles.premiumRequired}>
          <MaterialCommunityIcons name="swap-horizontal" size={80} color={TarodanColors.primary} />
          <Text variant="headlineSmall" style={styles.premiumTitle}>{upgradeInfo.title}</Text>
          <Text variant="bodyMedium" style={styles.premiumSubtitle}>{upgradeInfo.message}</Text>
          
          <View style={styles.premiumFeatures}>
            <View style={styles.premiumFeature}>
              <Ionicons name="checkmark-circle" size={20} color={TarodanColors.success} />
              <Text style={styles.premiumFeatureText}>Takas teklifi oluşturun</Text>
            </View>
            <View style={styles.premiumFeature}>
              <Ionicons name="checkmark-circle" size={20} color={TarodanColors.success} />
              <Text style={styles.premiumFeatureText}>Karşı teklif yapın</Text>
            </View>
            <View style={styles.premiumFeature}>
              <Ionicons name="checkmark-circle" size={20} color={TarodanColors.success} />
              <Text style={styles.premiumFeatureText}>Nakit fark ekleyin</Text>
            </View>
            <View style={styles.premiumFeature}>
              <Ionicons name="checkmark-circle" size={20} color={TarodanColors.success} />
              <Text style={styles.premiumFeatureText}>Takas koruma programı</Text>
            </View>
          </View>
          
          <Button mode="contained" onPress={() => router.push('/membership')} style={styles.upgradeButton}>
            Üyelik Planları
          </Button>
          <Button mode="text" onPress={() => router.back()}>
            Geri Dön
          </Button>
        </View>
      </View>
    );
  }

  if (!isAuthenticated) {
    return (
      <View style={styles.centeredContainer}>
        <Text variant="titleLarge">Giriş Yapın</Text>
        <Text variant="bodyMedium" style={styles.subtitle}>Takas teklifi vermek için giriş yapmalısınız</Text>
        <Button mode="contained" onPress={() => router.push('/(auth)/login')}>Giriş Yap</Button>
      </View>
    );
  }

  const toggleMyItem = (product: Product) => {
    if (selectedMyItems.find(p => p.id === product.id)) {
      setSelectedMyItems(selectedMyItems.filter(p => p.id !== product.id));
    } else {
      setSelectedMyItems([...selectedMyItems, product]);
    }
  };

  const toggleTheirItem = (product: Product) => {
    if (selectedTheirItems.find(p => p.id === product.id)) {
      setSelectedTheirItems(selectedTheirItems.filter(p => p.id !== product.id));
    } else {
      setSelectedTheirItems([...selectedTheirItems, product]);
    }
  };

  const handleSubmit = () => {
    const cashVal = parseFloat(cashAmount.replace(',', '.')) || 0;
    if (selectedMyItems.length === 0 && cashVal <= 0) {
      Alert.alert('Hata', 'En az bir ürün seçin veya nakit farkı girin');
      return;
    }
    if (selectedTheirItems.length === 0) {
      Alert.alert('Hata', 'Karşı taraftan en az bir ürün seçmelisiniz');
      return;
    }
    createTradeMutation.mutate();
  };

  const renderProductCard = (product: Product, isSelected: boolean, onToggle: () => void) => (
    <TouchableOpacity
      key={product.id}
      style={[styles.productCard, isSelected && styles.productCardSelected]}
      onPress={onToggle}
    >
      <Image
        source={{ uri: getImageUrl(product.images) }}
        style={styles.productImage}
      />
      <View style={styles.productInfo}>
        <Text variant="bodyMedium" numberOfLines={2} style={styles.productTitle}>
          {product.title}
        </Text>
        <Text variant="bodySmall" style={styles.productPrice}>
          ₺{getProductEffectivePrice(product).toLocaleString('tr-TR')}
        </Text>
      </View>
      <View style={[styles.checkbox, isSelected && styles.checkboxSelected]}>
        {isSelected && <Ionicons name="checkmark" size={16} color="#fff" />}
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={TarodanColors.textOnPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Takas Teklifi</Text>
        <View style={{ width: 24 }} />
      </View>

      {/* Steps Indicator */}
      <View style={styles.stepsContainer}>
        {[1, 2, 3].map((s) => (
          <View key={s} style={styles.stepWrapper}>
            <View style={[styles.stepCircle, step >= s && styles.stepCircleActive]}>
              <Text style={[styles.stepNumber, step >= s && styles.stepNumberActive]}>{s}</Text>
            </View>
            <Text style={[styles.stepLabel, step >= s && styles.stepLabelActive]}>
              {s === 1 ? 'Ürünlerim' : s === 2 ? 'İstediklerim' : 'Onay'}
            </Text>
          </View>
        ))}
      </View>

      <ScrollView style={styles.content}>
        {/* Step 1: Select My Items */}
        {step === 1 && (
          <View>
            <Text variant="titleMedium" style={styles.sectionTitle}>
              Takas için ürünlerinizi seçin
            </Text>
            
            {loadingMyProducts ? (
              <ActivityIndicator style={{ marginTop: 32 }} />
            ) : myProducts?.length === 0 ? (
              <Card style={styles.emptyCard}>
                <Card.Content style={styles.emptyContent}>
                  <Ionicons name="pricetag-outline" size={48} color={TarodanColors.textLight} />
                  <Text variant="bodyMedium" style={styles.emptyText}>
                    Takas için aktif ilanınız yok
                  </Text>
                  <Button mode="outlined" onPress={() => router.push('/(tabs)/create')}>
                    İlan Oluştur
                  </Button>
                </Card.Content>
              </Card>
            ) : (
              myProducts?.map((product: Product) =>
                renderProductCard(
                  product,
                  !!selectedMyItems.find(p => p.id === product.id),
                  () => toggleMyItem(product)
                )
              )
            )}

            <View style={styles.stepActions}>
              <Button mode="contained" onPress={() => setStep(2)}>
                Devam ({selectedMyItems.length} seçili)
              </Button>
            </View>
          </View>
        )}

        {/* Step 2: Select Their Items */}
        {step === 2 && (
          <View>
            <Text variant="titleMedium" style={styles.sectionTitle}>
              İstediğiniz ürünleri seçin
            </Text>
            
            {loadingTheirProducts ? (
              <ActivityIndicator style={{ marginTop: 32 }} />
            ) : theirProducts?.length === 0 ? (
              <Card style={styles.emptyCard}>
                <Card.Content style={styles.emptyContent}>
                  <Ionicons name="swap-horizontal" size={48} color={TarodanColors.textLight} />
                  <Text variant="bodyMedium" style={styles.emptyText}>
                    Bu satıcının takas için ürünü yok
                  </Text>
                </Card.Content>
              </Card>
            ) : (
              theirProducts?.map((product: Product) =>
                renderProductCard(
                  product,
                  !!selectedTheirItems.find(p => p.id === product.id),
                  () => toggleTheirItem(product)
                )
              )
            )}

            {/* Cash Adjustment */}
            <Card style={styles.cashCard}>
              <Card.Content>
                <Text variant="titleSmall" style={styles.cashTitle}>Nakit Fark (Opsiyonel)</Text>
                <View style={styles.cashDirectionRow}>
                  <Chip
                    selected={cashDirection === 'offer'}
                    onPress={() => setCashDirection('offer')}
                    style={styles.cashChip}
                  >
                    Ben ödeyeceğim
                  </Chip>
                  <Chip
                    selected={cashDirection === 'request'}
                    onPress={() => setCashDirection('request')}
                    style={styles.cashChip}
                  >
                    Karşı taraf ödesin
                  </Chip>
                </View>
                <TextInput
                  label="Tutar (₺)"
                  value={cashAmount}
                  onChangeText={setCashAmount}
                  keyboardType="numeric"
                  mode="outlined"
                  style={styles.cashInput}
                  textColor={TarodanColors.textPrimary}
                  outlineColor={TarodanColors.border}
                  activeOutlineColor={TarodanColors.primary}
                  theme={{ colors: { onSurfaceVariant: TarodanColors.textSecondary } }}
                />
              </Card.Content>
            </Card>

            <View style={styles.stepActions}>
              <Button mode="outlined" onPress={() => setStep(1)} style={{ marginRight: 12 }}>
                Geri
              </Button>
              <Button
                mode="contained"
                disabled={selectedTheirItems.length === 0}
                onPress={() => setStep(3)}
              >
                Devam
              </Button>
            </View>
          </View>
        )}

        {/* Step 3: Review & Submit */}
        {step === 3 && (
          <View>
            <Text variant="titleMedium" style={styles.sectionTitle}>
              Takas Özeti
            </Text>

            {/* My Items Summary */}
            <Card style={styles.summaryCard}>
              <Card.Content>
                <Text variant="titleSmall" style={styles.summaryTitle}>
                  Teklif Ettiğiniz Ürünler
                </Text>
                {selectedMyItems.map((product) => (
                  <View key={product.id} style={styles.summaryItem}>
                    <Image
                      source={{ uri: getImageUrl(product.images) }}
                      style={styles.summaryImage}
                    />
                    <Text variant="bodySmall" style={styles.summaryItemTitle} numberOfLines={1}>
                      {product.title}
                    </Text>
                    <Text variant="bodySmall" style={styles.summaryItemPrice}>
                      ₺{product.price?.toLocaleString('tr-TR')}
                    </Text>
                  </View>
                ))}
                <Divider style={styles.summaryDivider} />
                <View style={styles.summaryTotal}>
                  <Text variant="bodyMedium">Toplam Değer:</Text>
                  <Text variant="titleSmall" style={styles.totalPrice}>
                    ₺{myTotal.toLocaleString('tr-TR')}
                  </Text>
                </View>
              </Card.Content>
            </Card>

            {/* Their Items Summary */}
            <Card style={styles.summaryCard}>
              <Card.Content>
                <Text variant="titleSmall" style={styles.summaryTitle}>
                  İstediğiniz Ürünler
                </Text>
                {selectedTheirItems.map((product) => (
                  <View key={product.id} style={styles.summaryItem}>
                    <Image
                      source={{ uri: getImageUrl(product.images) }}
                      style={styles.summaryImage}
                    />
                    <Text variant="bodySmall" style={styles.summaryItemTitle} numberOfLines={1}>
                      {product.title}
                    </Text>
                    <Text variant="bodySmall" style={styles.summaryItemPrice}>
                      ₺{product.price?.toLocaleString('tr-TR')}
                    </Text>
                  </View>
                ))}
                <Divider style={styles.summaryDivider} />
                <View style={styles.summaryTotal}>
                  <Text variant="bodyMedium">Toplam Değer:</Text>
                  <Text variant="titleSmall" style={styles.totalPrice}>
                    ₺{theirTotal.toLocaleString('tr-TR')}
                  </Text>
                </View>
              </Card.Content>
            </Card>

            {/* Cash Summary */}
            {cashValue > 0 && (
              <Card style={styles.summaryCard}>
                <Card.Content>
                  <Text variant="titleSmall" style={styles.summaryTitle}>Nakit Fark</Text>
                  <Text variant="bodyMedium">
                    {cashDirection === 'offer' ? 'Siz ödeyeceksiniz: ' : 'Karşı taraf ödeyecek: '}
                    <Text style={{ color: TarodanColors.primary, fontWeight: 'bold' }}>
                      ₺{cashValue.toLocaleString('tr-TR')}
                    </Text>
                  </Text>
                </Card.Content>
              </Card>
            )}

            {/* Message */}
            <TextInput
              label="Mesajınız (Opsiyonel)"
              value={message}
              onChangeText={setMessage}
              multiline
              numberOfLines={3}
              mode="outlined"
              style={styles.messageInput}
              placeholder="Teklif hakkında bir not ekleyin..."
            />

            {/* Trade Protection Info */}
            <Card style={styles.protectionCard}>
              <Card.Content style={styles.protectionContent}>
                <Ionicons name="shield-checkmark" size={24} color={TarodanColors.success} />
                <View style={styles.protectionText}>
                  <Text variant="titleSmall">Takas Koruma Programı</Text>
                  <Text variant="bodySmall" style={styles.protectionDesc}>
                    Her iki taraf da kargoyu göndermeden ödeme yapılmaz. Güvenli takas garantisi.
                  </Text>
                </View>
              </Card.Content>
            </Card>

            <View style={styles.stepActions}>
              <Button mode="outlined" onPress={() => setStep(2)} style={{ marginRight: 12 }}>
                Geri
              </Button>
              <Button
                mode="contained"
                onPress={handleSubmit}
                loading={createTradeMutation.isPending}
                disabled={createTradeMutation.isPending}
              >
                Teklifi Gönder
              </Button>
            </View>
          </View>
        )}

        <View style={{ height: 50 }} />
      </ScrollView>

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
  centeredContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  header: {
    backgroundColor: TarodanColors.primary,
    paddingTop: 50,
    paddingBottom: 16,
    paddingHorizontal: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: TarodanColors.textOnPrimary,
  },
  subtitle: {
    textAlign: 'center',
    marginVertical: 16,
    color: TarodanColors.textSecondary,
  },
  stepsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 16,
    paddingHorizontal: 20,
    backgroundColor: TarodanColors.background,
    borderBottomWidth: 1,
    borderBottomColor: TarodanColors.border,
  },
  stepWrapper: {
    alignItems: 'center',
  },
  stepCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: TarodanColors.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepCircleActive: {
    backgroundColor: TarodanColors.primary,
  },
  stepNumber: {
    fontWeight: 'bold',
    color: TarodanColors.textSecondary,
  },
  stepNumberActive: {
    color: '#fff',
  },
  stepLabel: {
    marginTop: 4,
    fontSize: 12,
    color: TarodanColors.textSecondary,
  },
  stepLabelActive: {
    color: TarodanColors.primary,
    fontWeight: '500',
  },
  content: {
    flex: 1,
    padding: 16,
  },
  sectionTitle: {
    marginBottom: 16,
    color: TarodanColors.textPrimary,
  },
  productCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: TarodanColors.background,
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  productCardSelected: {
    borderColor: TarodanColors.primary,
    backgroundColor: TarodanColors.primary + '08',
  },
  productImage: {
    width: 60,
    height: 60,
    borderRadius: 8,
    backgroundColor: TarodanColors.border,
  },
  productInfo: {
    flex: 1,
    marginLeft: 12,
  },
  productTitle: {
    color: TarodanColors.textPrimary,
  },
  productPrice: {
    color: TarodanColors.primary,
    fontWeight: '600',
    marginTop: 4,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: TarodanColors.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxSelected: {
    backgroundColor: TarodanColors.primary,
    borderColor: TarodanColors.primary,
  },
  emptyCard: {
    marginTop: 32,
    backgroundColor: TarodanColors.background,
  },
  emptyContent: {
    alignItems: 'center',
    padding: 24,
  },
  emptyText: {
    color: TarodanColors.textSecondary,
    marginVertical: 16,
    textAlign: 'center',
  },
  cashCard: {
    marginTop: 16,
    backgroundColor: TarodanColors.background,
  },
  cashTitle: {
    marginBottom: 12,
  },
  cashDirectionRow: {
    flexDirection: 'row',
    marginBottom: 12,
    gap: 8,
  },
  cashChip: {
    flex: 1,
  },
  cashInput: {
    backgroundColor: TarodanColors.background,
  },
  stepActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 24,
  },
  summaryCard: {
    marginBottom: 12,
    backgroundColor: TarodanColors.background,
  },
  summaryTitle: {
    marginBottom: 12,
    color: TarodanColors.textPrimary,
  },
  summaryItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
  },
  summaryImage: {
    width: 40,
    height: 40,
    borderRadius: 4,
    backgroundColor: TarodanColors.border,
  },
  summaryItemTitle: {
    flex: 1,
    marginLeft: 12,
    color: TarodanColors.textPrimary,
  },
  summaryItemPrice: {
    color: TarodanColors.primary,
    fontWeight: '500',
  },
  summaryDivider: {
    marginVertical: 12,
  },
  summaryTotal: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  totalPrice: {
    color: TarodanColors.primary,
    fontWeight: 'bold',
  },
  messageInput: {
    marginBottom: 16,
    backgroundColor: TarodanColors.background,
  },
  protectionCard: {
    marginBottom: 16,
    backgroundColor: TarodanColors.success + '10',
    borderWidth: 1,
    borderColor: TarodanColors.success + '40',
  },
  protectionContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  protectionText: {
    flex: 1,
    marginLeft: 12,
  },
  protectionDesc: {
    color: TarodanColors.textSecondary,
    marginTop: 4,
  },
  premiumRequired: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    backgroundColor: TarodanColors.background,
  },
  premiumTitle: {
    marginTop: 24,
    textAlign: 'center',
    color: TarodanColors.textPrimary,
  },
  premiumSubtitle: {
    marginTop: 8,
    textAlign: 'center',
    color: TarodanColors.textSecondary,
  },
  premiumFeatures: {
    marginTop: 24,
    alignSelf: 'flex-start',
    width: '100%',
  },
  premiumFeature: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 8,
  },
  premiumFeatureText: {
    marginLeft: 12,
    color: TarodanColors.textPrimary,
  },
  upgradeButton: {
    marginTop: 24,
    backgroundColor: TarodanColors.primary,
    width: '100%',
  },
});
