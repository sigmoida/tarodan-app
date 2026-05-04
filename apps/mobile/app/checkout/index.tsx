import { useState, useEffect, useMemo } from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Image,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import {
  Button,
  RadioButton,
  Divider,
  ActivityIndicator,
  Snackbar,
  Switch,
} from 'react-native-paper';
import {
  Text,
  TextInput,
  CityDistrictSelector,
  ScreenHeader,
} from '../../src/components/common';
import { router } from 'expo-router';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { TarodanColors } from '../../src/theme';
import { useCartStore } from '../../src/stores/cartStore';
import {
  ordersApi,
  paymentsApi,
  shippingApi,
  addressesApi,
  discountsApi,
  type OrderAddressInput,
} from '../../src/services/api';
import { transformImageUrl } from '../../src/utils/imageUrl';
import { useAuthStore } from '../../src/stores/authStore';
import { formatPrice, asLabel } from '../../src/utils/format';

interface ShippingAddressInput {
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

interface SavedCard {
  cardToken: string;
  cardAlias?: string;
  cardHolderName?: string;
  lastFourDigits?: string;
  cardBrand?: string;
}

const EMPTY_ADDRESS: ShippingAddressInput = {
  fullName: '',
  phone: '',
  city: '',
  district: '',
  address: '',
  zipCode: '',
};

export default function CheckoutScreen() {
  const { items, getSubtotal, clearCart } = useCartStore();
  const { isAuthenticated, user } = useAuthStore();

  // ---------- Step ----------
  const [step, setStep] = useState(1); // 1: Adres, 2: Ödeme, 3: Onay

  // ---------- Konuk bilgileri (yalnızca isAuthenticated === false) ----------
  const [guestName, setGuestName] = useState('');
  const [guestEmail, setGuestEmail] = useState('');
  const [guestPhone, setGuestPhone] = useState('');

  // ---------- Adres seçimi ----------
  /** Üye için kayıtlı adresten seçim. 'new' = yeni adres formu. */
  const [selectedAddressId, setSelectedAddressId] = useState<string | 'new'>('new');
  const [shippingAddress, setShippingAddress] = useState<ShippingAddressInput>(EMPTY_ADDRESS);

  /** Fatura adresi: teslimat ile aynı mı? */
  const [billingDifferent, setBillingDifferent] = useState(false);
  const [selectedBillingAddressId, setSelectedBillingAddressId] = useState<string | 'new'>('new');
  const [billingAddress, setBillingAddress] = useState<ShippingAddressInput>(EMPTY_ADDRESS);

  // ---------- Kargo / Ödeme tercihleri ----------
  const [selectedCarrier, setSelectedCarrier] = useState<'aras' | 'yurtici' | 'mng'>('aras');
  const [paymentProvider, setPaymentProvider] = useState<'iyzico' | 'paytr'>('iyzico');
  const [shippingCost, setShippingCost] = useState(0);
  const [shippingLoading, setShippingLoading] = useState(false);

  // ---------- Kayıtlı kart / yeni kart ----------
  const [selectedCardToken, setSelectedCardToken] = useState<string | 'new' | 'webview'>(
    'webview', // varsayılan: WebView 3DS akışı
  );
  const [cardForm, setCardForm] = useState({
    cardHolderName: '',
    cardNumber: '',
    expireMonth: '',
    expireYear: '',
    cvc: '',
    cardAlias: '',
    saveCard: true,
  });

  // ---------- Kupon / İndirim ----------
  const [couponCode, setCouponCode] = useState('');
  const [appliedDiscount, setAppliedDiscount] = useState<{ code: string; amount: number } | null>(
    null,
  );
  const [couponLoading, setCouponLoading] = useState(false);

  // ---------- UI ----------
  const [loading, setLoading] = useState(false);
  const [snackbar, setSnackbar] = useState<{ visible: boolean; message: string }>({
    visible: false,
    message: '',
  });

  const subtotal = getSubtotal();
  const total = subtotal + shippingCost - (appliedDiscount?.amount ?? 0);

  // ---------- Üye için kayıtlı adresler ----------
  const addressesQuery = useQuery({
    queryKey: ['my-addresses'],
    queryFn: async () => {
      const response = await addressesApi.getAll();
      const list: SavedAddress[] = (response.data as any)?.data ?? response.data ?? [];
      return Array.isArray(list) ? list : [];
    },
    enabled: isAuthenticated,
  });
  const addresses = addressesQuery.data ?? [];

  // İlk yüklemede varsayılan / ilk adresi seç
  useEffect(() => {
    if (!isAuthenticated || addresses.length === 0) return;
    if (selectedAddressId !== 'new') return;
    const def = addresses.find(a => a.isDefault) ?? addresses[0];
    setSelectedAddressId(def.id);
  }, [isAuthenticated, addresses]);

  // ---------- Üye için kayıtlı kartlar ----------
  const cardsQuery = useQuery({
    queryKey: ['my-payment-methods'],
    queryFn: async () => {
      const response = await paymentsApi.getPaymentMethods();
      const list: SavedCard[] = (response.data as any)?.data ?? response.data ?? [];
      return Array.isArray(list) ? list : [];
    },
    enabled: isAuthenticated,
  });
  const cards = cardsQuery.data ?? [];

  useEffect(() => {
    if (!isAuthenticated) {
      setSelectedCardToken('webview');
      return;
    }
    // Üye + en az 1 kart var → varsayılan olarak ilk kartı seç
    if (cards.length > 0 && selectedCardToken === 'webview') {
      setSelectedCardToken(cards[0].cardToken);
    }
    // Üye + hiç kart yok → yeni kart formu varsayılan
    if (cards.length === 0 && selectedCardToken !== 'new' && selectedCardToken !== 'webview') {
      setSelectedCardToken('new');
    }
  }, [isAuthenticated, cards]);

  // ---------- Kargo ücreti hesaplama ----------
  const effectiveShippingCity = useMemo(() => {
    if (isAuthenticated && selectedAddressId !== 'new') {
      const a = addresses.find(x => x.id === selectedAddressId);
      return a?.city ?? '';
    }
    return shippingAddress.city;
  }, [isAuthenticated, selectedAddressId, addresses, shippingAddress.city]);

  useEffect(() => {
    if (effectiveShippingCity) {
      calculateShipping(effectiveShippingCity);
    } else {
      setShippingCost(0);
    }
  }, [effectiveShippingCity, selectedCarrier]);

  const calculateShipping = async (city: string) => {
    setShippingLoading(true);
    try {
      const response = await shippingApi
        .getRatesByCity({ city, carrier: selectedCarrier, weight: 0.5 })
        .catch(() => null);
      if (response?.data?.rate) {
        setShippingCost(response.data.rate);
      } else {
        const isIstanbul = city.toLowerCase().includes('istanbul');
        const baseRate = isIstanbul ? 34.9 : 49.9;
        const carrierExtra = selectedCarrier === 'yurtici' ? 5 : 0;
        setShippingCost(baseRate + carrierExtra);
      }
    } catch {
      setShippingCost(49.9);
    } finally {
      setShippingLoading(false);
    }
  };

  // ---------- Kupon doğrulama ----------
  const handleApplyCoupon = async () => {
    if (!couponCode.trim()) return;
    setCouponLoading(true);
    try {
      const response = await discountsApi.validate({
        code: couponCode.trim(),
        cartItems: items.map(it => ({
          productId: it.productId,
          quantity: it.quantity,
          price: it.price,
        })),
      });
      const data: any = (response.data as any)?.data ?? response.data;
      const discountAmount = Number(data?.discountAmount ?? data?.amount ?? 0);
      if (discountAmount > 0) {
        setAppliedDiscount({ code: couponCode.trim(), amount: discountAmount });
        showSnackbar(`Kupon uygulandı: -${formatPrice(discountAmount)}`);
      } else {
        showSnackbar(data?.message || 'Kupon geçerli ama indirim hesaplanamadı.');
      }
    } catch (e: any) {
      showSnackbar(e?.response?.data?.message || 'Kupon geçersiz.');
    } finally {
      setCouponLoading(false);
    }
  };

  // ---------- Validasyonlar ----------
  const showSnackbar = (message: string) =>
    setSnackbar({ visible: true, message });

  const validateGuest = () => {
    if (!guestName.trim()) return 'Lütfen adınızı girin';
    if (!/^\S+@\S+\.\S+$/.test(guestEmail.trim())) return 'Geçerli bir e-posta adresi girin';
    if (guestPhone.trim().length < 10) return 'Geçerli bir telefon numarası girin';
    return null;
  };

  const validateInlineAddress = (a: ShippingAddressInput, label = 'Teslimat') => {
    if (!a.fullName.trim()) return `${label} adresi için ad soyad gerekli`;
    if (!a.phone.trim() || a.phone.trim().length < 10)
      return `${label} adresi için telefon numarası gerekli`;
    if (!a.city.trim()) return `${label} adresi için il seçin`;
    if (!a.district.trim()) return `${label} adresi için ilçe seçin`;
    if (!a.address.trim()) return `${label} adresi için açık adres girin`;
    return null;
  };

  const validateStep1 = (): string | null => {
    // Konuk
    if (!isAuthenticated) {
      const guestErr = validateGuest();
      if (guestErr) return guestErr;
    }
    // Adres
    if (isAuthenticated && selectedAddressId !== 'new') {
      // Kayıtlı adres seçildi → her şey OK
    } else {
      // Yeni adres formu (üye veya konuk)
      const phone = shippingAddress.phone.trim() || guestPhone.trim();
      const inlineAddress: ShippingAddressInput = { ...shippingAddress, phone };
      const err = validateInlineAddress(inlineAddress);
      if (err) return err;
    }
    // Billing (eğer farklı seçildiyse)
    if (billingDifferent) {
      if (isAuthenticated && selectedBillingAddressId !== 'new') {
        // Kayıtlı seçildi → OK
      } else {
        const err = validateInlineAddress(billingAddress, 'Fatura');
        if (err) return err;
      }
    }
    return null;
  };

  const handleNextStep = () => {
    if (step === 1) {
      const err = validateStep1();
      if (err) return showSnackbar(err);
      setStep(2);
      return;
    }
    if (step === 2) {
      // Kart seçim doğrulaması
      if (isAuthenticated && selectedCardToken === 'new') {
        const c = cardForm;
        if (!c.cardHolderName.trim()) return showSnackbar('Kart sahibi adını girin');
        const cleanNumber = c.cardNumber.replace(/\s/g, '');
        if (cleanNumber.length < 15 || cleanNumber.length > 19)
          return showSnackbar('Geçerli bir kart numarası girin');
        const month = parseInt(c.expireMonth, 10);
        if (isNaN(month) || month < 1 || month > 12)
          return showSnackbar('Geçerli son kullanma ayı girin (1-12)');
        if (!/^\d{2,4}$/.test(c.expireYear)) return showSnackbar('Geçerli son kullanma yılı girin');
        if (!/^\d{3,4}$/.test(c.cvc)) return showSnackbar('Geçerli CVC girin');
      }
      setStep(3);
      return;
    }
  };

  // ---------- Address payload helper'ları ----------
  const buildShippingPayload = (): { id?: string; inline?: OrderAddressInput } => {
    if (isAuthenticated && selectedAddressId !== 'new') {
      return { id: selectedAddressId };
    }
    const phone = shippingAddress.phone.trim() || guestPhone.trim();
    return {
      inline: {
        fullName: shippingAddress.fullName.trim(),
        phone,
        city: shippingAddress.city.trim(),
        district: shippingAddress.district.trim(),
        address: shippingAddress.address.trim(),
        zipCode: shippingAddress.zipCode?.trim() || undefined,
      },
    };
  };

  const buildBillingPayload = (): { id?: string; inline?: OrderAddressInput } | null => {
    if (!billingDifferent) return null;
    if (isAuthenticated && selectedBillingAddressId !== 'new') {
      return { id: selectedBillingAddressId };
    }
    return {
      inline: {
        fullName: billingAddress.fullName.trim(),
        phone: billingAddress.phone.trim(),
        city: billingAddress.city.trim(),
        district: billingAddress.district.trim(),
        address: billingAddress.address.trim(),
        zipCode: billingAddress.zipCode?.trim() || undefined,
      },
    };
  };

  // ---------- Checkout ----------
  const handleCheckout = async () => {
    if (items.length === 0) {
      showSnackbar('Sepetiniz boş');
      return;
    }
    for (const item of items) {
      if (!item.productId || typeof item.productId !== 'string' || item.productId.length < 10) {
        Alert.alert('Hata', `Geçersiz ürün ID: ${item.title}`);
        return;
      }
    }

    setLoading(true);
    try {
      const shipping = buildShippingPayload();
      const billing = buildBillingPayload();

      let firstOrderId: string | null = null;

      // Sepetteki her ürün için ayrı sipariş yaratılır (web pattern'i)
      for (const item of items) {
        if (isAuthenticated && user) {
          const response = await ordersApi.directBuy({
            productId: item.productId,
            shippingAddressId: shipping.id,
            shippingAddress: shipping.inline,
            billingAddressId: billing?.id,
            billingAddress: billing?.inline,
          });
          const data: any = (response.data as any)?.data ?? response.data;
          const orderId = data?.id || data?.orderId || data?.order?.id;
          if (!firstOrderId && orderId) firstOrderId = orderId;
        } else {
          const response = await ordersApi.createGuest({
            productId: item.productId,
            email: guestEmail.trim().toLowerCase(),
            phone: guestPhone.trim(),
            guestName: guestName.trim(),
            shippingAddress: shipping.inline!,
            billingAddress: billing?.inline,
          });
          const data: any = (response.data as any)?.data ?? response.data;
          const orderId = data?.id || data?.orderId || data?.order?.id;
          if (!firstOrderId && orderId) firstOrderId = orderId;
        }
      }

      if (!firstOrderId) {
        Alert.alert(
          'Hata',
          'Sipariş oluşturuldu fakat ödeme başlatılamadı. Siparişlerim sayfasından devam edebilirsiniz.',
        );
        clearCart();
        router.replace('/orders' as any);
        return;
      }

      // Üye + kayıtlı kart seçimi → processDirect (tek tık akışı)
      if (
        isAuthenticated &&
        selectedCardToken !== 'webview' &&
        selectedCardToken !== 'new'
      ) {
        try {
          const directResp: any = await paymentsApi.processDirect({
            orderId: firstOrderId,
            cardToken: selectedCardToken,
            provider: paymentProvider,
          });
          const directData: any = directResp.data?.data ?? directResp.data ?? {};
          const status = directData.status || directData.payment?.status;
          const paymentId = directData.paymentId || directData.id || directData.payment?.id;
          // 3DS gerekiyorsa veya hala pending ise WebView akışına geç
          if (status === 'paid' || status === 'success' || status === 'completed') {
            clearCart();
            router.replace({
              pathname: '/payment/success',
              params: { paymentId, orderId: firstOrderId },
            } as any);
            return;
          }
          // Aksi halde WebView akışına geçilir
          clearCart();
          router.replace({
            pathname: '/payment/[id]',
            params: {
              id: paymentId || firstOrderId,
              orderId: firstOrderId,
              provider: paymentProvider,
              guest: '0',
            },
          } as any);
          return;
        } catch (directErr: any) {
          // Direct ödeme başarısızsa, WebView akışına düşer
          console.warn('processDirect failed, falling back to WebView:', directErr?.message);
        }
      }

      // Üye + yeni kart formu → backend kart bilgisini alır + 3DS WebView'i açar
      if (isAuthenticated && selectedCardToken === 'new') {
        try {
          const directResp: any = await paymentsApi.processDirect({
            orderId: firstOrderId,
            card: {
              cardHolderName: cardForm.cardHolderName.trim(),
              cardNumber: cardForm.cardNumber.replace(/\s/g, ''),
              expireMonth: cardForm.expireMonth,
              expireYear: cardForm.expireYear,
              cvc: cardForm.cvc,
              cardAlias: cardForm.cardAlias.trim() || undefined,
            },
            saveCard: cardForm.saveCard,
            provider: paymentProvider,
          });
          const directData: any = directResp.data?.data ?? directResp.data ?? {};
          const paymentId = directData.paymentId || directData.id || directData.payment?.id;
          clearCart();
          router.replace({
            pathname: '/payment/[id]',
            params: {
              id: paymentId || firstOrderId,
              orderId: firstOrderId,
              provider: paymentProvider,
              guest: '0',
            },
          } as any);
          return;
        } catch (newCardErr: any) {
          console.warn('processDirect (new card) failed, fallback to WebView:', newCardErr?.message);
        }
      }

      // WebView akışı (default) — konuk veya kart akışı başarısız oldu
      try {
        const initResp: any = isAuthenticated
          ? await paymentsApi.initiate(firstOrderId, paymentProvider)
          : await paymentsApi.initiateGuest(firstOrderId, paymentProvider);
        const initData = initResp.data?.data ?? initResp.data ?? {};
        const paymentId =
          initData.paymentId || initData.id || initData.payment?.id || firstOrderId;
        clearCart();
        router.replace({
          pathname: '/payment/[id]',
          params: {
            id: paymentId,
            orderId: firstOrderId,
            provider: paymentProvider,
            guest: isAuthenticated ? '0' : '1',
          },
        } as any);
      } catch (payErr: any) {
        const msg =
          payErr?.response?.data?.message ||
          'Ödeme başlatılamadı. Siparişinizi daha sonra siparişlerim üzerinden tamamlayabilirsiniz.';
        Alert.alert('Ödeme Başlatılamadı', msg, [
          { text: 'Tamam', onPress: () => router.replace(isAuthenticated ? '/orders' : '/' as any) },
        ]);
      }
    } catch (error: any) {
      console.error('Checkout error:', error);
      const errorMessage =
        error.response?.data?.message ||
        error.response?.data?.error ||
        (Array.isArray(error.response?.data?.message)
          ? error.response?.data?.message.join(', ')
          : 'Sipariş oluşturulamadı');
      Alert.alert('Hata', errorMessage);
    } finally {
      setLoading(false);
    }
  };

  // ---------- Erken çıkışlar ----------
  if (items.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Ionicons name="cart-outline" size={80} color={TarodanColors.textSecondary} />
        <Text style={styles.emptyTitle}>Sepetiniz Boş</Text>
        <Text style={styles.emptySubtitle}>Ödeme yapabilmek için sepetinize ürün ekleyin</Text>
        <Button
          mode="contained"
          buttonColor={TarodanColors.primary}
          onPress={() => router.replace('/' as any)}
          style={{ marginTop: 20 }}
        >
          Alışverişe Başla
        </Button>
      </View>
    );
  }

