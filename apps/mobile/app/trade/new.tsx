import { View, ScrollView, StyleSheet, Pressable, Image } from 'react-native';
import {
  theme,
  Button,
  Card,
  Chip,
  Divider,
  Spinner,
  Snackbar,
  Text,
  Input,
  Textarea,
  ScreenHeader,
  appAlert,
} from '@tarodan/ui-native';
import { useState, useEffect } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
// listingsApi → productsApi (parite migrasyonu); userApi.getMyProducts → productsApi.getMyListings
import { productsApi as listingsApi, tradesApi, productsApi } from '../../src/services/api';
import { TradeAddressPicker } from '../../src/components/common';
import { useAuthStore } from '../../src/stores/authStore';
import { getUpgradeMessage } from '../../src/utils/membershipLimits';
import { getImageUrl } from '../../src/utils/imageUrl';
import { getProductEffectivePrice } from '../../src/utils/productPrice';
import { formatPrice } from '../../src/utils/format';
import { formatApiErrorMessage } from '../../src/utils/formatApiErrorMessage';

const { colors } = theme;

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
  const [tradeAddressId, setTradeAddressId] = useState<string | null>(null);
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
      // tradeEligible: aktif takasta olan veya müsait stoğu olmayan ürünler backend'de elenir
      const response = await productsApi.getMyListings({ status: 'active', tradeEligible: true });
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
        tradeOnly: true,
        status: 'active',
      });
      const raw = response.data?.data || response.data?.products || response.data || [];
      const list = Array.isArray(raw) ? raw : [];
      return list.filter(
        (p: Product) => p.status === 'active' && p.isTradeEnabled !== false,
      );
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
        shippingAddressId: tradeAddressId || undefined,
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

  // Check premium access
  if (!canTrade) {
    const upgradeInfo = getUpgradeMessage('tradeFeature');
    return (
      <View style={styles.container}>
        <ScreenHeader title="Takas Teklifi" onBack={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)'))} />

        <View style={styles.premiumRequired}>
          <MaterialCommunityIcons name="swap-horizontal" size={80} color={colors.primary[600]!} />
          <Text variant="h2" style={styles.premiumTitle}>{upgradeInfo.title}</Text>
          <Text variant="body" style={styles.premiumSubtitle}>{upgradeInfo.message}</Text>

          <View style={styles.premiumFeatures}>
            <View style={styles.premiumFeature}>
              <Ionicons name="checkmark-circle" size={20} color={colors.success[600]!} />
              <Text style={styles.premiumFeatureText}>Takas teklifi oluşturun</Text>
            </View>
            <View style={styles.premiumFeature}>
              <Ionicons name="checkmark-circle" size={20} color={colors.success[600]!} />
              <Text style={styles.premiumFeatureText}>Karşı teklif yapın</Text>
            </View>
            <View style={styles.premiumFeature}>
              <Ionicons name="checkmark-circle" size={20} color={colors.success[600]!} />
              <Text style={styles.premiumFeatureText}>Nakit fark ekleyin</Text>
            </View>
            <View style={styles.premiumFeature}>
              <Ionicons name="checkmark-circle" size={20} color={colors.success[600]!} />
              <Text style={styles.premiumFeatureText}>Takas koruma programı</Text>
            </View>
          </View>

          <Button variant="primary" title="Üyelik Planları" onPress={() => router.push('/membership')} style={styles.upgradeButton} />
          <Button variant="ghost" title="Geri Dön" onPress={() => router.back()} />
        </View>
      </View>
    );
  }

  if (!isAuthenticated) {
    return (
      <View style={styles.centeredContainer}>
        <Text variant="h3">Giriş Yapın</Text>
        <Text variant="body" style={styles.subtitle}>Takas teklifi vermek için giriş yapmalısınız</Text>
        <Button variant="primary" title="Giriş Yap" onPress={() => router.push('/(auth)/login')} style={{ alignSelf: 'center' }} />
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
      appAlert('Hata', 'En az bir ürün seçin veya nakit farkı girin');
      return;
    }
    if (selectedTheirItems.length === 0) {
      appAlert('Hata', 'Karşı taraftan en az bir ürün seçmelisiniz');
      return;
    }
    if (!tradeAddressId) {
      appAlert('Teslimat Adresi', 'Lütfen bir teslimat adresi seçin veya ekleyin.');
      return;
    }
    createTradeMutation.mutate();
  };

  const renderProductCard = (product: Product, isSelected: boolean, onToggle: () => void) => (
    <Pressable
      key={product.id}
      style={({ pressed }) => [
        styles.productCard,
        isSelected && styles.productCardSelected,
        pressed && { opacity: 0.85 },
      ]}
      onPress={onToggle}
    >
      <Image
        source={{ uri: getImageUrl(product.images) }}
        style={styles.productImage}
      />
      <View style={styles.productInfo}>
        <Text variant="body" numberOfLines={2} style={styles.productTitle}>
          {product.title}
        </Text>
        <Text variant="caption" style={styles.productPrice}>
          {formatPrice(getProductEffectivePrice(product))}
        </Text>
      </View>
      <View style={[styles.checkbox, isSelected && styles.checkboxSelected]}>
        {isSelected && <Ionicons name="checkmark" size={16} color={colors.white} />}
      </View>
    </Pressable>
  );

  return (
    <View style={styles.container}>
      <ScreenHeader title="Takas Teklifi" onBack={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)'))} />

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
            <Text variant="h3" style={styles.sectionTitle}>
              Takas için ürünlerinizi seçin
            </Text>

            {loadingMyProducts ? (
              <View style={{ marginTop: 32 }}>
                <Spinner size="md" />
              </View>
            ) : myProducts?.length === 0 ? (
              <Card style={styles.emptyCard}>
                <View style={styles.emptyContent}>
                  <Ionicons name="pricetag-outline" size={48} color={colors.text.subtle} />
                  <Text variant="body" style={styles.emptyText}>
                    Takas için aktif ilanınız yok
                  </Text>
                  <Button variant="outline" title="İlan Oluştur" onPress={() => router.push('/(tabs)/sell')} style={{ alignSelf: 'center' }} />
                </View>
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
              <Button variant="primary" title={`Devam (${selectedMyItems.length} seçili)`} onPress={() => setStep(2)} />
            </View>
          </View>
        )}

        {/* Step 2: Select Their Items */}
        {step === 2 && (
          <View>
            <Text variant="h3" style={styles.sectionTitle}>
              İstediğiniz ürünleri seçin
            </Text>

            {loadingTheirProducts ? (
              <View style={{ marginTop: 32 }}>
                <Spinner size="md" />
              </View>
            ) : theirProducts?.length === 0 ? (
              <Card style={styles.emptyCard}>
                <View style={styles.emptyContent}>
                  <Ionicons name="swap-horizontal" size={48} color={colors.text.subtle} />
                  <Text variant="body" style={styles.emptyText}>
                    Bu satıcının takas için ürünü yok
                  </Text>
                </View>
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
              <Text variant="label" style={styles.cashTitle}>Nakit Fark (Opsiyonel)</Text>
              <View style={styles.cashDirectionRow}>
                <Chip
                  label="Ben ödeyeceğim"
                  selected={cashDirection === 'offer'}
                  onPress={() => setCashDirection('offer')}
                  variant="primary"
                  style={styles.cashChip}
                />
                <Chip
                  label="Karşı taraf ödesin"
                  selected={cashDirection === 'request'}
                  onPress={() => setCashDirection('request')}
                  variant="primary"
                  style={styles.cashChip}
                />
              </View>
              <Input
                label="Tutar (₺)"
                value={cashAmount}
                onChangeText={(v: string) => setCashAmount(v.replace(/[^\d.,]/g, ''))}
                keyboardType="numeric"
                containerStyle={styles.cashInput}
              />
            </Card>

            <View style={styles.stepActions}>
              <Button variant="outline" title="Geri" onPress={() => setStep(1)} style={{ marginRight: 12 }} />
              <Button
                variant="primary"
                title="Devam"
                disabled={selectedTheirItems.length === 0}
                onPress={() => setStep(3)}
              />
            </View>
          </View>
        )}

        {/* Step 3: Review & Submit */}
        {step === 3 && (
          <View>
            <Text variant="h3" style={styles.sectionTitle}>
              Takas Özeti
            </Text>

            {/* My Items Summary */}
            <Card style={styles.summaryCard}>
              <Text variant="label" style={styles.summaryTitle}>
                Teklif Ettiğiniz Ürünler
              </Text>
              {selectedMyItems.map((product) => (
                <View key={product.id} style={styles.summaryItem}>
                  <Image
                    source={{ uri: getImageUrl(product.images) }}
                    style={styles.summaryImage}
                  />
                  <Text variant="caption" style={styles.summaryItemTitle} numberOfLines={1}>
                    {product.title}
                  </Text>
                  <Text variant="caption" style={styles.summaryItemPrice}>
                    {formatPrice(getProductEffectivePrice(product))}
                  </Text>
                </View>
              ))}
              <Divider style={styles.summaryDivider} />
              <View style={styles.summaryTotal}>
                <Text variant="body">Toplam Değer:</Text>
                <Text variant="label" style={styles.totalPrice}>
                  {formatPrice(myTotal)}
                </Text>
              </View>
            </Card>

            {/* Their Items Summary */}
            <Card style={styles.summaryCard}>
              <Text variant="label" style={styles.summaryTitle}>
                İstediğiniz Ürünler
              </Text>
              {selectedTheirItems.map((product) => (
                <View key={product.id} style={styles.summaryItem}>
                  <Image
                    source={{ uri: getImageUrl(product.images) }}
                    style={styles.summaryImage}
                  />
                  <Text variant="caption" style={styles.summaryItemTitle} numberOfLines={1}>
                    {product.title}
                  </Text>
                  <Text variant="caption" style={styles.summaryItemPrice}>
                    {formatPrice(getProductEffectivePrice(product))}
                  </Text>
                </View>
              ))}
              <Divider style={styles.summaryDivider} />
              <View style={styles.summaryTotal}>
                <Text variant="body">Toplam Değer:</Text>
                <Text variant="label" style={styles.totalPrice}>
                  {formatPrice(theirTotal)}
                </Text>
              </View>
            </Card>

            {/* Cash Summary */}
            {cashValue > 0 && (
              <Card style={styles.summaryCard}>
                <Text variant="label" style={styles.summaryTitle}>Nakit Fark</Text>
                <Text variant="body">
                  {cashDirection === 'offer' ? 'Siz ödeyeceksiniz: ' : 'Karşı taraf ödeyecek: '}
                  <Text style={{ color: colors.primary[600]!, fontWeight: 'bold' }}>
                    {formatPrice(cashValue)}
                  </Text>
                </Text>
              </Card>
            )}

            {/* Message */}
            <Textarea
              label="Mesajınız (Opsiyonel)"
              value={message}
              onChangeText={(v: string) => setMessage(v.slice(0, 500))}
              rows={3}
              containerStyle={styles.messageInput}
              placeholder="Teklif hakkında bir not ekleyin..."
            />
            <Text variant="caption" tone="subtle" style={styles.charCount}>
              {message.length}/500
            </Text>

            {/* Teslimat adresi (takas kabul edilince kargo bu adrese gelir) */}
            <View style={styles.messageInput}>
              <TradeAddressPicker label="Teslimat Adresiniz" onChange={setTradeAddressId} />
            </View>

            {/* Trade Protection Info */}
            <Card style={styles.protectionCard}>
              <View style={styles.protectionContent}>
                <Ionicons name="shield-checkmark" size={24} color={colors.success[600]!} />
                <View style={styles.protectionText}>
                  <Text variant="label">Takas Koruma Programı</Text>
                  <Text variant="caption" style={styles.protectionDesc}>
                    Her iki taraf da kargoyu göndermeden ödeme yapılmaz. Güvenli takas garantisi.
                  </Text>
                </View>
              </View>
            </Card>

            <View style={styles.stepActions}>
              <Button variant="outline" title="Geri" onPress={() => setStep(2)} style={{ marginRight: 12 }} />
              <Button
                variant="primary"
                title="Teklifi Gönder"
                onPress={handleSubmit}
                isLoading={createTradeMutation.isPending}
                disabled={createTradeMutation.isPending}
              />
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
    backgroundColor: colors.surface.alt,
  },
  centeredContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  subtitle: {
    textAlign: 'center',
    marginVertical: 16,
    color: colors.text.muted,
  },
  stepsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 16,
    paddingHorizontal: 20,
    backgroundColor: colors.surface.DEFAULT,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.DEFAULT,
  },
  stepWrapper: {
    alignItems: 'center',
  },
  stepCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.border.DEFAULT,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepCircleActive: {
    backgroundColor: colors.primary[600]!,
  },
  stepNumber: {
    fontWeight: 'bold',
    color: colors.text.muted,
  },
  stepNumberActive: {
    color: colors.white,
  },
  stepLabel: {
    marginTop: 4,
    fontSize: 12,
    color: colors.text.muted,
  },
  stepLabelActive: {
    color: colors.primary[600]!,
    fontWeight: '500',
  },
  content: {
    flex: 1,
    padding: 16,
  },
  sectionTitle: {
    marginBottom: 16,
    color: colors.text.heading,
  },
  productCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface.DEFAULT,
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  productCardSelected: {
    borderColor: colors.primary[600]!,
    backgroundColor: colors.primary[50]!,
  },
  productImage: {
    width: 60,
    height: 60,
    borderRadius: 8,
    backgroundColor: colors.border.DEFAULT,
  },
  productInfo: {
    flex: 1,
    marginLeft: 12,
  },
  productTitle: {
    color: colors.text.heading,
  },
  productPrice: {
    color: colors.primary[600]!,
    fontWeight: '600',
    marginTop: 4,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.border.DEFAULT,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxSelected: {
    backgroundColor: colors.primary[600]!,
    borderColor: colors.primary[600]!,
  },
  emptyCard: {
    marginTop: 32,
    backgroundColor: colors.surface.DEFAULT,
  },
  emptyContent: {
    alignItems: 'center',
    padding: 24,
  },
  emptyText: {
    color: colors.text.muted,
    marginVertical: 16,
    textAlign: 'center',
  },
  cashCard: {
    marginTop: 16,
    backgroundColor: colors.surface.DEFAULT,
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
    backgroundColor: colors.surface.DEFAULT,
  },
  stepActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 24,
  },
  summaryCard: {
    marginBottom: 12,
    backgroundColor: colors.surface.DEFAULT,
  },
  summaryTitle: {
    marginBottom: 12,
    color: colors.text.heading,
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
    backgroundColor: colors.border.DEFAULT,
  },
  summaryItemTitle: {
    flex: 1,
    marginLeft: 12,
    color: colors.text.heading,
  },
  summaryItemPrice: {
    color: colors.primary[600]!,
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
    color: colors.primary[600]!,
    fontWeight: 'bold',
  },
  messageInput: {
    marginBottom: 4,
    backgroundColor: colors.surface.DEFAULT,
  },
  charCount: {
    textAlign: 'right',
    marginBottom: 16,
  },
  protectionCard: {
    marginBottom: 16,
    backgroundColor: colors.success[50]!,
    borderWidth: 1,
    borderColor: colors.success[200]!,
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
    color: colors.text.muted,
    marginTop: 4,
  },
  premiumRequired: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    backgroundColor: colors.surface.DEFAULT,
  },
  premiumTitle: {
    marginTop: 24,
    textAlign: 'center',
    color: colors.text.heading,
  },
  premiumSubtitle: {
    marginTop: 8,
    textAlign: 'center',
    color: colors.text.muted,
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
    color: colors.text.heading,
  },
  upgradeButton: {
    marginTop: 24,
    width: '100%',
  },
});
