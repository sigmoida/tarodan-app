import { useState, useEffect, useCallback } from 'react';
import { View, ScrollView, StyleSheet, TouchableOpacity, Image, KeyboardAvoidingView, Platform, Alert, ActivityIndicator, TextInput, Linking } from 'react-native';
import { Text } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { TarodanColors } from '../../src/theme/colors';
import { useCartStore } from '../../src/stores/cartStore';
import { useAuthStore } from '../../src/stores/authStore';
import { api, ordersApi, addressesApi, paymentsApi, productsApi } from '../../src/services/api';
import { transformImageUrl } from '../../src/utils/imageUrl';
import { safeString } from '../../src/utils/safeString';
import { formatApiErrorMessage } from '../../src/utils/formatApiErrorMessage';
import { captureException } from '../../src/services/sentry';
import { useTranslation } from '../../src/i18n';

interface ShippingAddress {
  fullName: string;
  phone: string;
  city: string;
  district: string;
  address: string;
  zipCode?: string;
}

interface SavedAddress {
  id: string;
  title?: string;
  fullName: string;
  phone: string;
  city: string;
  district: string;
  address: string;
  zipCode?: string;
  isDefault?: boolean;
}

interface QuoteData {
  subtotal: number;
  shipping: number;
  buyerFee: number;
  total: number;
}

interface DirectProduct {
  id: string;
  title: string;
  price: number;
  images?: any[];
  imageUrl?: string;
  brand?: string;
  scale?: string;
  seller?: { id: string; displayName: string };
}

const TURKISH_CITIES = ['Adana', 'Adıyaman', 'Afyonkarahisar', 'Ağrı', 'Aksaray', 'Amasya', 'Ankara', 'Antalya', 'Artvin', 'Aydın', 'Balıkesir', 'Bartın', 'Batman', 'Bayburt', 'Bilecik', 'Bingöl', 'Bitlis', 'Bolu', 'Burdur', 'Bursa', 'Çanakkale', 'Çankırı', 'Çorum', 'Denizli', 'Diyarbakır', 'Düzce', 'Edirne', 'Elazığ', 'Erzincan', 'Erzurum', 'Eskişehir', 'Gaziantep', 'Giresun', 'Gümüşhane', 'Hakkari', 'Hatay', 'Iğdır', 'Isparta', 'İstanbul', 'İzmir', 'Kahramanmaraş', 'Karabük', 'Karaman', 'Kars', 'Kastamonu', 'Kayseri', 'Kırıkkale', 'Kırklareli', 'Kırşehir', 'Kilis', 'Kocaeli', 'Konya', 'Kütahya', 'Malatya', 'Manisa', 'Mardin', 'Mersin', 'Muğla', 'Muş', 'Nevşehir', 'Niğde', 'Ordu', 'Osmaniye', 'Rize', 'Sakarya', 'Samsun', 'Şanlıurfa', 'Siirt', 'Sinop', 'Şırnak', 'Sivas', 'Tekirdağ', 'Tokat', 'Trabzon', 'Tunceli', 'Uşak', 'Van', 'Yalova', 'Yozgat', 'Zonguldak'];

