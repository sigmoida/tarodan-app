import { useState, useEffect, useMemo, useRef } from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Image,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import {
  Button,
  Divider,
  Snackbar,
  Spinner,
  Switch,
  Text,
  Input,
  Radio,
  theme,
  appAlert,
} from '@tarodan/ui-native';
import {
  CityDistrictSelector,
  PhoneInput,
  ScreenHeader,
} from '../../src/components/common';
import { DEFAULT_COUNTRY_CODE, normalizePhoneForPayload } from '../../src/utils/phone';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useCartStore } from '../../src/stores/cartStore';
import { captureException } from '../../src/services/sentry';
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

const { colors } = theme;

interface ShippingAddressInput {
  fullName: string;
  phone: string;
  /** UI'da seçilen ülke kodu — payload'a phone prefix'i olarak gömülür, ayrıca gönderilmez. */
  phoneCountryCode?: string;
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

const STOCKOUT_KEYWORDS = [
  'satışta değil',
  'stokta yok',
  'başkası tarafından',
  'başka alıcıya satıldı',
  'stokta bulunmamaktadır',
];

/** Checkout idempotency anahtarı (RFC4122 v4 formatı; sunucu çift submit'i bununla dedupe eder) */
const generateUuidV4 = (): string =>
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });

const EMPTY_ADDRESS: ShippingAddressInput = {
  fullName: '',
  phone: '',
  phoneCountryCode: DEFAULT_COUNTRY_CODE,
  city: '',
  district: '',
  address: '',
  zipCode: '',
};