  // ---------- Adres seçim UI'ı ----------
  const renderAddressSelector = (
    isBilling = false,
  ) => {
    const selectedId = isBilling ? selectedBillingAddressId : selectedAddressId;
    const setSelectedId = isBilling ? setSelectedBillingAddressId : setSelectedAddressId;
    const inline = isBilling ? billingAddress : shippingAddress;
    const setInline = isBilling ? setBillingAddress : setShippingAddress;

    return (
      <View>
        {isAuthenticated && addresses.length > 0 ? (
          <View style={{ marginBottom: 12 }}>
            {addresses.map(a => (
              <TouchableOpacity
                key={a.id}
                style={[
                  styles.savedAddressRow,
                  selectedId === a.id && styles.savedAddressRowActive,
                ]}
                onPress={() => setSelectedId(a.id)}
              >
                <RadioButton
                  value={a.id}
                  status={selectedId === a.id ? 'checked' : 'unchecked'}
                  onPress={() => setSelectedId(a.id)}
                  color={TarodanColors.primary}
                />
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Text style={styles.addressTitle}>{a.title || a.fullName}</Text>
                    {a.isDefault ? (
                      <Text style={styles.defaultBadge}> · Varsayılan</Text>
                    ) : null}
                  </View>
                  <Text style={styles.addressLine} numberOfLines={2}>
                    {a.fullName} · {a.phone}
                  </Text>
                  <Text style={styles.addressLine} numberOfLines={2}>
                    {a.address}, {a.district}/{a.city}
                  </Text>
                </View>
              </TouchableOpacity>
            ))}
            <TouchableOpacity
              style={[styles.savedAddressRow, selectedId === 'new' && styles.savedAddressRowActive]}
              onPress={() => setSelectedId('new')}
            >
              <RadioButton
                value="new"
                status={selectedId === 'new' ? 'checked' : 'unchecked'}
                onPress={() => setSelectedId('new')}
                color={TarodanColors.primary}
              />
              <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}>
                <Ionicons name="add-circle-outline" size={18} color={TarodanColors.primary} />
                <Text style={[styles.addressTitle, { marginLeft: 8 }]}>Yeni Adres Ekle</Text>
              </View>
            </TouchableOpacity>
          </View>
        ) : null}

        {/* Yeni adres formu (konuk veya üye + 'new' seçildi) */}
        {selectedId === 'new' ? (
          <View>
            <TextInput
              label="Ad Soyad *"
              value={inline.fullName}
              onChangeText={(text: string) => setInline({ ...inline, fullName: text })}
              mode="outlined"
              style={styles.input}
              outlineColor={TarodanColors.border}
              activeOutlineColor={TarodanColors.primary}
            />
            <TextInput
              label="Telefon *"
              value={inline.phone}
              onChangeText={(text: string) => setInline({ ...inline, phone: text })}
              mode="outlined"
              keyboardType="phone-pad"
              placeholder="+90 5XX XXX XX XX"
              style={styles.input}
              outlineColor={TarodanColors.border}
              activeOutlineColor={TarodanColors.primary}
            />
            <CityDistrictSelector
              city={inline.city}
              district={inline.district}
              onChangeCity={(city) => setInline({ ...inline, city })}
              onChangeDistrict={(district) => setInline({ ...inline, district })}
            />
            <TextInput
              label="Açık Adres *"
              value={inline.address}
              onChangeText={(text: string) => setInline({ ...inline, address: text })}
              mode="outlined"
              multiline
              numberOfLines={3}
              style={styles.input}
              outlineColor={TarodanColors.border}
              activeOutlineColor={TarodanColors.primary}
            />
            <TextInput
              label="Posta Kodu"
              value={inline.zipCode || ''}
              onChangeText={(text: string) => setInline({ ...inline, zipCode: text })}
              mode="outlined"
              keyboardType="number-pad"
              maxLength={5}
              style={styles.input}
              outlineColor={TarodanColors.border}
              activeOutlineColor={TarodanColors.primary}
            />
          </View>
        ) : null}
      </View>
    );
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScreenHeader
        title={
          step === 1 ? 'Teslimat Bilgileri' : step === 2 ? 'Ödeme' : 'Sipariş Onayı'
        }
        onBack={() => (step > 1 ? setStep(step - 1) : router.back())}
      />