export default function CheckoutScreen() {
  const { t } = useTranslation();
  const params = useLocalSearchParams<{ productId?: string }>();
  const { items, getSubtotal, clearCart } = useCartStore();
  const { isAuthenticated, user } = useAuthStore();

  const isDirectBuy = !!params.productId;

  // Step: 1=Address, 2=Payment, 3=Confirmation
  const [step, setStep] = useState(1);

  // Direct buy product
  const [directProduct, setDirectProduct] = useState<DirectProduct | null>(null);
  const [productLoading, setProductLoading] = useState(false);

  // Saved addresses (authenticated)
  const [savedAddresses, setSavedAddresses] = useState<SavedAddress[]>([]);
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(null);
  const [addressesLoading, setAddressesLoading] = useState(false);
  const [showNewAddressForm, setShowNewAddressForm] = useState(false);

  // Guest info
  const [guestName, setGuestName] = useState('');
  const [guestEmail, setGuestEmail] = useState('');
  const [guestPhone, setGuestPhone] = useState('');
  const [guestEmailVerificationCode, setGuestEmailVerificationCode] = useState('');
  const [guestOtpSending, setGuestOtpSending] = useState(false);

  // New address form (for both guest and authenticated "add new")
  const [shippingAddress, setShippingAddress] = useState<ShippingAddress>({
    fullName: '',
    phone: '',
    city: '',
    district: '',
    address: '',
    zipCode: '',
  });
  const [citySearch, setCitySearch] = useState('');
  const [showCityPicker, setShowCityPicker] = useState(false);

  // Carrier & shipping
  // Sürat Kargo only — web parity (apps/web/src/app/checkout/page.tsx:160 also pins to 'surat').
  const [selectedCarrier] = useState<'surat'>('surat');
  const [shippingCost, setShippingCost] = useState(0);
  const [shippingLoading, setShippingLoading] = useState(false);

  // Payment
  const [cardNumber, setCardNumber] = useState('');
  const [cardHolder, setCardHolder] = useState('');
  const [cardExpiry, setCardExpiry] = useState('');
  const [cardCvv, setCardCvv] = useState('');

  // Server-side bypass mode hint — hides the card form and skips the
  // "Kart numarasını girin" alert when PAYMENT_BYPASS=true on the API.
  const [bypassEnabled, setBypassEnabled] = useState(false);
  useEffect(() => {
    paymentsApi
      .getConfig()
      .then((res) => setBypassEnabled(res.data?.bypassEnabled === true))
      .catch(() => setBypassEnabled(false));
  }, []);

  // Quote
  const [quote, setQuote] = useState<QuoteData | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);

  // UI
  const [loading, setLoading] = useState(false);

  // Derived
  const checkoutItems = isDirectBuy && directProduct
    ? [{ productId: directProduct.id, title: directProduct.title, price: directProduct.price, quantity: 1, imageUrl: directProduct.images?.[0] || directProduct.imageUrl, brand: directProduct.brand, scale: directProduct.scale }]
    : items.map(i => ({ productId: i.productId, title: i.title, price: i.price, quantity: i.quantity, imageUrl: i.imageUrl, brand: i.brand, scale: i.scale }));

  const subtotal = quote?.subtotal ?? (isDirectBuy && directProduct ? directProduct.price : getSubtotal());
  const buyerFee = quote?.buyerFee ?? 0;
  const totalShipping = quote?.shipping ?? shippingCost;
  const total = quote?.total ?? (subtotal + totalShipping + buyerFee);

  // ─── Effects ────────────────────────────────────────────────────────

  useEffect(() => {
    if (isDirectBuy && params.productId) {
      fetchDirectProduct(params.productId);
    }
  }, [params.productId]);

  useEffect(() => {
    if (isAuthenticated) {
      fetchSavedAddresses();
    }
  }, [isAuthenticated]);

  const fetchQuote = useCallback(async () => {
    const productIds =
      isDirectBuy && params.productId
        ? [{ productId: String(params.productId), quantity: 1 }]
        : items.map((i) => ({ productId: i.productId, quantity: i.quantity }));

    if (productIds.length === 0) return;

    setQuoteLoading(true);
    try {
      const res = await ordersApi.getQuote({ items: productIds });
      const q = res.data?.data || res.data;
      const pricing = q?.pricing;
      if (pricing) {
        setQuote({
          subtotal: pricing.subtotal ?? pricing.itemsSubtotal ?? 0,
          shipping: pricing.shippingAmount ?? pricing.shipping ?? 0,
          buyerFee: pricing.buyerFeeAmount ?? pricing.buyerFee ?? 0,
          total: pricing.totalAmount ?? pricing.total ?? 0,
        });
      } else if (q) {
        setQuote({
          subtotal: q.itemsSubtotal ?? q.subtotal ?? 0,
          shipping: q.shippingAmount ?? q.shipping ?? 0,
          buyerFee: q.buyerFeeAmount ?? q.buyerFee ?? 0,
          total: q.totalAmount ?? q.total ?? 0,
        });
      }
    } catch {
      // quote is optional, fall back to local calc
    } finally {
      setQuoteLoading(false);
    }
  }, [isDirectBuy, params.productId, items]);

  useEffect(() => {
    if (checkoutItems.length > 0) {
      fetchQuote();
    }
  }, [checkoutItems.length, directProduct?.id, fetchQuote]);

  useEffect(() => {
    const city = getActiveCity();
    if (city) {
      calculateShipping(city);
    }
  }, [selectedAddressId, shippingAddress.city, selectedCarrier, savedAddresses]);

  // ─── Data Fetchers ──────────────────────────────────────────────────

  const fetchDirectProduct = async (productId: string) => {
    setProductLoading(true);
    try {
      const res = await productsApi.getOne(productId);
      const p = res.data?.data || res.data;
      setDirectProduct(p);
    } catch (err: any) {
      Alert.alert('Hata', 'Ürün bulunamadı');
      router.back();
    } finally {
      setProductLoading(false);
    }
  };

  const fetchSavedAddresses = async () => {
    setAddressesLoading(true);
    try {
      const res = await addressesApi.getAll();
      const list: SavedAddress[] = res.data?.data || res.data || [];
      setSavedAddresses(list);
      const defaultAddr = list.find(a => a.isDefault) || list[0];
      if (defaultAddr) {
        setSelectedAddressId(defaultAddr.id);
      }
    } catch {
      // silent
    } finally {
      setAddressesLoading(false);
    }
  };

  const getActiveCity = (): string | null => {
    if (isAuthenticated && selectedAddressId && !showNewAddressForm) {
      const addr = savedAddresses.find(a => a.id === selectedAddressId);
      return addr?.city || null;
    }
    return shippingAddress.city || null;
  };

  const calculateShipping = async (city: string) => {
    setShippingLoading(true);
    try {
      const response = await api.get('/shipping/rates', {
        params: { city, carrier: selectedCarrier, weight: 0.5 },
      }).catch(() => null);

      if (response?.data?.rate) {
        setShippingCost(response.data.rate);
      } else {
        const isIstanbul = city.toLowerCase().includes('istanbul');
        const baseRate = isIstanbul ? 34.90 : 49.90;
        const carrierExtra = 0;
        setShippingCost(baseRate + carrierExtra);
      }
    } catch {
      setShippingCost(49.90);
    } finally {
      setShippingLoading(false);
    }
  };

  // ─── Validation ─────────────────────────────────────────────────────

  const validateStep1 = (): boolean => {
    if (isAuthenticated) {
      if (showNewAddressForm) {
        return validateAddressForm();
      }
      if (!selectedAddressId) {
        Alert.alert('Uyarı', 'Lütfen bir teslimat adresi seçin');
        return false;
      }
      return true;
    }

    // Guest validation
    if (!guestName.trim()) {
      Alert.alert('Uyarı', 'Lütfen adınızı girin');
      return false;
    }
    if (!guestEmail.trim() || !guestEmail.includes('@')) {
      Alert.alert('Uyarı', 'Geçerli bir e-posta adresi girin');
      return false;
    }
    if (!guestPhone.trim() || guestPhone.length < 10) {
      Alert.alert('Uyarı', 'Geçerli bir telefon numarası girin');
      return false;
    }
    if (!/^\d{6}$/.test(guestEmailVerificationCode.replace(/\D/g, ''))) {
      Alert.alert('Uyarı', 'E-posta doğrulama kodunu girin (6 hane)');
      return false;
    }
    return validateAddressForm();
  };

  const validateAddressForm = (): boolean => {
    if (!shippingAddress.fullName.trim()) {
      Alert.alert('Uyarı', 'Teslimat adresi için ad soyad girin');
      return false;
    }
    if (!shippingAddress.phone.trim() || shippingAddress.phone.length < 10) {
      Alert.alert('Uyarı', 'Teslimat adresi için telefon numarası girin');
      return false;
    }
    if (!shippingAddress.city.trim()) {
      Alert.alert('Uyarı', 'Şehir seçin');
      return false;
    }
    if (!shippingAddress.district.trim()) {
      Alert.alert('Uyarı', 'İlçe girin');
      return false;
    }
    if (!shippingAddress.address.trim()) {
      Alert.alert('Uyarı', 'Açık adres girin');
      return false;
    }
    return true;
  };

  const validateStep2 = (): boolean => {
    // Bypass mode: card form is hidden, no validation needed.
    if (bypassEnabled) return true;
    if (!cardNumber.trim()) {
      Alert.alert('Uyarı', 'Kart numarasını girin');
      return false;
    }
    return true;
  };

  // ─── Actions ────────────────────────────────────────────────────────

  const handleNextStep = () => {
    if (step === 1 && validateStep1()) {
      setStep(2);
    } else if (step === 2 && validateStep2()) {
      setStep(3);
    }
  };

  const handleSaveNewAddress = async () => {
    if (!validateAddressForm()) return;
    try {
      const res = await addressesApi.create({
        fullName: shippingAddress.fullName.trim(),
        phone: shippingAddress.phone.trim(),
        city: shippingAddress.city.trim(),
        district: shippingAddress.district.trim(),
        address: shippingAddress.address.trim(),
        zipCode: shippingAddress.zipCode?.trim() || undefined,
      });
      const newAddr = res.data?.data || res.data;
      if (newAddr?.id) {
        setSavedAddresses(prev => [...prev, newAddr]);
        setSelectedAddressId(newAddr.id);
        setShowNewAddressForm(false);
        setShippingAddress({ fullName: '', phone: '', city: '', district: '', address: '', zipCode: '' });
      }
    } catch (err: unknown) {
      Alert.alert('Hata', formatApiErrorMessage(err, 'Adres kaydedilemedi'));
    }
  };

  const resolveOrderIdFromResponse = (orderRes: { data?: Record<string, unknown> }): string | null => {
    const root = orderRes.data;
    const d = (root?.data ?? root) as Record<string, unknown> | undefined;
    if (!d || typeof d !== 'object') return null;
    const orderObj = d.order as { id?: string } | undefined;
    const id = d.orderId ?? d.id ?? orderObj?.id;
    return typeof id === 'string' ? id : null;
  };

  /** Web `checkout/page.tsx` ile aynı: her sepet satırı için sipariş oluştur; ödeme yanıtında çıkılır (çoğu ortamda tek ödeme oturumu). */
  const handleCheckout = async () => {
    if (checkoutItems.length === 0) {
      Alert.alert('Hata', 'Sepetiniz boş');
      return;
    }

    setLoading(true);
    try {
      for (const line of checkoutItems) {
        const productId = line.productId;
        let orderId: string | null = null;

        if (isAuthenticated) {
          const orderPayload: Record<string, unknown> = { productId };
          if (selectedAddressId && !showNewAddressForm) {
            orderPayload.shippingAddressId = selectedAddressId;
          } else {
            orderPayload.shippingAddress = {
              fullName: shippingAddress.fullName.trim(),
              phone: shippingAddress.phone.trim(),
              city: shippingAddress.city.trim(),
              district: shippingAddress.district.trim(),
              address: shippingAddress.address.trim(),
              zipCode: shippingAddress.zipCode?.trim() || undefined,
            };
          }
          const orderRes = await ordersApi.directBuy(orderPayload as Parameters<typeof ordersApi.directBuy>[0]);
          orderId = resolveOrderIdFromResponse(orderRes);
        } else {
          const orderPayload = {
            productId,
            email: guestEmail.trim().toLowerCase(),
            phone: guestPhone.trim(),
            guestName: guestName.trim(),
            emailVerificationCode: guestEmailVerificationCode.replace(/\D/g, '').slice(0, 6),
            shippingAddress: {
              fullName: shippingAddress.fullName.trim(),
              phone: (shippingAddress.phone?.trim() || guestPhone.trim()),
              city: shippingAddress.city.trim(),
              district: shippingAddress.district.trim(),
              address: shippingAddress.address.trim(),
              zipCode: shippingAddress.zipCode?.trim() || undefined,
            },
          };
          const orderRes = await ordersApi.createGuest(orderPayload);
          orderId = resolveOrderIdFromResponse(orderRes);
        }

        if (!orderId) {
          Alert.alert(
            'Hata',
            'Sipariş oluşturuldu ancak ödeme başlatılamadı. Siparişlerim sayfasından ödemeyi tamamlayabilirsiniz.',
          );
          router.replace('/orders');
          return;
        }

        const payRes = await paymentsApi.initiate(orderId, 'paytr');
        const payData = (payRes.data as Record<string, unknown> | undefined)?.data ?? payRes.data;
        const paymentId =
          (payData as Record<string, unknown> | undefined)?.paymentId ??
          (payData as Record<string, unknown> | undefined)?.id;
        const paymentUrl = (payData as Record<string, unknown> | undefined)?.paymentUrl as string | undefined;
        const useBypass = (payData as Record<string, unknown> | undefined)?.useBypass === true;

        if (paymentUrl && paymentUrl.startsWith('http')) {
          if (!isDirectBuy) clearCart();
          await Linking.openURL(paymentUrl);
          return;
        }

        if (!isDirectBuy) clearCart();
        if (paymentId) {
          const params = new URLSearchParams();
          if (!isAuthenticated) params.set('guest', 'true');
          if (useBypass) params.set('useBypass', 'true');
          const qs = params.toString();
          router.replace(`/payment/${paymentId}${qs ? `?${qs}` : ''}` as any);
          return;
        }

        Alert.alert('Sipariş Oluşturuldu', 'Siparişiniz başarıyla alındı.', [
          { text: 'Tamam', onPress: () => router.replace('/') },
        ]);
        return;
      }
    } catch (error: unknown) {
      captureException(error, {
        level: 'error',
        tags: { flow: 'checkout', step: 'submit-order' },
        extra: { isAuthenticated, isDirectBuy, itemCount: checkoutItems.length },
      });
      Alert.alert('Hata', formatApiErrorMessage(error, 'Sipariş oluşturulamadı'));
    } finally {
      setLoading(false);
    }
  };

  // ─── Helpers ────────────────────────────────────────────────────────

  const getShippingRate = (carrier: 'surat'): number => {
    const city = getActiveCity();
    const isIstanbul = city?.toLowerCase().includes('istanbul');
    const baseRate = isIstanbul ? 34.90 : 49.90;
    // Surat-only: no per-carrier surcharge.
    return baseRate;
  };

  const getSelectedAddressSummary = (): string => {
    if (isAuthenticated && selectedAddressId && !showNewAddressForm) {
      const addr = savedAddresses.find(a => a.id === selectedAddressId);
      if (addr) return `${addr.fullName}, ${addr.address}, ${addr.district}/${addr.city}`;
    }
    if (shippingAddress.address) {
      return `${shippingAddress.fullName}, ${shippingAddress.address}, ${shippingAddress.district}/${shippingAddress.city}`;
    }
    return '';
  };

  const filteredCities = citySearch
    ? TURKISH_CITIES.filter(c => c.toLowerCase().includes(citySearch.toLowerCase()))
    : TURKISH_CITIES;

  const formatPrice = (price: number): string => {
    return (price ?? 0).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  // ─── Loading States ─────────────────────────────────────────────────

  if (productLoading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={TarodanColors.primary} />
        <Text style={styles.loadingText}>Ürün yükleniyor...</Text>
      </View>
    );
  }

  if (!isDirectBuy && items.length === 0) {
    return (
      <View style={styles.centerContainer}>
        <Ionicons name="cart-outline" size={80} color={TarodanColors.textSecondary} />
        <Text style={styles.emptyTitle}>Sepetiniz Boş</Text>
        <Text style={styles.emptySubtitle}>Ödeme yapabilmek için sepetinize ürün ekleyin</Text>
        <TouchableOpacity style={styles.primaryButton} onPress={() => router.replace('/')}>
          <Text style={styles.primaryButtonText}>Alışverişe Başla</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (isDirectBuy && !directProduct) {
    return (
      <View style={styles.centerContainer}>
        <Ionicons name="alert-circle-outline" size={80} color={TarodanColors.error} />
        <Text style={styles.emptyTitle}>Ürün Bulunamadı</Text>
        <TouchableOpacity style={styles.primaryButton} onPress={() => router.back()}>
          <Text style={styles.primaryButtonText}>Geri Dön</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ─── Render Helpers ─────────────────────────────────────────────────

  const renderSavedAddresses = () => (
    <View>
      {addressesLoading ? (
        <ActivityIndicator size="small" color={TarodanColors.primary} style={{ marginVertical: 16 }} />
      ) : (
        <>
          {savedAddresses.map((addr) => (
            <TouchableOpacity
              key={addr.id}
              style={[styles.addressCard, selectedAddressId === addr.id && !showNewAddressForm && styles.addressCardSelected]}
              onPress={() => { setSelectedAddressId(addr.id); setShowNewAddressForm(false); }}
            >
              <View style={[styles.radioOuter, selectedAddressId === addr.id && !showNewAddressForm && styles.radioOuterActive]}>
                {selectedAddressId === addr.id && !showNewAddressForm && <View style={styles.radioInner} />}
              </View>
              <View style={styles.addressCardContent}>
                <View style={styles.addressCardHeader}>
                  <Text style={styles.addressCardName}>{addr.fullName}</Text>
                  {addr.isDefault && (
                    <View style={styles.defaultBadge}>
                      <Text style={styles.defaultBadgeText}>Varsayılan</Text>
                    </View>
                  )}
                </View>
                {addr.title ? <Text style={styles.addressCardTitle}>{addr.title}</Text> : null}
                <Text style={styles.addressCardDetail} numberOfLines={2}>{addr.address}</Text>
                <Text style={styles.addressCardCity}>{addr.district}/{addr.city}</Text>
                <Text style={styles.addressCardPhone}>{addr.phone}</Text>
              </View>
            </TouchableOpacity>
          ))}

          <TouchableOpacity
            style={[styles.addAddressButton, showNewAddressForm && styles.addAddressButtonActive]}
            onPress={() => setShowNewAddressForm(true)}
          >
            <Ionicons name="add-circle-outline" size={22} color={showNewAddressForm ? TarodanColors.primary : TarodanColors.textSecondary} />
            <Text style={[styles.addAddressText, showNewAddressForm && { color: TarodanColors.primary, fontWeight: '600' }]}>
              {t('mobile.addNewAddress')}
            </Text>
          </TouchableOpacity>

          {showNewAddressForm && (
            <View style={styles.newAddressForm}>
              {renderAddressForm()}
              <TouchableOpacity style={styles.saveAddressButton} onPress={handleSaveNewAddress}>
                <Ionicons name="checkmark-circle" size={20} color="#fff" />
                <Text style={styles.saveAddressButtonText}>Adresi Kaydet</Text>
              </TouchableOpacity>
            </View>
          )}
        </>
      )}
    </View>
  );

  const renderAddressForm = () => (
    <View>
      <Text style={styles.inputLabel}>Ad Soyad *</Text>
      <TextInput
        style={styles.textInput}
        value={shippingAddress.fullName}
        onChangeText={(t) => setShippingAddress(s => ({ ...s, fullName: t }))}
        placeholder="Ad Soyad"
        placeholderTextColor={TarodanColors.textTertiary}
      />

      <Text style={styles.inputLabel}>Telefon *</Text>
      <TextInput
        style={styles.textInput}
        value={shippingAddress.phone}
        onChangeText={(t) => setShippingAddress(s => ({ ...s, phone: t }))}
        placeholder="+90 5XX XXX XX XX"
        placeholderTextColor={TarodanColors.textTertiary}
        keyboardType="phone-pad"
      />

      <Text style={styles.inputLabel}>Şehir *</Text>
      <TouchableOpacity
        style={styles.cityPickerButton}
        onPress={() => setShowCityPicker(!showCityPicker)}
      >
        <Text style={shippingAddress.city ? styles.cityPickerText : styles.cityPickerPlaceholder}>
          {shippingAddress.city || 'Şehir seçin'}
        </Text>
        <Ionicons name={showCityPicker ? 'chevron-up' : 'chevron-down'} size={20} color={TarodanColors.textSecondary} />
      </TouchableOpacity>

      {showCityPicker && (
        <View style={styles.cityDropdown}>
          <TextInput
            style={styles.citySearchInput}
            value={citySearch}
            onChangeText={setCitySearch}
            placeholder="Şehir ara..."
            placeholderTextColor={TarodanColors.textTertiary}
          />
          <ScrollView
            style={styles.cityList}
            nestedScrollEnabled
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator
          >
            {filteredCities.map((city) => (
              <TouchableOpacity
                key={city}
                style={[styles.cityItem, shippingAddress.city === city && styles.cityItemActive]}
                onPress={() => {
                  setShippingAddress((s) => ({ ...s, city }));
                  setShowCityPicker(false);
                  setCitySearch('');
                }}
              >
                <Text style={[styles.cityItemText, shippingAddress.city === city && styles.cityItemTextActive]}>
                  {city}
                </Text>
                {shippingAddress.city === city && (
                  <Ionicons name="checkmark" size={18} color={TarodanColors.primary} />
                )}
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      <Text style={styles.inputLabel}>İlçe *</Text>
      <TextInput
        style={styles.textInput}
        value={shippingAddress.district}
        onChangeText={(t) => setShippingAddress(s => ({ ...s, district: t }))}
        placeholder="İlçe"
        placeholderTextColor={TarodanColors.textTertiary}
      />

      <Text style={styles.inputLabel}>Açık Adres *</Text>
      <TextInput
        style={[styles.textInput, styles.textArea]}
        value={shippingAddress.address}
        onChangeText={(t) => setShippingAddress(s => ({ ...s, address: t }))}
        placeholder="Mahalle, cadde, sokak, bina no, daire no"
        placeholderTextColor={TarodanColors.textTertiary}
        multiline
        numberOfLines={3}
        textAlignVertical="top"
      />

      <Text style={styles.inputLabel}>Posta Kodu</Text>
      <TextInput
        style={styles.textInput}
        value={shippingAddress.zipCode}
        onChangeText={(t) => setShippingAddress(s => ({ ...s, zipCode: t }))}
        placeholder="34000"
        placeholderTextColor={TarodanColors.textTertiary}
        keyboardType="number-pad"
      />
    </View>
  );

  const renderGuestForm = () => (
    <View>
      <View style={styles.guestNotice}>
        <Ionicons name="information-circle-outline" size={20} color={TarodanColors.warning} />
        <Text style={styles.guestNoticeText}>
          Üye olmadan alışveriş yapıyorsunuz. Siparişinizi takip etmek için e-posta adresinizi girin.
        </Text>
      </View>

      <Text style={styles.inputLabel}>Ad Soyad *</Text>
      <TextInput
        style={styles.textInput}
        value={guestName}
        onChangeText={setGuestName}
        placeholder="Ad Soyad"
        placeholderTextColor={TarodanColors.textTertiary}
      />

      <Text style={styles.inputLabel}>E-posta *</Text>
      <TextInput
        style={styles.textInput}
        value={guestEmail}
        onChangeText={setGuestEmail}
        placeholder="ornek@email.com"
        placeholderTextColor={TarodanColors.textTertiary}
        keyboardType="email-address"
        autoCapitalize="none"
      />

      <Text style={styles.inputLabel}>E-posta doğrulama *</Text>
      <TouchableOpacity
        style={[styles.secondaryButton, guestOtpSending && { opacity: 0.6 }]}
        disabled={guestOtpSending || !guestEmail.trim()}
        onPress={async () => {
          const em = guestEmail.trim().toLowerCase();
          if (!em.includes('@')) {
            Alert.alert('Uyarı', 'Geçerli bir e-posta girin');
            return;
          }
          setGuestOtpSending(true);
          try {
            await ordersApi.sendGuestVerificationCode({
              email: em,
              expectedCheckoutCount: Math.max(1, checkoutItems.length),
            });
            Alert.alert('Bilgi', 'Doğrulama kodu e-postanıza gönderildi.');
          } catch (err: unknown) {
            Alert.alert('Hata', formatApiErrorMessage(err, 'Kod gönderilemedi'));
          } finally {
            setGuestOtpSending(false);
          }
        }}
      >
        <Text style={styles.secondaryButtonText}>
          {guestOtpSending ? 'Gönderiliyor…' : 'Kod gönder'}
        </Text>
      </TouchableOpacity>
      <TextInput
        style={[styles.textInput, { marginTop: 8, letterSpacing: 4 }]}
        value={guestEmailVerificationCode}
        onChangeText={(t) => setGuestEmailVerificationCode(t.replace(/\D/g, '').slice(0, 6))}
        placeholder="6 haneli kod"
        placeholderTextColor={TarodanColors.textTertiary}
        keyboardType="number-pad"
        maxLength={6}
      />

      <Text style={styles.inputLabel}>Telefon *</Text>
      <TextInput
        style={styles.textInput}
        value={guestPhone}
        onChangeText={setGuestPhone}
        placeholder="+90 5XX XXX XX XX"
        placeholderTextColor={TarodanColors.textTertiary}
        keyboardType="phone-pad"
      />

      <View style={styles.divider} />

      <View style={styles.sectionHeader}>
        <Ionicons name="location-outline" size={24} color={TarodanColors.primary} />
        <Text style={styles.sectionTitle}>{t('mobile.deliveryAddress')}</Text>
      </View>

      {renderAddressForm()}

      <TouchableOpacity style={styles.loginLink} onPress={() => router.push('/(auth)/login')}>
        <Ionicons name="log-in-outline" size={18} color={TarodanColors.primary} />
        <Text style={styles.loginLinkText}>Üye misiniz? Giriş yapın</Text>
      </TouchableOpacity>
    </View>
  );

  const renderOrderItems = () => (
    <View>
      {checkoutItems.map((item, index) => (
        <View key={`${item.productId}-${index}`} style={styles.orderItem}>
          <Image source={{ uri: transformImageUrl(item.imageUrl) }} style={styles.orderItemImage} />
          <View style={styles.orderItemInfo}>
            <Text style={styles.orderItemTitle} numberOfLines={2}>{item.title}</Text>
            {(item.brand || item.scale) && (
              <Text style={styles.orderItemMeta}>
                {[safeString(item.brand), safeString(item.scale), `x${item.quantity}`].filter(Boolean).join(' · ')}
              </Text>
            )}
          </View>
          <Text style={styles.orderItemPrice}>₺{formatPrice(item.price * item.quantity)}</Text>
        </View>
      ))}
    </View>
  );

  // ─── Main Render ────────────────────────────────────────────────────

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => step > 1 ? setStep(step - 1) : router.back()} style={styles.headerBack}>
          <Ionicons name="arrow-back" size={24} color={TarodanColors.textOnPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>
          {step === 1 ? t('mobile.checkoutDeliveryInfo') : step === 2 ? t('mobile.checkoutPayment') : t('mobile.checkoutConfirmation')}
        </Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Progress Steps */}
      <View style={styles.progressContainer}>
        {[1, 2, 3].map((s) => (
          <View key={s} style={styles.progressStep}>
            <View style={[styles.progressCircle, step >= s && styles.progressCircleActive]}>
              {step > s ? (
                <Ionicons name="checkmark" size={16} color="#fff" />
              ) : (
                <Text style={[styles.progressNumber, step >= s && styles.progressNumberActive]}>{s}</Text>
              )}
            </View>
            <Text style={[styles.progressLabel, step >= s && styles.progressLabelActive]}>
              {s === 1 ? 'Adres' : s === 2 ? 'Ödeme' : 'Onay'}
            </Text>
            {s < 3 && <View style={[styles.progressLine, step > s && styles.progressLineActive]} />}
          </View>
        ))}
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

        {/* ────── Step 1: Address ────── */}
        {step === 1 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Ionicons name={isAuthenticated ? 'location-outline' : 'person-outline'} size={24} color={TarodanColors.primary} />
              <Text style={styles.sectionTitle}>
                {isAuthenticated ? t('mobile.deliveryAddress') : t('mobile.contactInfo')}
              </Text>
            </View>

            {isAuthenticated ? (
              <>
                {user && (
                  <View style={styles.userBanner}>
                    <Ionicons name="person-circle-outline" size={20} color={TarodanColors.accent} />
                    <Text style={styles.userBannerText}>
                      {user.displayName} olarak giriş yapıldı
                    </Text>
                  </View>
                )}
                {renderSavedAddresses()}
              </>
            ) : (
              renderGuestForm()
            )}
          </View>
        )}

        {/* ────── Step 2: Payment ────── */}
        {step === 2 && (
          <View>
            {/* Carrier — Surat Kargo only (web parity). Static info card, not selectable. */}
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Ionicons name="car-outline" size={24} color={TarodanColors.primary} />
                <Text style={styles.sectionTitle}>{t('mobile.carrier')}</Text>
              </View>

              <View style={[styles.optionCard, styles.optionCardActive]}>
                <View style={[styles.radioOuter, styles.radioOuterActive]}>
                  <View style={styles.radioInner} />
                </View>
                <View style={styles.optionContent}>
                  <Text style={styles.optionTitle}>{t('mobile.carrierSurat')}</Text>
                  <Text style={styles.optionDescription}>2-3 iş günü teslimat</Text>
                </View>
                <Text style={styles.optionPrice}>
                  {shippingLoading ? '...' : `₺${formatPrice(getShippingRate('surat'))}`}
                </Text>
              </View>
            </View>

            {/* Card Input — bypass modunda gizli (PAYMENT_BYPASS=true) */}
            {!bypassEnabled && (
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Ionicons name="card-outline" size={24} color={TarodanColors.primary} />
                <Text style={styles.sectionTitle}>{t('mobile.cardInfo')}</Text>
              </View>

              <Text style={styles.inputLabel}>{t("mobile.cardName")}</Text>
              <TextInput
                style={styles.textInput}
                value={cardHolder}
                onChangeText={setCardHolder}
                placeholder="AD SOYAD"
                placeholderTextColor={TarodanColors.textTertiary}
                autoCapitalize="characters"
              />

              <Text style={styles.inputLabel}>{t("mobile.cardNumber")}</Text>
              <TextInput
                style={styles.textInput}
                value={cardNumber}
                onChangeText={setCardNumber}
                placeholder="0000 0000 0000 0000"
                placeholderTextColor={TarodanColors.textTertiary}
                keyboardType="number-pad"
                maxLength={19}
              />
              <Text style={styles.cardHint}>
                {t('mobile.testModePlaceholder')}
              </Text>

              <View style={{ flexDirection: 'row', gap: 12 }}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.inputLabel}>{t("mobile.expiryDate")}</Text>
                  <TextInput
                    style={styles.textInput}
                    value={cardExpiry}
                    onChangeText={(t) => {
                      const cleaned = t.replace(/[^0-9]/g, '');
                      if (cleaned.length <= 2) setCardExpiry(cleaned);
                      else setCardExpiry(cleaned.slice(0, 2) + '/' + cleaned.slice(2, 4));
                    }}
                    placeholder="AA/YY"
                    placeholderTextColor={TarodanColors.textTertiary}
                    keyboardType="number-pad"
                    maxLength={5}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.inputLabel}>{t("mobile.cvv")}</Text>
                  <TextInput
                    style={styles.textInput}
                    value={cardCvv}
                    onChangeText={setCardCvv}
                    placeholder="***"
                    placeholderTextColor={TarodanColors.textTertiary}
                    keyboardType="number-pad"
                    maxLength={4}
                    secureTextEntry
                  />
                </View>
              </View>

              <View style={styles.securityNotice}>
                <Ionicons name="shield-checkmark" size={20} color={TarodanColors.success} />
                <Text style={styles.securityText}>
                  {t('mobile.encryptedNotice')}
                </Text>
              </View>
            </View>
            )}

            {/* Bypass mode notice — only shown in dev/test environments */}
            {bypassEnabled && (
              <View style={styles.section}>
                <View style={styles.securityNotice}>
                  <Ionicons name="flash-outline" size={20} color={TarodanColors.warning} />
                  <Text style={styles.securityText}>
                    {t('mobile.developerModeBypass')}
                  </Text>
                </View>
              </View>
            )}
          </View>
        )}

        {/* ────── Step 3: Confirmation ────── */}
        {step === 3 && (
          <View>
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Ionicons name="receipt-outline" size={24} color={TarodanColors.primary} />
                <Text style={styles.sectionTitle}>Sipariş Özeti</Text>
              </View>

              {renderOrderItems()}

              <View style={styles.divider} />

              {/* Delivery Summary */}
              <View style={styles.summaryCard}>
                <View style={styles.summaryRow}>
                  <Ionicons name="location-outline" size={20} color={TarodanColors.textSecondary} />
                  <View style={styles.summaryContent}>
                    <Text style={styles.summaryLabel}>{t('mobile.deliveryAddress')}</Text>
                    <Text style={styles.summaryValue}>{getSelectedAddressSummary()}</Text>
                  </View>
                </View>

                {!isAuthenticated && (
                  <View style={styles.summaryRow}>
                    <Ionicons name="mail-outline" size={20} color={TarodanColors.textSecondary} />
                    <View style={styles.summaryContent}>
                      <Text style={styles.summaryLabel}>E-posta</Text>
                      <Text style={styles.summaryValue}>{guestEmail}</Text>
                    </View>
                  </View>
                )}

                <View style={styles.summaryRow}>
                  <Ionicons name="car-outline" size={20} color={TarodanColors.textSecondary} />
                  <View style={styles.summaryContent}>
                    <Text style={styles.summaryLabel}>{t('mobile.carrier')}</Text>
                    <Text style={styles.summaryValue}>{t('mobile.carrierSurat')}</Text>
                  </View>
                </View>

                <View style={styles.summaryRow}>
                  <Ionicons name="card-outline" size={20} color={TarodanColors.textSecondary} />
                  <View style={styles.summaryContent}>
                    <Text style={styles.summaryLabel}>{t('mobile.paymentMethod')}</Text>
                    <Text style={styles.summaryValue}>
                      {bypassEnabled
                        ? t('mobile.developerModeActive')
                        : `•••• •••• •••• ${cardNumber.replace(/\s/g, '').slice(-4) || '****'}`}
                    </Text>
                  </View>
                </View>
              </View>

              <View style={styles.securityNotice}>
                <Ionicons name="shield-checkmark" size={20} color={TarodanColors.success} />
                <Text style={styles.securityText}>
                  {t('mobile.securityNotice')}
                </Text>
              </View>
            </View>
          </View>
        )}

        {/* ────── Order Summary (always) ────── */}
        <View style={styles.orderSummary}>
          <Text style={styles.orderSummaryTitle}>{t('mobile.paymentDetails')}</Text>

          <View style={styles.orderSummaryRow}>
            <Text style={styles.orderSummaryLabel}>{t('mobile.subtotal')} ({checkoutItems.length} {t('mobile.items')})</Text>
            <Text style={styles.orderSummaryValue}>
              {quoteLoading ? '...' : `₺${formatPrice(subtotal)}`}
            </Text>
          </View>

          <View style={styles.orderSummaryRow}>
            <Text style={styles.orderSummaryLabel}>{t('mobile.carrier')} ({t('mobile.carrierSurat')})</Text>
            <Text style={styles.orderSummaryValue}>
              {shippingLoading ? '...' : totalShipping > 0 ? `₺${formatPrice(totalShipping)}` : t('mobile.selectAddressFirst')}
            </Text>
          </View>

          {buyerFee > 0 && (
            <View style={styles.orderSummaryRow}>
              <Text style={styles.orderSummaryLabel}>Hizmet Bedeli</Text>
              <Text style={styles.orderSummaryValue}>₺{formatPrice(buyerFee)}</Text>
            </View>
          )}

          <View style={styles.totalDivider} />

          <View style={styles.orderSummaryRow}>
            <Text style={styles.orderTotalLabel}>{t('mobile.totalLabel')}</Text>
            <Text style={styles.orderTotalValue}>₺{formatPrice(total)}</Text>
          </View>
        </View>

        <View style={{ height: 120 }} />
      </ScrollView>

      {/* Bottom Action Bar */}
      <View style={styles.bottomBar}>
        {step < 3 ? (
          <TouchableOpacity testID="checkout-next-button" style={styles.primaryButton} onPress={handleNextStep}>
            <Text style={styles.primaryButtonText}>{t('mobile.continue')}</Text>
            <Ionicons name="arrow-forward" size={20} color="#fff" />
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            testID="checkout-confirm-button"
            style={[styles.primaryButton, loading && styles.primaryButtonDisabled]}
            onPress={handleCheckout}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <Ionicons name="lock-closed" size={18} color="#fff" />
                <Text style={styles.primaryButtonText}>
                  Onayla ve Öde (₺{formatPrice(total)})
                </Text>
              </>
            )}
          </TouchableOpacity>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: TarodanColors.backgroundSecondary,
  },

  // Center / Empty
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: TarodanColors.backgroundSecondary,
    padding: 20,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 15,
    color: TarodanColors.textSecondary,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: TarodanColors.textPrimary,
    marginTop: 16,
  },
  emptySubtitle: {
    fontSize: 14,
    color: TarodanColors.textSecondary,
    textAlign: 'center',
    marginTop: 8,
    maxWidth: 260,
  },

  // Header
  header: {
    backgroundColor: TarodanColors.primary,
    paddingTop: Platform.OS === 'ios' ? 54 : 44,
    paddingBottom: 16,
    paddingHorizontal: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerBack: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: TarodanColors.textOnPrimary,
  },

  // Progress
  progressContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 18,
    backgroundColor: TarodanColors.background,
    borderBottomWidth: 1,
    borderBottomColor: TarodanColors.borderLight,
  },
  progressStep: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  progressCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: TarodanColors.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  progressCircleActive: {
    backgroundColor: TarodanColors.primary,
  },
  progressNumber: {
    fontSize: 14,
    fontWeight: 'bold',
    color: TarodanColors.textSecondary,
  },
  progressNumberActive: {
    color: '#fff',
  },
  progressLabel: {
    fontSize: 12,
    color: TarodanColors.textSecondary,
    marginLeft: 6,
  },
  progressLabelActive: {
    color: TarodanColors.primary,
    fontWeight: '600',
  },
  progressLine: {
    width: 30,
    height: 2,
    backgroundColor: TarodanColors.border,
    marginHorizontal: 8,
  },
  progressLineActive: {
    backgroundColor: TarodanColors.primary,
  },

  // Content
  content: {
    flex: 1,
    padding: 16,
  },
  section: {
    backgroundColor: TarodanColors.background,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: TarodanColors.textPrimary,
    marginLeft: 10,
  },

  // User banner (authenticated)
  userBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: TarodanColors.accentLight,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    marginBottom: 16,
  },
  userBannerText: {
    marginLeft: 8,
    fontSize: 14,
    color: TarodanColors.accent,
    fontWeight: '500',
  },

  // Saved Addresses
  addressCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 14,
    backgroundColor: TarodanColors.surfaceVariant,
    borderRadius: 10,
    marginBottom: 10,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  addressCardSelected: {
    borderColor: TarodanColors.primary,
    backgroundColor: TarodanColors.primaryLight,
  },
  addressCardContent: {
    flex: 1,
    marginLeft: 12,
  },
  addressCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 2,
  },
  addressCardName: {
    fontSize: 15,
    fontWeight: '600',
    color: TarodanColors.textPrimary,
  },
  addressCardTitle: {
    fontSize: 12,
    color: TarodanColors.primary,
    fontWeight: '500',
    marginBottom: 2,
  },
  addressCardDetail: {
    fontSize: 13,
    color: TarodanColors.textSecondary,
    marginTop: 2,
    lineHeight: 18,
  },
  addressCardCity: {
    fontSize: 13,
    color: TarodanColors.textSecondary,
    marginTop: 1,
  },
  addressCardPhone: {
    fontSize: 13,
    color: TarodanColors.textTertiary,
    marginTop: 2,
  },
  defaultBadge: {
    backgroundColor: TarodanColors.primaryMedium,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    marginLeft: 8,
  },
  defaultBadgeText: {
    fontSize: 11,
    color: TarodanColors.primaryDark,
    fontWeight: '600',
  },
  addAddressButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: TarodanColors.border,
    marginBottom: 8,
  },
  addAddressButtonActive: {
    borderColor: TarodanColors.primary,
    backgroundColor: TarodanColors.primaryLight,
  },
  addAddressText: {
    marginLeft: 8,
    fontSize: 14,
    color: TarodanColors.textSecondary,
  },
  newAddressForm: {
    marginTop: 8,
    paddingTop: 8,
  },
  saveAddressButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: TarodanColors.accent,
    paddingVertical: 12,
    borderRadius: 10,
    marginTop: 12,
  },
  saveAddressButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
    marginLeft: 6,
  },

  // Radio
  radioOuter: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: TarodanColors.border,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 2,
  },
  radioOuterActive: {
    borderColor: TarodanColors.primary,
  },
  radioInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: TarodanColors.primary,
  },

  // Guest form
  guestNotice: {
    flexDirection: 'row',
    backgroundColor: TarodanColors.warningLight,
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  guestNoticeText: {
    flex: 1,
    fontSize: 13,
    color: '#B45309',
    marginLeft: 8,
    lineHeight: 18,
  },
  secondaryButton: {
    alignSelf: 'flex-start',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: TarodanColors.primary,
    backgroundColor: TarodanColors.surfaceVariant,
    marginTop: 4,
  },
  secondaryButtonText: {
    color: TarodanColors.primary,
    fontSize: 14,
    fontWeight: '600',
  },
  loginLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
    paddingVertical: 10,
  },
  loginLinkText: {
    color: TarodanColors.primary,
    fontSize: 14,
    fontWeight: '500',
    marginLeft: 6,
  },

  // Inputs
  inputLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: TarodanColors.textSecondary,
    marginBottom: 6,
    marginTop: 12,
  },
  textInput: {
    borderWidth: 1,
    borderColor: TarodanColors.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === 'ios' ? 14 : 10,
    fontSize: 15,
    color: TarodanColors.textPrimary,
    backgroundColor: TarodanColors.surfaceVariant,
  },
  textArea: {
    minHeight: 80,
    paddingTop: 12,
  },

  // City Picker
  cityPickerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: TarodanColors.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === 'ios' ? 14 : 10,
    backgroundColor: TarodanColors.surfaceVariant,
  },
  cityPickerText: {
    fontSize: 15,
    color: TarodanColors.textPrimary,
  },
  cityPickerPlaceholder: {
    fontSize: 15,
    color: TarodanColors.textTertiary,
  },
  cityDropdown: {
    borderWidth: 1,
    borderColor: TarodanColors.border,
    borderRadius: 10,
    marginTop: 4,
    backgroundColor: TarodanColors.background,
    maxHeight: 220,
    overflow: 'hidden',
  },
  citySearchInput: {
    borderBottomWidth: 1,
    borderBottomColor: TarodanColors.borderLight,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    color: TarodanColors.textPrimary,
  },
  cityList: {
    maxHeight: 170,
  },
  cityItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: TarodanColors.borderLight,
  },
  cityItemActive: {
    backgroundColor: TarodanColors.primaryLight,
  },
  cityItemText: {
    fontSize: 14,
    color: TarodanColors.textPrimary,
  },
  cityItemTextActive: {
    color: TarodanColors.primary,
    fontWeight: '600',
  },

  // Divider
  divider: {
    height: 1,
    backgroundColor: TarodanColors.border,
    marginVertical: 20,
  },

  // Carrier / Option cards
  optionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: TarodanColors.surfaceVariant,
    borderRadius: 12,
    marginBottom: 10,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  optionCardActive: {
    borderColor: TarodanColors.primary,
    backgroundColor: TarodanColors.primaryLight,
  },
  optionContent: {
    flex: 1,
    marginLeft: 12,
  },
  optionTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: TarodanColors.textPrimary,
  },
  optionDescription: {
    fontSize: 13,
    color: TarodanColors.textSecondary,
    marginTop: 2,
  },
  optionPrice: {
    fontSize: 16,
    fontWeight: 'bold',
    color: TarodanColors.primary,
  },

  // Card hint
  cardHint: {
    fontSize: 12,
    color: TarodanColors.textTertiary,
    marginTop: 6,
    marginLeft: 4,
  },

  // Security
  securityNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: TarodanColors.successLight,
    padding: 12,
    borderRadius: 10,
    marginTop: 16,
  },
  securityText: {
    flex: 1,
    fontSize: 13,
    color: '#059669',
    marginLeft: 8,
    lineHeight: 18,
  },

  // Order items
  orderItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  orderItemImage: {
    width: 60,
    height: 60,
    borderRadius: 8,
    backgroundColor: TarodanColors.surfaceVariant,
  },
  orderItemInfo: {
    flex: 1,
    marginLeft: 12,
  },
  orderItemTitle: {
    fontSize: 14,
    fontWeight: '500',
    color: TarodanColors.textPrimary,
  },
  orderItemMeta: {
    fontSize: 12,
    color: TarodanColors.textSecondary,
    marginTop: 2,
  },
  orderItemPrice: {
    fontSize: 16,
    fontWeight: 'bold',
    color: TarodanColors.primary,
  },

  // Summary card (step 3)
  summaryCard: {
    backgroundColor: TarodanColors.surfaceVariant,
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  summaryContent: {
    flex: 1,
    marginLeft: 10,
  },
  summaryLabel: {
    fontSize: 12,
    color: TarodanColors.textTertiary,
  },
  summaryValue: {
    fontSize: 14,
    color: TarodanColors.textPrimary,
    marginTop: 1,
  },

  // Order summary (always visible)
  orderSummary: {
    backgroundColor: TarodanColors.background,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  orderSummaryTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: TarodanColors.textPrimary,
    marginBottom: 14,
  },
  orderSummaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  orderSummaryLabel: {
    fontSize: 14,
    color: TarodanColors.textSecondary,
  },
  orderSummaryValue: {
    fontSize: 14,
    color: TarodanColors.textPrimary,
    fontWeight: '500',
  },
  totalDivider: {
    height: 1,
    backgroundColor: TarodanColors.border,
    marginVertical: 10,
  },
  orderTotalLabel: {
    fontSize: 16,
    fontWeight: 'bold',
    color: TarodanColors.textPrimary,
  },
  orderTotalValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: TarodanColors.primary,
  },

  // Bottom bar
  bottomBar: {
    backgroundColor: TarodanColors.background,
    padding: 16,
    paddingBottom: Platform.OS === 'ios' ? 30 : 16,
    borderTopWidth: 1,
    borderTopColor: TarodanColors.border,
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: TarodanColors.primary,
    paddingVertical: 15,
    borderRadius: 12,
    gap: 8,
  },
  primaryButtonDisabled: {
    opacity: 0.7,
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
});