export default function CheckoutScreen() {
  const { buyNow } = useLocalSearchParams<{ buyNow?: string }>();
  const isBuyNow = buyNow === '1';
  const { items: cartItems, clearCart: clearCartStore, buyNowItem, clearBuyNow } = useCartStore();
  const { isAuthenticated, user } = useAuthStore();

  // Hızlı Al akışında sepet yerine tek ürün kullanılır; sepet kirlenmez.
  const items = useMemo(
    // Hızlı Al modunda yalnızca buyNowItem; yoksa boş (sepete düşüp yanlış ürün alınmasın).
    () => (isBuyNow ? (buyNowItem ? [buyNowItem] : []) : cartItems),
    [isBuyNow, buyNowItem, cartItems],
  );
  // Akış bitince doğru kaynağı temizle (Hızlı Al → buyNowItem, normal → sepet).
  const finalizeCart = () => {
    if (isBuyNow) clearBuyNow();
    else clearCartStore();
  };

  // ---------- Step ----------
  const [step, setStep] = useState(1); // 1: Adres, 2: Ödeme, 3: Onay

  // ---------- İdempotensi ----------
  // Aynı sepet için tekrar denemeler (çift dokunma, ağ hatası sonrası retry)
  // sunucuda AYNI grubu döndürür. Sepet değişirse anahtar yenilenir ki eski
  // grup replay edilmesin.
  const idempotencyKeyRef = useRef(generateUuidV4());
  useEffect(() => {
    idempotencyKeyRef.current = generateUuidV4();
  }, [items]);

  // ---------- Konuk bilgileri (yalnızca isAuthenticated === false) ----------
  const [guestName, setGuestName] = useState('');
  const [guestEmail, setGuestEmail] = useState('');
  const [guestPhone, setGuestPhone] = useState('');
  const [guestPhoneCountryCode, setGuestPhoneCountryCode] = useState(DEFAULT_COUNTRY_CODE);

  // ---------- Adres seçimi ----------
  /** Üye için kayıtlı adresten seçim. 'new' = yeni adres formu. */
  const [selectedAddressId, setSelectedAddressId] = useState<string | 'new'>('new');
  const [shippingAddress, setShippingAddress] = useState<ShippingAddressInput>(EMPTY_ADDRESS);

  /** Fatura adresi: teslimat ile aynı mı? */
  const [billingDifferent, setBillingDifferent] = useState(false);
  const [selectedBillingAddressId, setSelectedBillingAddressId] = useState<string | 'new'>('new');
  const [billingAddress, setBillingAddress] = useState<ShippingAddressInput>(EMPTY_ADDRESS);

  // ---------- Kargo / Ödeme tercihleri ----------
  // Tek kargo firması: Sürat Kargo (web ile parite — apps/web/src/app/checkout/page.tsx).
  const selectedCarrier = 'surat' as const;
  // Sadece PayTR kullanılıyor (iyzico kaldırıldı — web ile parite)
  const paymentProvider = 'paytr' as const;
  const [shippingCost, setShippingCost] = useState(0);
  const [shippingLoading, setShippingLoading] = useState(false);

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

  const subtotal = useMemo(
    () => items.reduce((sum, it) => sum + it.price * it.quantity, 0),
    [items],
  );
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
        setShippingCost(baseRate);
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
    if (guestPhone.replace(/\D/g, '').length < 10) return 'Geçerli bir telefon numarası girin';
    return null;
  };

  const validateInlineAddress = (a: ShippingAddressInput, label = 'Teslimat') => {
    if (!a.fullName.trim()) return `${label} adresi için ad soyad gerekli`;
    if (a.phone.replace(/\D/g, '').length < 10)
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
      // Ödeme PayTR'nin barındırılan 3DS sayfasında alınır; uygulamada kart
      // formu yok, ek doğrulama gerekmez.
      setStep(3);
      return;
    }
  };

  // ---------- Address payload helper'ları ----------
  const buildShippingPayload = (): { id?: string; inline?: OrderAddressInput } => {
    if (isAuthenticated && selectedAddressId !== 'new') {
      return { id: selectedAddressId };
    }
    // Form alanı boşsa konuk telefonu fallback; her durumda "+90…" olarak normalize edilir.
    const phone = shippingAddress.phone.trim()
      ? normalizePhoneForPayload(shippingAddress.phone, shippingAddress.phoneCountryCode ?? DEFAULT_COUNTRY_CODE)
      : normalizePhoneForPayload(guestPhone, guestPhoneCountryCode);
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
        phone: normalizePhoneForPayload(billingAddress.phone, billingAddress.phoneCountryCode ?? DEFAULT_COUNTRY_CODE),
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
        appAlert('Hata', `Geçersiz ürün ID: ${item.title}`);
        return;
      }
    }

    if (loading) return; // çift dokunma koruması (sunucu tarafı idempotencyKey ile ayrıca korur)
    setLoading(true);
    try {
      const shipping = buildShippingPayload();
      const billing = buildBillingPayload();

      // Tüm sepet TEK çağrıda, tek CheckoutGroup altında sipariş edilir;
      // tek ödeme grubu kapsar (eski ürün-başına-sipariş döngüsü 2. siparişi ödemesiz bırakıyordu).
      const checkoutPayload = {
        items: items.map((item) => ({ productId: item.productId })),
        idempotencyKey: idempotencyKeyRef.current,
        shippingAddressId: shipping.id,
        shippingAddress: shipping.inline,
        billingAddressId: billing?.id,
        billingAddress: billing?.inline,
      };

      const response = isAuthenticated && user
        ? await ordersApi.checkout(checkoutPayload)
        : await ordersApi.checkoutGuest({
            items: checkoutPayload.items,
            idempotencyKey: checkoutPayload.idempotencyKey,
            email: guestEmail.trim().toLowerCase(),
            emailVerificationCode: '',
            phone: normalizePhoneForPayload(guestPhone, guestPhoneCountryCode),
            guestName: guestName.trim(),
            shippingAddress: shipping.inline!,
            billingAddress: billing?.inline,
          });

      const data: any = (response.data as any)?.data ?? response.data;
      const checkoutGroupId: string | null = data?.checkoutGroupId ?? null;
      const firstOrderId: string | null = data?.orders?.[0]?.orderId ?? null;

      if (!checkoutGroupId || !firstOrderId) {
        appAlert(
          'Hata',
          'Sipariş oluşturuldu fakat ödeme başlatılamadı. Siparişlerim sayfasından devam edebilirsiniz.',
        );
        finalizeCart();
        router.replace('/orders' as any);
        return;
      }

      // Ödeme her zaman PayTR'nin barındırılan 3DS sayfasında alınır (kayıtlı
      // kart / Direct API yok). Grup ödemesi: tek ödeme tüm siparişleri kapsar.
      try {
        const initResp: any = isAuthenticated
          ? await paymentsApi.initiateGroup(checkoutGroupId, paymentProvider)
          : await paymentsApi.initiateGroupGuest(checkoutGroupId, paymentProvider);
        const initData = initResp.data?.data ?? initResp.data ?? {};
        const paymentId =
          initData.paymentId || initData.id || initData.payment?.id || firstOrderId;

        // PAYMENT_BYPASS=true ortamında API gerçek PayTR token üretmez; bunun
        // yerine `useBypass: true` döner ve istemcinin POST
        // /payments/:id/bypass-complete çağırması beklenir. Aksi halde WebView
        // boş iframe ile çakılır (B-001).
        if (initData.useBypass === true) {
          try {
            await paymentsApi.bypassComplete(paymentId);
          } catch (bypassErr: any) {
            captureException(bypassErr, {
              level: 'error',
              tags: { flow: 'checkout.bypassComplete' },
              extra: { paymentId, orderId: firstOrderId, checkoutGroupId },
            });
          }
          finalizeCart();
          router.replace({
            pathname: '/payment/success',
            params: { paymentId, orderId: firstOrderId, groupId: checkoutGroupId },
          } as any);
          return;
        }

        // Token burada üretildi; ekran tekrar initiate etmesin diye URL'i geçiyoruz
        // (PayTR token'ları tek kullanımlık — çift initiate ilk token'ı çöpe atardı).
        const paymentUrl: string | undefined = initData.paymentUrl;
        finalizeCart();
        router.replace({
          pathname: '/payment/[id]',
          params: {
            id: paymentId,
            orderId: firstOrderId,
            groupId: checkoutGroupId,
            provider: paymentProvider,
            guest: isAuthenticated ? '0' : '1',
            ...(paymentUrl ? { paymentUrl } : {}),
          },
        } as any);
      } catch (payErr: any) {
        const msg =
          payErr?.response?.data?.message ||
          'Ödeme başlatılamadı. Siparişinizi daha sonra siparişlerim üzerinden tamamlayabilirsiniz.';
        const status = payErr?.response?.status;
        const isStockout =
          (status === 400 || status === 409) &&
          typeof msg === 'string' &&
          STOCKOUT_KEYWORDS.some((kw) => msg.toLowerCase().includes(kw.toLowerCase()));
        if (isStockout) {
          // API hata gövdesinde başarısız ürünün ID'si döner; yoksa ilk ürün
          const productId = payErr?.response?.data?.productId || items[0]?.productId;
          if (productId) {
            router.replace({
              pathname: '/products/unavailable/[productId]',
              params: { productId },
            } as any);
            return;
          }
        }
        appAlert('Ödeme Başlatılamadı', msg, [
          { text: 'Tamam', onPress: () => router.replace(isAuthenticated ? '/orders' : '/' as any) },
        ]);
      }
    } catch (error: any) {
      console.error('Checkout error:', error);
      captureException(error, {
        level: 'error',
        tags: { flow: 'checkout' },
        extra: { status: error?.response?.status },
      });
      const errorMessage =
        error.response?.data?.message ||
        error.response?.data?.error ||
        (Array.isArray(error.response?.data?.message)
          ? error.response?.data?.message.join(', ')
          : 'Sipariş oluşturulamadı');
      const status = error?.response?.status;
      const isStockout =
        (status === 400 || status === 409) &&
        typeof errorMessage === 'string' &&
        STOCKOUT_KEYWORDS.some((kw) => errorMessage.toLowerCase().includes(kw.toLowerCase()));
      if (isStockout) {
        const productId = error?.response?.data?.productId || items[0]?.productId;
        if (productId) {
          router.replace({
            pathname: '/products/unavailable/[productId]',
            params: { productId },
          } as any);
          return;
        }
      }
      appAlert('Hata', errorMessage);
    } finally {
      setLoading(false);
    }
  };

  // ---------- Erken çıkışlar ----------
  if (items.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Ionicons name="cart-outline" size={80} color={colors.text.muted} />
        <Text style={styles.emptyTitle}>Sepetiniz Boş</Text>
        <Text style={styles.emptySubtitle}>Ödeme yapabilmek için sepetinize ürün ekleyin</Text>
        <Button
          variant="primary"
          title="Alışverişe Başla"
          onPress={() => router.replace('/' as any)}
          style={{ marginTop: 20, alignSelf: 'center' }}
        />
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
                <Radio
                  checked={selectedId === a.id}
                  onChange={() => setSelectedId(a.id)}
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
              <Radio
                checked={selectedId === 'new'}
                onChange={() => setSelectedId('new')}
              />
              <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}>
                <Ionicons name="add-circle-outline" size={18} color={colors.primary[600]!} />
                <Text style={[styles.addressTitle, { marginLeft: 8 }]}>Yeni Adres Ekle</Text>
              </View>
            </TouchableOpacity>
          </View>
        ) : null}

        {/* Yeni adres formu (konuk veya üye + 'new' seçildi) */}
        {selectedId === 'new' ? (
          <View>
            <Input
              label="Ad Soyad *"
              value={inline.fullName}
              onChangeText={(text: string) => setInline({ ...inline, fullName: text })}
              containerStyle={styles.input}
            />
            <PhoneInput
              label="Telefon *"
              countryCode={inline.phoneCountryCode ?? DEFAULT_COUNTRY_CODE}
              onCountryCodeChange={(code) => setInline((prev) => ({ ...prev, phoneCountryCode: code }))}
              phone={inline.phone}
              onPhoneChange={(phone) => setInline((prev) => ({ ...prev, phone }))}
              containerStyle={styles.input}
            />
            <CityDistrictSelector
              city={inline.city}
              district={inline.district}
              // Fonksiyonel güncelleme şart: il seçilince CityDistrictSelector
              // aynı anda hem onChangeCity hem onChangeDistrict('') çağırır;
              // stale obje ile yazılırsa ikinci çağrı şehri ezer (il seçilemiyor).
              onChangeCity={(city) => setInline((prev) => ({ ...prev, city }))}
              onChangeDistrict={(district) => setInline((prev) => ({ ...prev, district }))}
            />
            <Input
              label="Açık Adres *"
              value={inline.address}
              onChangeText={(text: string) => setInline({ ...inline, address: text })}
              multiline
              numberOfLines={3}
              containerStyle={styles.input}
            />
            <Input
              label="Posta Kodu"
              value={inline.zipCode || ''}
              onChangeText={(text: string) => setInline({ ...inline, zipCode: text })}
              keyboardType="number-pad"
              maxLength={5}
              containerStyle={styles.input}
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
                <Ionicons name="checkmark" size={16} color={colors.white} />
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
                  <Ionicons name="person-outline" size={24} color={colors.primary[600]!} />
                  <Text style={styles.sectionTitle}>İletişim Bilgileri</Text>
                </View>
                <View style={styles.guestNotice}>
                  <Ionicons
                    name="information-circle-outline"
                    size={20}
                    color={colors.warning[600]!}
                  />
                  <Text style={styles.guestNoticeText}>
                    Üye olmadan alışveriş yapıyorsunuz. Siparişinizi takip etmek için e-posta
                    adresinizi girin.
                  </Text>
                </View>
                <Input
                  label="Ad Soyad *"
                  value={guestName}
                  onChangeText={setGuestName}
                  containerStyle={styles.input}
                />
                <Input
                  label="E-posta *"
                  value={guestEmail}
                  onChangeText={setGuestEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  containerStyle={styles.input}
                />
                <PhoneInput
                  label="Telefon *"
                  countryCode={guestPhoneCountryCode}
                  onCountryCodeChange={setGuestPhoneCountryCode}
                  phone={guestPhone}
                  onPhoneChange={setGuestPhone}
                  containerStyle={styles.input}
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
                <Ionicons name="location-outline" size={24} color={colors.primary[600]!} />
                <Text style={styles.sectionTitle}>Teslimat Adresi</Text>
              </View>
              {renderAddressSelector(false)}
            </View>

            {/* Fatura Adresi (toggle) */}
            <View style={styles.section}>
              <View style={[styles.sectionHeader, { justifyContent: 'space-between' }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Ionicons name="receipt-outline" size={24} color={colors.primary[600]!} />
                  <Text style={styles.sectionTitle}>Fatura Adresi</Text>
                </View>
                <Switch
                  value={billingDifferent}
                  onValueChange={setBillingDifferent}
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
                <Ionicons name="car-outline" size={24} color={colors.primary[600]!} />
                <Text style={styles.sectionTitle}>Kargo Seçimi</Text>
              </View>

              {/* Tek kargo firması: Sürat Kargo (web ile parite — UI seçici yok) */}
              <View style={[styles.optionCard, styles.optionCardActive]}>
                <Radio checked onChange={() => {}} />
                <View style={styles.optionContent}>
                  <Text style={styles.optionTitle}>Sürat Kargo</Text>
                  <Text style={styles.optionDescription}>2-4 iş günü teslimat</Text>
                </View>
                {shippingLoading ? (
                  <Spinner size="sm" />
                ) : (
                  <Text style={styles.optionPrice}>{formatPrice(shippingCost)}</Text>
                )}
              </View>
            </View>

            {/* Ödeme Yöntemi */}
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Ionicons name="card-outline" size={24} color={colors.primary[600]!} />
                <Text style={styles.sectionTitle}>Ödeme Yöntemi</Text>
              </View>

              {/* PayTR bilgilendirme — kart bilgisi uygulamaya girilmez (PCI). */}
              <View style={styles.paytrNotice}>
                <Ionicons name="lock-closed" size={18} color={colors.success[600]!} />
                <Text style={styles.paytrNoticeText}>
                  Ödemeniz PayTR güvenli altyapısı üzerinden alınır. Kart bilgileriniz Tarodan'a
                  kaydedilmez; bir sonraki adımda PayTR'nin 3D Secure ödeme sayfası açılır.
                </Text>
              </View>

              {/* Provider: sadece PayTR (iyzico kaldırıldı — web ile parite) */}
            </View>

            {/* Kupon */}
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Ionicons name="pricetag-outline" size={22} color={colors.primary[600]!} />
                <Text style={styles.sectionTitle}>İndirim Kuponu</Text>
              </View>
              {appliedDiscount ? (
                <View style={styles.appliedCoupon}>
                  <Ionicons name="checkmark-circle" size={18} color={colors.success[600]!} />
                  <View style={{ flex: 1, marginLeft: 8 }}>
                    <Text style={styles.optionTitle}>
                      {appliedDiscount.code} · -{formatPrice(appliedDiscount.amount)}
                    </Text>
                  </View>
                  <Button
                    variant="ghost"
                    title="Kaldır"
                    onPress={() => setAppliedDiscount(null)}
                  />
                </View>
              ) : (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Input
                    placeholder="Kupon kodu"
                    value={couponCode}
                    onChangeText={(v: string) => setCouponCode(v.toUpperCase())}
                    autoCapitalize="characters"
                    containerStyle={{ ...styles.input, flex: 1, marginBottom: 0 }}
                  />
                  <Button
                    variant="primary"
                    title="Uygula"
                    onPress={handleApplyCoupon}
                    isLoading={couponLoading}
                    disabled={!couponCode.trim() || couponLoading}
                  />
                </View>
              )}
            </View>
          </>
        ) : null}

        {/* Step 3: Onay */}
        {step === 3 ? (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Ionicons name="receipt-outline" size={24} color={colors.primary[600]!} />
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
              <Ionicons name="shield-checkmark" size={20} color={colors.success[600]!} />
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
            <Text style={styles.orderSummaryLabel}>Kargo (Sürat)</Text>
            <Text style={styles.orderSummaryValue}>
              {effectiveShippingCity ? formatPrice(shippingCost) : 'İl seçin'}
            </Text>
          </View>
          {appliedDiscount ? (
            <View style={styles.orderSummaryRow}>
              <Text style={styles.orderSummaryLabel}>Kupon ({appliedDiscount.code})</Text>
              <Text style={[styles.orderSummaryValue, { color: colors.success[600]! }]}>
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
            variant="primary"
            title="Devam Et"
            onPress={handleNextStep}
            icon="arrow-forward"
            iconPosition="right"
            style={[styles.actionButton, styles.continueButton]}
          />
        ) : (
          <Button
            variant="primary"
            title={loading ? 'İşleniyor...' : `Onayla ve Öde (${formatPrice(total)})`}
            onPress={handleCheckout}
            isLoading={loading}
            disabled={loading}
            fullWidth
            style={styles.actionButton}
            icon="card-outline"
          />
        )}
      </View>

      <Snackbar
        visible={snackbar.visible}
        onDismiss={() => setSnackbar({ visible: false, message: '' })}
        duration={3000}
        variant="danger"
      >
        {snackbar.message}
      </Snackbar>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface.alt,
  },
  progressContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 20,
    backgroundColor: colors.surface.DEFAULT,
  },
  progressStep: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  progressCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.border.DEFAULT,
    justifyContent: 'center',
    alignItems: 'center',
  },
  progressCircleActive: {
    backgroundColor: colors.primary[600]!,
  },
  progressNumber: {
    fontSize: 14,
    fontWeight: 'bold',
    color: colors.text.muted,
  },
  progressNumberActive: {
    color: colors.white,
  },
  progressLabel: {
    fontSize: 12,
    color: colors.text.muted,
    marginLeft: 8,
  },
  progressLabelActive: {
    color: colors.primary[600]!,
    fontWeight: '600',
  },
  progressLine: {
    width: 30,
    height: 2,
    backgroundColor: colors.border.DEFAULT,
    marginHorizontal: 8,
  },
  progressLineActive: {
    backgroundColor: colors.primary[600]!,
  },
  content: {
    flex: 1,
    padding: 16,
  },
  section: {
    backgroundColor: colors.surface.DEFAULT,
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
    color: colors.text.heading,
    marginLeft: 12,
  },
  guestNotice: {
    flexDirection: 'row',
    backgroundColor: colors.warning[50]!,
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  guestNoticeText: {
    flex: 1,
    fontSize: 13,
    color: colors.warning[600]!,
    marginLeft: 8,
  },
  input: {
    marginBottom: 12,
    backgroundColor: colors.surface.DEFAULT,
  },
  helperText: {
    fontSize: 13,
    color: colors.text.muted,
  },
  loginLink: {
    marginTop: 8,
  },
  loginLinkText: {
    color: colors.primary[600]!,
    fontSize: 14,
  },
  optionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    backgroundColor: colors.surface.alt,
    borderRadius: 12,
    marginBottom: 10,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  optionCardActive: {
    borderColor: colors.primary[600]!,
    backgroundColor: colors.primary[50]!,
  },
  optionContent: {
    flex: 1,
    marginLeft: 4,
  },
  optionTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text.heading,
  },
  optionDescription: {
    fontSize: 12,
    color: colors.text.muted,
    marginTop: 2,
  },
  optionPrice: {
    fontSize: 15,
    fontWeight: 'bold',
    color: colors.primary[600]!,
  },
  savedAddressRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    backgroundColor: colors.surface.alt,
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  savedAddressRowActive: {
    borderColor: colors.primary[600]!,
    backgroundColor: colors.primary[50]!,
  },
  addressTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text.heading,
  },
  addressLine: {
    fontSize: 12,
    color: colors.text.muted,
    marginTop: 2,
  },
  defaultBadge: {
    fontSize: 11,
    color: colors.success[600]!,
    fontWeight: '600',
  },
  paytrNotice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    padding: 12,
    borderRadius: 10,
    backgroundColor: colors.success[50]!,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.success[600]!,
    marginTop: 4,
  },
  paytrNoticeText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 17,
    color: colors.success[800] ?? colors.success[600]!,
  },
  providerChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border.DEFAULT,
  },
  providerChipActive: {
    backgroundColor: colors.primary[600]!,
    borderColor: colors.primary[600]!,
  },
  providerChipText: {
    fontSize: 13,
    color: colors.text.heading,
    fontWeight: '600',
  },
  providerChipTextActive: {
    color: colors.white,
  },
  appliedCoupon: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.success[50]!,
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
    backgroundColor: colors.surface.alt,
  },
  orderItemInfo: {
    flex: 1,
    marginLeft: 12,
  },
  orderItemTitle: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text.heading,
  },
  orderItemMeta: {
    fontSize: 12,
    color: colors.text.muted,
    marginTop: 2,
  },
  orderItemPrice: {
    fontSize: 16,
    fontWeight: 'bold',
    color: colors.primary[600]!,
  },
  securityNotice: {
    flexDirection: 'row',
    backgroundColor: colors.success[50]!,
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
    color: colors.success[600]!,
  },
  securityText: {
    fontSize: 13,
    color: colors.success[600]!,
    marginTop: 4,
  },
  orderSummary: {
    backgroundColor: colors.surface.DEFAULT,
    borderRadius: 12,
    padding: 16,
  },
  orderSummaryTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: colors.text.heading,
    marginBottom: 16,
  },
  orderSummaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  orderSummaryLabel: {
    fontSize: 14,
    color: colors.text.muted,
  },
  orderSummaryValue: {
    fontSize: 14,
    color: colors.text.heading,
  },
  orderTotalLabel: {
    fontSize: 16,
    fontWeight: 'bold',
    color: colors.text.heading,
  },
  orderTotalValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.primary[600]!,
  },
  bottomBar: {
    backgroundColor: colors.surface.DEFAULT,
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: colors.border.DEFAULT,
  },
  actionButton: {
    borderRadius: 12,
  },
  continueButton: {
    alignSelf: 'flex-end',
    paddingHorizontal: 32,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.surface.alt,
    padding: 20,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.text.heading,
    marginTop: 16,
  },
  emptySubtitle: {
    fontSize: 14,
    color: colors.text.muted,
    textAlign: 'center',
    marginTop: 8,
  },
});