      {/* Progress Steps */}
      <View style={styles.progressContainer}>
        {[1, 2, 3].map(s => (
          <View key={s} style={styles.progressStep}>
            <View style={[styles.progressCircle, step >= s && styles.progressCircleActive]}>
              {step > s ? (
                <Ionicons name="checkmark" size={16} color="#fff" />
              ) : (
                <Text style={[styles.progressNumber, step >= s && styles.progressNumberActive]}>
                  {s}
                </Text>
              )}
            </View>
            <Text style={[styles.progressLabel, step >= s && styles.progressLabelActive]}>
              {s === 1 ? 'Adres' : s === 2 ? 'Ödeme' : 'Onay'}
            </Text>
            {s < 3 ? (
              <View style={[styles.progressLine, step > s && styles.progressLineActive]} />
            ) : null}
          </View>
        ))}
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Step 1: Adres */}
        {step === 1 ? (
          <>
            {/* Konuk uyarısı */}
            {!isAuthenticated ? (
              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <Ionicons name="person-outline" size={24} color={TarodanColors.primary} />
                  <Text style={styles.sectionTitle}>İletişim Bilgileri</Text>
                </View>
                <View style={styles.guestNotice}>
                  <Ionicons
                    name="information-circle-outline"
                    size={20}
                    color={TarodanColors.warning}
                  />
                  <Text style={styles.guestNoticeText}>
                    Üye olmadan alışveriş yapıyorsunuz. Siparişinizi takip etmek için e-posta
                    adresinizi girin.
                  </Text>
                </View>
                <TextInput
                  label="Ad Soyad *"
                  value={guestName}
                  onChangeText={setGuestName}
                  mode="outlined"
                  style={styles.input}
                  outlineColor={TarodanColors.border}
                  activeOutlineColor={TarodanColors.primary}
                />
                <TextInput
                  label="E-posta *"
                  value={guestEmail}
                  onChangeText={setGuestEmail}
                  mode="outlined"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  style={styles.input}
                  outlineColor={TarodanColors.border}
                  activeOutlineColor={TarodanColors.primary}
                />
                <TextInput
                  label="Telefon *"
                  value={guestPhone}
                  onChangeText={setGuestPhone}
                  mode="outlined"
                  keyboardType="phone-pad"
                  placeholder="+90 5XX XXX XX XX"
                  style={styles.input}
                  outlineColor={TarodanColors.border}
                  activeOutlineColor={TarodanColors.primary}
                />
                <TouchableOpacity
                  style={styles.loginLink}
                  onPress={() => router.push('/(auth)/login' as any)}
                >
                  <Text style={styles.loginLinkText}>Üye misiniz? Giriş yapın →</Text>
                </TouchableOpacity>
              </View>
            ) : null}

            {/* Teslimat Adresi */}
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Ionicons name="location-outline" size={24} color={TarodanColors.primary} />
                <Text style={styles.sectionTitle}>Teslimat Adresi</Text>
              </View>
              {renderAddressSelector(false)}
            </View>

            {/* Fatura Adresi (toggle) */}
            <View style={styles.section}>
              <View style={[styles.sectionHeader, { justifyContent: 'space-between' }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Ionicons name="receipt-outline" size={24} color={TarodanColors.primary} />
                  <Text style={styles.sectionTitle}>Fatura Adresi</Text>
                </View>
                <Switch
                  value={billingDifferent}
                  onValueChange={setBillingDifferent}
                  color={TarodanColors.primary}
                />
              </View>
              {billingDifferent ? (
                renderAddressSelector(true)
              ) : (
                <Text style={styles.helperText}>
                  Teslimat adresi ile aynı kullanılacak.
                </Text>
              )}
            </View>
          </>
        ) : null}

        {/* Step 2: Ödeme */}
        {step === 2 ? (
          <>
            {/* Kargo Seçimi */}
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Ionicons name="car-outline" size={24} color={TarodanColors.primary} />
                <Text style={styles.sectionTitle}>Kargo Seçimi</Text>
              </View>

              {(['aras', 'yurtici', 'mng'] as const).map(c => (
                <TouchableOpacity
                  key={c}
                  style={[
                    styles.optionCard,
                    selectedCarrier === c && styles.optionCardActive,
                  ]}
                  onPress={() => setSelectedCarrier(c)}
                >
                  <RadioButton
                    value={c}
                    status={selectedCarrier === c ? 'checked' : 'unchecked'}
                    onPress={() => setSelectedCarrier(c)}
                    color={TarodanColors.primary}
                  />
                  <View style={styles.optionContent}>
                    <Text style={styles.optionTitle}>
                      {c === 'aras' ? 'Aras Kargo' : c === 'yurtici' ? 'Yurtiçi Kargo' : 'MNG Kargo'}
                    </Text>
                    <Text style={styles.optionDescription}>2-4 iş günü teslimat</Text>
                  </View>
                  {shippingLoading ? (
                    <ActivityIndicator size="small" color={TarodanColors.primary} />
                  ) : (
                    <Text style={styles.optionPrice}>{formatPrice(shippingCost)}</Text>
                  )}
                </TouchableOpacity>
              ))}
            </View>

            {/* Ödeme Yöntemi */}
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Ionicons name="card-outline" size={24} color={TarodanColors.primary} />
                <Text style={styles.sectionTitle}>Ödeme Yöntemi</Text>
              </View>

              {/* Üye + kayıtlı kart varsa */}
              {isAuthenticated && cards.length > 0 ? (
                <View style={{ marginBottom: 8 }}>
                  {cards.map(card => (
                    <TouchableOpacity
                      key={card.cardToken}
                      style={[
                        styles.optionCard,
                        selectedCardToken === card.cardToken && styles.optionCardActive,
                      ]}
                      onPress={() => setSelectedCardToken(card.cardToken)}
                    >
                      <RadioButton
                        value={card.cardToken}
                        status={
                          selectedCardToken === card.cardToken ? 'checked' : 'unchecked'
                        }
                        onPress={() => setSelectedCardToken(card.cardToken)}
                        color={TarodanColors.primary}
                      />
                      <MaterialCommunityIcons
                        name="credit-card"
                        size={22}
                        color={TarodanColors.primary}
                        style={{ marginRight: 6 }}
                      />
                      <View style={styles.optionContent}>
                        <Text style={styles.optionTitle}>
                          {card.cardAlias || card.cardBrand || 'Kart'} ····{' '}
                          {card.lastFourDigits || '****'}
                        </Text>
                        <Text style={styles.optionDescription}>
                          {card.cardHolderName || 'Tek tıkla öde'}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  ))}

                  {/* Yeni kart formu */}
                  <TouchableOpacity
                    style={[
                      styles.optionCard,
                      selectedCardToken === 'new' && styles.optionCardActive,
                    ]}
                    onPress={() => setSelectedCardToken('new')}
                  >
                    <RadioButton
                      value="new"
                      status={selectedCardToken === 'new' ? 'checked' : 'unchecked'}
                      onPress={() => setSelectedCardToken('new')}
                      color={TarodanColors.primary}
                    />
                    <MaterialCommunityIcons
                      name="credit-card-plus"
                      size={22}
                      color={TarodanColors.primary}
                      style={{ marginRight: 6 }}
                    />
                    <View style={styles.optionContent}>
                      <Text style={styles.optionTitle}>Yeni Kart Ekle</Text>
                      <Text style={styles.optionDescription}>3DS ile güvenli ödeme</Text>
                    </View>
                  </TouchableOpacity>

                  {/* WebView (provider-hosted) seçeneği */}
                  <TouchableOpacity
                    style={[
                      styles.optionCard,
                      selectedCardToken === 'webview' && styles.optionCardActive,
                    ]}
                    onPress={() => setSelectedCardToken('webview')}
                  >
                    <RadioButton
                      value="webview"
                      status={selectedCardToken === 'webview' ? 'checked' : 'unchecked'}
                      onPress={() => setSelectedCardToken('webview')}
                      color={TarodanColors.primary}
                    />
                    <MaterialCommunityIcons
                      name="shield-key-outline"
                      size={22}
                      color={TarodanColors.primary}
                      style={{ marginRight: 6 }}
                    />
                    <View style={styles.optionContent}>
                      <Text style={styles.optionTitle}>Sağlayıcı Sayfasında Öde</Text>
                      <Text style={styles.optionDescription}>
                        {paymentProvider === 'iyzico' ? 'iyzico' : 'PayTR'} 3DS sayfası
                      </Text>
                    </View>
                  </TouchableOpacity>
                </View>
              ) : null}

              {/* Üye + kart yok ya da yeni kart formu seçili */}
              {isAuthenticated && selectedCardToken === 'new' ? (
                <View>
                  <TextInput
                    mode="outlined"
                    label="Kart Sahibi *"
                    value={cardForm.cardHolderName}
                    onChangeText={(v: string) =>
                      setCardForm({ ...cardForm, cardHolderName: v })
                    }
                    style={styles.input}
                    outlineColor={TarodanColors.border}
                    activeOutlineColor={TarodanColors.primary}
                  />
                  <TextInput
                    mode="outlined"
                    label="Kart Numarası *"
                    value={cardForm.cardNumber}
                    onChangeText={(v: string) =>
                      setCardForm({ ...cardForm, cardNumber: v.replace(/[^\d\s]/g, '') })
                    }
                    keyboardType="number-pad"
                    maxLength={19}
                    style={styles.input}
                    outlineColor={TarodanColors.border}
                    activeOutlineColor={TarodanColors.primary}
                  />
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <TextInput
                      mode="outlined"
                      label="Ay *"
                      value={cardForm.expireMonth}
                      onChangeText={(v: string) =>
                        setCardForm({ ...cardForm, expireMonth: v.replace(/[^\d]/g, '') })
                      }
                      keyboardType="number-pad"
                      maxLength={2}
                      style={[styles.input, { flex: 1 }]}
                      outlineColor={TarodanColors.border}
                      activeOutlineColor={TarodanColors.primary}
                    />
                    <TextInput
                      mode="outlined"
                      label="Yıl *"
                      value={cardForm.expireYear}
                      onChangeText={(v: string) =>
                        setCardForm({ ...cardForm, expireYear: v.replace(/[^\d]/g, '') })
                      }
                      keyboardType="number-pad"
                      maxLength={4}
                      style={[styles.input, { flex: 1 }]}
                      outlineColor={TarodanColors.border}
                      activeOutlineColor={TarodanColors.primary}
                    />
                    <TextInput
                      mode="outlined"
                      label="CVC *"
                      value={cardForm.cvc}
                      onChangeText={(v: string) =>
                        setCardForm({ ...cardForm, cvc: v.replace(/[^\d]/g, '') })
                      }
                      keyboardType="number-pad"
                      maxLength={4}
                      secureTextEntry
                      style={[styles.input, { flex: 1 }]}
                      outlineColor={TarodanColors.border}
                      activeOutlineColor={TarodanColors.primary}
                    />
                  </View>
                  <TextInput
                    mode="outlined"
                    label="Kart Takma Adı (opsiyonel)"
                    value={cardForm.cardAlias}
                    onChangeText={(v: string) => setCardForm({ ...cardForm, cardAlias: v })}
                    style={styles.input}
                    outlineColor={TarodanColors.border}
                    activeOutlineColor={TarodanColors.primary}
                  />
                  <View style={styles.saveCardRow}>
                    <Switch
                      value={cardForm.saveCard}
                      onValueChange={(v: boolean) => setCardForm({ ...cardForm, saveCard: v })}
                      color={TarodanColors.primary}
                    />
                    <Text style={styles.saveCardLabel}>Bu kartı sonraki alışverişler için kaydet</Text>
                  </View>
                </View>
              ) : null}

              {/* Provider seçimi */}
              <View style={{ marginTop: 12 }}>
                <Text style={styles.helperText}>Ödeme sağlayıcı:</Text>
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 6 }}>
                  {(['iyzico', 'paytr'] as const).map(p => (
                    <TouchableOpacity
                      key={p}
                      style={[
                        styles.providerChip,
                        paymentProvider === p && styles.providerChipActive,
                      ]}
                      onPress={() => setPaymentProvider(p)}
                    >
                      <Text
                        style={[
                          styles.providerChipText,
                          paymentProvider === p && styles.providerChipTextActive,
                        ]}
                      >
                        {p === 'iyzico' ? 'iyzico' : 'PayTR'}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            </View>

            {/* Kupon */}
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Ionicons name="pricetag-outline" size={22} color={TarodanColors.primary} />
                <Text style={styles.sectionTitle}>İndirim Kuponu</Text>
              </View>
              {appliedDiscount ? (
                <View style={styles.appliedCoupon}>
                  <Ionicons name="checkmark-circle" size={18} color={TarodanColors.success} />
                  <View style={{ flex: 1, marginLeft: 8 }}>
                    <Text style={styles.optionTitle}>
                      {appliedDiscount.code} · -{formatPrice(appliedDiscount.amount)}
                    </Text>
                  </View>
                  <Button
                    mode="text"
                    onPress={() => setAppliedDiscount(null)}
                    textColor={TarodanColors.error}
                  >
                    Kaldır
                  </Button>
                </View>
              ) : (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <TextInput
                    mode="outlined"
                    placeholder="Kupon kodu"
                    value={couponCode}
                    onChangeText={(v: string) => setCouponCode(v.toUpperCase())}
                    autoCapitalize="characters"
                    style={[styles.input, { flex: 1, marginBottom: 0 }]}
                    outlineColor={TarodanColors.border}
                    activeOutlineColor={TarodanColors.primary}
                  />
                  <Button
                    mode="contained"
                    buttonColor={TarodanColors.primary}
                    onPress={handleApplyCoupon}
                    loading={couponLoading}
                    disabled={!couponCode.trim() || couponLoading}
                  >
                    Uygula
                  </Button>
                </View>
              )}
            </View>
          </>
        ) : null}

        {/* Step 3: Onay */}
        {step === 3 ? (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Ionicons name="receipt-outline" size={24} color={TarodanColors.primary} />
              <Text style={styles.sectionTitle}>Sipariş Özeti</Text>
            </View>

            {items.map(item => (
              <View key={item.id} style={styles.orderItem}>
                <Image
                  source={{ uri: transformImageUrl(item.imageUrl) }}
                  style={styles.orderItemImage}
                />
                <View style={styles.orderItemInfo}>
                  <Text style={styles.orderItemTitle} numberOfLines={2}>
                    {item.title}
                  </Text>
                  <Text style={styles.orderItemMeta}>
                    {asLabel(item.brand)} · {asLabel(item.scale)} · x{item.quantity}
                  </Text>
                </View>
                <Text style={styles.orderItemPrice}>
                  {formatPrice(item.price * item.quantity)}
                </Text>
              </View>
            ))}

            <Divider style={{ marginVertical: 12 }} />

            <View style={styles.securityNotice}>
              <Ionicons name="shield-checkmark" size={20} color={TarodanColors.success} />
              <View style={styles.securityContent}>
                <Text style={styles.securityTitle}>Güvenli Alışveriş</Text>
                <Text style={styles.securityText}>
                  Ödemeniz şifreli olarak iletilir. Ürün elinize ulaşana kadar paranız güvende
                  tutulur.
                </Text>
              </View>
            </View>
          </View>
        ) : null}

        {/* Sipariş Özeti — her adımda görünür */}
        <View style={styles.orderSummary}>
          <Text style={styles.orderSummaryTitle}>Ödeme Detayı</Text>
          <View style={styles.orderSummaryRow}>
            <Text style={styles.orderSummaryLabel}>Ara Toplam ({items.length} ürün)</Text>
            <Text style={styles.orderSummaryValue}>{formatPrice(subtotal)}</Text>
          </View>
          <View style={styles.orderSummaryRow}>
            <Text style={styles.orderSummaryLabel}>
              Kargo (
              {selectedCarrier === 'aras'
                ? 'Aras'
                : selectedCarrier === 'yurtici'
                ? 'Yurtiçi'
                : 'MNG'}
              )
            </Text>
            <Text style={styles.orderSummaryValue}>
              {effectiveShippingCity ? formatPrice(shippingCost) : 'İl seçin'}
            </Text>
          </View>
          {appliedDiscount ? (
            <View style={styles.orderSummaryRow}>
              <Text style={styles.orderSummaryLabel}>Kupon ({appliedDiscount.code})</Text>
              <Text style={[styles.orderSummaryValue, { color: TarodanColors.success }]}>
                -{formatPrice(appliedDiscount.amount)}
              </Text>
            </View>
          ) : null}
          <Divider style={{ marginVertical: 12 }} />
          <View style={styles.orderSummaryRow}>
            <Text style={styles.orderTotalLabel}>Toplam</Text>
            <Text style={styles.orderTotalValue}>{formatPrice(total)}</Text>
          </View>
        </View>

        <View style={{ height: 120 }} />
      </ScrollView>

      {/* Bottom Action */}
      <View style={styles.bottomBar}>
        {step < 3 ? (
          <Button
            mode="contained"
            buttonColor={TarodanColors.primary}
            onPress={handleNextStep}
            style={styles.actionButton}
            contentStyle={styles.actionButtonContent}
          >
            Devam Et
          </Button>
        ) : (
          <Button
            mode="contained"
            buttonColor={TarodanColors.primary}
            onPress={handleCheckout}
            loading={loading}
            disabled={loading}
            style={styles.actionButton}
            contentStyle={styles.actionButtonContent}
            icon="credit-card-check"
          >
            {loading ? 'İşleniyor...' : `Onayla ve Öde (${formatPrice(total)})`}
          </Button>
        )}
      </View>

      <Snackbar
        visible={snackbar.visible}
        onDismiss={() => setSnackbar({ visible: false, message: '' })}
        duration={3000}
        style={{ backgroundColor: TarodanColors.error }}
      >
        {snackbar.message}
      </Snackbar>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: TarodanColors.backgroundSecondary,
  },
  progressContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 20,
    backgroundColor: TarodanColors.background,
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
    color: TarodanColors.textOnPrimary,
  },
  progressLabel: {
    fontSize: 12,
    color: TarodanColors.textSecondary,
    marginLeft: 8,
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
    marginLeft: 12,
  },
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
    color: TarodanColors.warning,
    marginLeft: 8,
  },
  input: {
    marginBottom: 12,
    backgroundColor: TarodanColors.background,
  },
  helperText: {
    fontSize: 13,
    color: TarodanColors.textSecondary,
  },
  loginLink: {
    marginTop: 8,
  },
  loginLinkText: {
    color: TarodanColors.primary,
    fontSize: 14,
  },
  optionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
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
    marginLeft: 4,
  },
  optionTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: TarodanColors.textPrimary,
  },
  optionDescription: {
    fontSize: 12,
    color: TarodanColors.textSecondary,
    marginTop: 2,
  },
  optionPrice: {
    fontSize: 15,
    fontWeight: 'bold',
    color: TarodanColors.primary,
  },
  savedAddressRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: TarodanColors.surfaceVariant,
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  savedAddressRowActive: {
    borderColor: TarodanColors.primary,
    backgroundColor: TarodanColors.primaryLight,
  },
  addressTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: TarodanColors.textPrimary,
  },
  addressLine: {
    fontSize: 12,
    color: TarodanColors.textSecondary,
    marginTop: 2,
  },
  defaultBadge: {
    fontSize: 11,
    color: TarodanColors.success,
    fontWeight: '600',
  },
  saveCardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  saveCardLabel: {
    fontSize: 13,
    color: TarodanColors.textPrimary,
    flex: 1,
  },
  providerChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: TarodanColors.border,
  },
  providerChipActive: {
    backgroundColor: TarodanColors.primary,
    borderColor: TarodanColors.primary,
  },
  providerChipText: {
    fontSize: 13,
    color: TarodanColors.textPrimary,
    fontWeight: '600',
  },
  providerChipTextActive: {
    color: TarodanColors.textOnPrimary,
  },
  appliedCoupon: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: TarodanColors.successLight,
    padding: 12,
    borderRadius: 10,
  },
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
  securityNotice: {
    flexDirection: 'row',
    backgroundColor: TarodanColors.successLight,
    padding: 16,
    borderRadius: 12,
  },
  securityContent: {
    flex: 1,
    marginLeft: 12,
  },
  securityTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: TarodanColors.success,
  },
  securityText: {
    fontSize: 13,
    color: TarodanColors.success,
    marginTop: 4,
  },
  orderSummary: {
    backgroundColor: TarodanColors.background,
    borderRadius: 12,
    padding: 16,
  },
  orderSummaryTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: TarodanColors.textPrimary,
    marginBottom: 16,
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
  bottomBar: {
    backgroundColor: TarodanColors.background,
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: TarodanColors.border,
  },
  actionButton: {
    borderRadius: 12,
  },
  actionButtonContent: {
    paddingVertical: 8,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: TarodanColors.backgroundSecondary,
    padding: 20,
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
  },
});
