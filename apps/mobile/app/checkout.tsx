import { useState, useEffect } from 'react';
import { View, ScrollView, StyleSheet, TouchableOpacity, Image, KeyboardAvoidingView, Platform, Alert } from 'react-native';
import { Text, TextInput, Button, RadioButton, Divider, ActivityIndicator, Snackbar } from 'react-native-paper';
import { router } from 'expo-router';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { TarodanColors } from '../src/theme';
import { useCartStore } from '../src/stores/cartStore';
import { api } from '../src/services/api';

interface ShippingAddress {
  fullName: string;
  phone: string;
  city: string;
  district: string;
  address: string;
  zipCode?: string;
}

const TURKISH_CITIES = [
  'Adana', 'Ankara', 'Antalya', 'Bursa', 'Denizli', 'Diyarbakır', 'Eskişehir', 
  'Gaziantep', 'İstanbul', 'İzmir', 'Kayseri', 'Kocaeli', 'Konya', 'Mersin', 
  'Muğla', 'Samsun', 'Sakarya', 'Trabzon'
];

export default function CheckoutScreen() {
  const { items, getSubtotal, clearCart } = useCartStore();
  
  // Step management
  const [step, setStep] = useState(1); // 1: Address, 2: Payment, 3: Confirm
  
  // Guest info
  const [guestName, setGuestName] = useState('');
  const [guestEmail, setGuestEmail] = useState('');
  const [guestPhone, setGuestPhone] = useState('');
  
  // Shipping address
  const [shippingAddress, setShippingAddress] = useState<ShippingAddress>({
    fullName: '',
    phone: '',
    city: '',
    district: '',
    address: '',
    zipCode: '',
  });
  
  // Payment & Shipping
  const [selectedCarrier, setSelectedCarrier] = useState<'aras' | 'yurtici'>('aras');
  const [paymentProvider, setPaymentProvider] = useState<'iyzico' | 'paytr'>('iyzico');
  const [shippingCost, setShippingCost] = useState(0);
  const [shippingLoading, setShippingLoading] = useState(false);
  
  // UI State
  const [loading, setLoading] = useState(false);
  const [snackbarVisible, setSnackbarVisible] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');
  
  const subtotal = getSubtotal();
  const total = subtotal + shippingCost;

  // Calculate shipping when city changes
  useEffect(() => {
    if (shippingAddress.city) {
      calculateShipping();
    }
  }, [shippingAddress.city, selectedCarrier]);

  const calculateShipping = async () => {
    setShippingLoading(true);
    try {
      // Try API first
      const response = await api.get('/shipping/rates', {
        params: {
          city: shippingAddress.city,
          carrier: selectedCarrier,
          weight: 0.5,
        }
      }).catch(() => null);

      if (response?.data?.rate) {
        setShippingCost(response.data.rate);
      } else {
        // Fallback calculation
        const isIstanbul = shippingAddress.city.toLowerCase().includes('istanbul');
        const baseRate = isIstanbul ? 34.90 : 49.90;
        const carrierExtra = selectedCarrier === 'yurtici' ? 5 : 0;
        setShippingCost(baseRate + carrierExtra);
      }
    } catch (error) {
      setShippingCost(49.90);
    } finally {
      setShippingLoading(false);
    }
  };

  const validateStep1 = (): boolean => {
    if (!guestName.trim()) {
      showSnackbar('Lütfen adınızı girin');
      return false;
    }
    if (!guestEmail.trim() || !guestEmail.includes('@')) {
      showSnackbar('Geçerli bir e-posta adresi girin');
      return false;
    }
    if (!guestPhone.trim() || guestPhone.length < 10) {
      showSnackbar('Geçerli bir telefon numarası girin');
      return false;
    }
    if (!shippingAddress.fullName.trim()) {
      showSnackbar('Teslimat adresi için ad soyad girin');
      return false;
    }
    if (!shippingAddress.city.trim()) {
      showSnackbar('Şehir seçin');
      return false;
    }
    if (!shippingAddress.district.trim()) {
      showSnackbar('İlçe girin');
      return false;
    }
    if (!shippingAddress.address.trim()) {
      showSnackbar('Açık adres girin');
      return false;
    }
    return true;
  };

  const showSnackbar = (message: string) => {
    setSnackbarMessage(message);
    setSnackbarVisible(true);
  };

  const handleNextStep = () => {
    if (step === 1 && validateStep1()) {
      setStep(2);
    } else if (step === 2) {
      setStep(3);
    }
  };

  const handleCheckout = async () => {
    if (items.length === 0) {
      showSnackbar('Sepetiniz boş');
      return;
    }

    setLoading(true);
    try {
      // Create order for each item
      for (const item of items) {
        await api.post('/orders/guest', {
          productId: item.productId,
          email: guestEmail,
          phone: guestPhone,
          guestName: guestName,
          shippingAddress: {
            fullName: shippingAddress.fullName,
            phone: shippingAddress.phone || guestPhone,
            city: shippingAddress.city,
            district: shippingAddress.district,
            address: shippingAddress.address,
            zipCode: shippingAddress.zipCode,
          },
        });
      }

      // Clear cart and show success
      clearCart();
      
      Alert.alert(
        'Sipariş Tamamlandı! 🎉',
        `Siparişiniz başarıyla oluşturuldu. Sipariş detayları ${guestEmail} adresine gönderilecek.`,
        [
          {
            text: 'Tamam',
            onPress: () => router.replace('/'),
          },
        ]
      );
    } catch (error: any) {
      console.error('Checkout error:', error);
      showSnackbar(error.response?.data?.message || 'Sipariş oluşturulamadı');
    } finally {
      setLoading(false);
    }
  };

  if (items.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Ionicons name="cart-outline" size={80} color={TarodanColors.textSecondary} />
        <Text style={styles.emptyTitle}>Sepetiniz Boş</Text>
        <Text style={styles.emptySubtitle}>Ödeme yapabilmek için sepetinize ürün ekleyin</Text>
        <Button
          mode="contained"
          buttonColor={TarodanColors.primary}
          onPress={() => router.replace('/')}
          style={{ marginTop: 20 }}
        >
          Alışverişe Başla
        </Button>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView 
      style={styles.container} 
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => step > 1 ? setStep(step - 1) : router.back()}>
          <Ionicons name="arrow-back" size={24} color={TarodanColors.textOnPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>
          {step === 1 ? 'Teslimat Bilgileri' : step === 2 ? 'Ödeme' : 'Sipariş Onayı'}
        </Text>
        <View style={{ width: 24 }} />
      </View>

      {/* Progress Steps */}
      <View style={styles.progressContainer}>
        {[1, 2, 3].map((s) => (
          <View key={s} style={styles.progressStep}>
            <View style={[
              styles.progressCircle,
              step >= s && styles.progressCircleActive
            ]}>
              {step > s ? (
                <Ionicons name="checkmark" size={16} color="#fff" />
              ) : (
                <Text style={[
                  styles.progressNumber,
                  step >= s && styles.progressNumberActive
                ]}>{s}</Text>
              )}
            </View>
            <Text style={[
              styles.progressLabel,
              step >= s && styles.progressLabelActive
            ]}>
              {s === 1 ? 'Adres' : s === 2 ? 'Ödeme' : 'Onay'}
            </Text>
            {s < 3 && <View style={[styles.progressLine, step > s && styles.progressLineActive]} />}
          </View>
        ))}
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Step 1: Address */}
        {step === 1 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Ionicons name="person-outline" size={24} color={TarodanColors.primary} />
              <Text style={styles.sectionTitle}>İletişim Bilgileri</Text>
            </View>
            
            <View style={styles.guestNotice}>
              <Ionicons name="information-circle-outline" size={20} color={TarodanColors.warning} />
              <Text style={styles.guestNoticeText}>
                Üye olmadan alışveriş yapıyorsunuz. Siparişinizi takip etmek için e-posta adresinizi girin.
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
              style={styles.input}
              keyboardType="email-address"
              autoCapitalize="none"
              outlineColor={TarodanColors.border}
              activeOutlineColor={TarodanColors.primary}
            />
            <TextInput
              label="Telefon *"
              value={guestPhone}
              onChangeText={setGuestPhone}
              mode="outlined"
              style={styles.input}
              keyboardType="phone-pad"
              placeholder="+90 5XX XXX XX XX"
              outlineColor={TarodanColors.border}
              activeOutlineColor={TarodanColors.primary}
            />

            <Divider style={{ marginVertical: 20 }} />

            <View style={styles.sectionHeader}>
              <Ionicons name="location-outline" size={24} color={TarodanColors.primary} />
              <Text style={styles.sectionTitle}>Teslimat Adresi</Text>
            </View>

            <TextInput
              label="Ad Soyad *"
              value={shippingAddress.fullName}
              onChangeText={(text) => setShippingAddress({ ...shippingAddress, fullName: text })}
              mode="outlined"
              style={styles.input}
              outlineColor={TarodanColors.border}
              activeOutlineColor={TarodanColors.primary}
            />
            <TextInput
              label="Telefon"
              value={shippingAddress.phone}
              onChangeText={(text) => setShippingAddress({ ...shippingAddress, phone: text })}
              mode="outlined"
              style={styles.input}
              keyboardType="phone-pad"
              outlineColor={TarodanColors.border}
              activeOutlineColor={TarodanColors.primary}
            />
            
            <View style={styles.citySelector}>
              <Text style={styles.inputLabel}>Şehir *</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                {TURKISH_CITIES.map((city) => (
                  <TouchableOpacity
                    key={city}
                    style={[
                      styles.cityChip,
                      shippingAddress.city === city && styles.cityChipActive
                    ]}
                    onPress={() => setShippingAddress({ ...shippingAddress, city })}
                  >
                    <Text style={[
                      styles.cityChipText,
                      shippingAddress.city === city && styles.cityChipTextActive
                    ]}>{city}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>

            <TextInput
              label="İlçe *"
              value={shippingAddress.district}
              onChangeText={(text) => setShippingAddress({ ...shippingAddress, district: text })}
              mode="outlined"
              style={styles.input}
              outlineColor={TarodanColors.border}
              activeOutlineColor={TarodanColors.primary}
            />
            <TextInput
              label="Açık Adres *"
              value={shippingAddress.address}
              onChangeText={(text) => setShippingAddress({ ...shippingAddress, address: text })}
              mode="outlined"
              style={styles.input}
              multiline
              numberOfLines={3}
              outlineColor={TarodanColors.border}
              activeOutlineColor={TarodanColors.primary}
            />

            <TouchableOpacity 
              style={styles.loginLink}
              onPress={() => router.push('/(auth)/login')}
            >
              <Text style={styles.loginLinkText}>Üye misiniz? Giriş yapın →</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Step 2: Payment */}
        {step === 2 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Ionicons name="car-outline" size={24} color={TarodanColors.primary} />
              <Text style={styles.sectionTitle}>Kargo Seçimi</Text>
            </View>

            <RadioButton.Group onValueChange={(value) => setSelectedCarrier(value as 'aras' | 'yurtici')} value={selectedCarrier}>
              <TouchableOpacity 
                style={[styles.optionCard, selectedCarrier === 'aras' && styles.optionCardActive]}
                onPress={() => setSelectedCarrier('aras')}
              >
                <RadioButton value="aras" color={TarodanColors.primary} />
                <View style={styles.optionContent}>
                  <Text style={styles.optionTitle}>Aras Kargo</Text>
                  <Text style={styles.optionDescription}>2-3 iş günü teslimat</Text>
                </View>
                <Text style={styles.optionPrice}>
                  {shippingLoading ? '...' : `₺${(shippingAddress.city?.toLowerCase().includes('istanbul') ? 34.90 : 49.90).toFixed(2)}`}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity 
                style={[styles.optionCard, selectedCarrier === 'yurtici' && styles.optionCardActive]}
                onPress={() => setSelectedCarrier('yurtici')}
              >
                <RadioButton value="yurtici" color={TarodanColors.primary} />
                <View style={styles.optionContent}>
                  <Text style={styles.optionTitle}>Yurtiçi Kargo</Text>
                  <Text style={styles.optionDescription}>2-4 iş günü teslimat</Text>
                </View>
                <Text style={styles.optionPrice}>
                  {shippingLoading ? '...' : `₺${((shippingAddress.city?.toLowerCase().includes('istanbul') ? 34.90 : 49.90) + 5).toFixed(2)}`}
                </Text>
              </TouchableOpacity>
            </RadioButton.Group>

            <Divider style={{ marginVertical: 20 }} />

            <View style={styles.sectionHeader}>
              <Ionicons name="card-outline" size={24} color={TarodanColors.primary} />
              <Text style={styles.sectionTitle}>Ödeme Yöntemi</Text>
            </View>

            <RadioButton.Group onValueChange={(value) => setPaymentProvider(value as 'iyzico' | 'paytr')} value={paymentProvider}>
              <TouchableOpacity 
                style={[styles.optionCard, paymentProvider === 'iyzico' && styles.optionCardActive]}
                onPress={() => setPaymentProvider('iyzico')}
              >
                <RadioButton value="iyzico" color={TarodanColors.primary} />
                <View style={styles.optionContent}>
                  <Text style={styles.optionTitle}>iyzico ile Öde</Text>
                  <Text style={styles.optionDescription}>Kredi kartı, banka kartı veya iyzico bakiyesi</Text>
                </View>
                <Text style={styles.paymentIcon}>💳</Text>
              </TouchableOpacity>

              <TouchableOpacity 
                style={[styles.optionCard, paymentProvider === 'paytr' && styles.optionCardActive]}
                onPress={() => setPaymentProvider('paytr')}
              >
                <RadioButton value="paytr" color={TarodanColors.primary} />
                <View style={styles.optionContent}>
                  <Text style={styles.optionTitle}>PayTR ile Öde</Text>
                  <Text style={styles.optionDescription}>Kredi kartı ile güvenli ödeme</Text>
                </View>
                <Text style={styles.paymentIcon}>🏦</Text>
              </TouchableOpacity>
            </RadioButton.Group>
          </View>
        )}

        {/* Step 3: Confirmation */}
        {step === 3 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Ionicons name="receipt-outline" size={24} color={TarodanColors.primary} />
              <Text style={styles.sectionTitle}>Sipariş Özeti</Text>
            </View>

            {/* Order Items */}
            {items.map((item) => (
              <View key={item.id} style={styles.orderItem}>
                <Image source={{ uri: item.imageUrl }} style={styles.orderItemImage} />
                <View style={styles.orderItemInfo}>
                  <Text style={styles.orderItemTitle} numberOfLines={2}>{item.title}</Text>
                  <Text style={styles.orderItemMeta}>
                    {item.brand} • {item.scale} • x{item.quantity}
                  </Text>
                </View>
                <Text style={styles.orderItemPrice}>₺{(item.price * item.quantity).toLocaleString('tr-TR')}</Text>
              </View>
            ))}

            <Divider style={{ marginVertical: 16 }} />

            {/* Delivery Info */}
            <View style={styles.summaryCard}>
              <View style={styles.summaryRow}>
                <Ionicons name="location-outline" size={20} color={TarodanColors.textSecondary} />
                <View style={styles.summaryContent}>
                  <Text style={styles.summaryLabel}>Teslimat Adresi</Text>
                  <Text style={styles.summaryValue}>
                    {shippingAddress.fullName}, {shippingAddress.address}, {shippingAddress.district}/{shippingAddress.city}
                  </Text>
                </View>
              </View>
              <View style={styles.summaryRow}>
                <Ionicons name="mail-outline" size={20} color={TarodanColors.textSecondary} />
                <View style={styles.summaryContent}>
                  <Text style={styles.summaryLabel}>E-posta</Text>
                  <Text style={styles.summaryValue}>{guestEmail}</Text>
                </View>
              </View>
              <View style={styles.summaryRow}>
                <Ionicons name="card-outline" size={20} color={TarodanColors.textSecondary} />
                <View style={styles.summaryContent}>
                  <Text style={styles.summaryLabel}>Ödeme Yöntemi</Text>
                  <Text style={styles.summaryValue}>
                    {paymentProvider === 'iyzico' ? 'iyzico ile Öde' : 'PayTR ile Öde'}
                  </Text>
                </View>
              </View>
            </View>

            {/* Security Notice */}
            <View style={styles.securityNotice}>
              <Ionicons name="shield-checkmark" size={24} color={TarodanColors.success} />
              <View style={styles.securityContent}>
                <Text style={styles.securityTitle}>Güvenli Alışveriş</Text>
                <Text style={styles.securityText}>
                  Ödemeniz şifreli olarak iletilir. Ürün elinize ulaşana kadar ödemeniz güvende tutulur.
                </Text>
              </View>
            </View>
          </View>
        )}

        {/* Order Summary (always visible) */}
        <View style={styles.orderSummary}>
          <Text style={styles.orderSummaryTitle}>Ödeme Detayı</Text>
          <View style={styles.orderSummaryRow}>
            <Text style={styles.orderSummaryLabel}>Ara Toplam ({items.length} ürün)</Text>
            <Text style={styles.orderSummaryValue}>₺{subtotal.toLocaleString('tr-TR')}</Text>
          </View>
          <View style={styles.orderSummaryRow}>
            <Text style={styles.orderSummaryLabel}>Kargo ({selectedCarrier === 'aras' ? 'Aras' : 'Yurtiçi'})</Text>
            <Text style={styles.orderSummaryValue}>
              {shippingCost > 0 ? `₺${shippingCost.toFixed(2)}` : 'Adres seçin'}
            </Text>
          </View>
          <Divider style={{ marginVertical: 12 }} />
          <View style={styles.orderSummaryRow}>
            <Text style={styles.orderTotalLabel}>Toplam</Text>
            <Text style={styles.orderTotalValue}>₺{total.toLocaleString('tr-TR')}</Text>
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
            {loading ? 'İşleniyor...' : `Onayla ve Öde (₺${total.toLocaleString('tr-TR')})`}
          </Button>
        )}
      </View>

      <Snackbar
        visible={snackbarVisible}
        onDismiss={() => setSnackbarVisible(false)}
        duration={3000}
        style={{ backgroundColor: TarodanColors.error }}
      >
        {snackbarMessage}
      </Snackbar>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: TarodanColors.backgroundSecondary,
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
    backgroundColor: '#FFF8E1',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  guestNoticeText: {
    flex: 1,
    fontSize: 13,
    color: '#F57C00',
    marginLeft: 8,
  },
  input: {
    marginBottom: 12,
    backgroundColor: TarodanColors.background,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: TarodanColors.textPrimary,
    marginBottom: 8,
  },
  citySelector: {
    marginBottom: 16,
  },
  cityChip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: TarodanColors.surfaceVariant,
    marginRight: 8,
    borderWidth: 1,
    borderColor: TarodanColors.border,
  },
  cityChipActive: {
    backgroundColor: TarodanColors.primaryLight,
    borderColor: TarodanColors.primary,
  },
  cityChipText: {
    fontSize: 14,
    color: TarodanColors.textPrimary,
  },
  cityChipTextActive: {
    color: TarodanColors.primary,
    fontWeight: '600',
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
    padding: 16,
    backgroundColor: TarodanColors.surfaceVariant,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  optionCardActive: {
    borderColor: TarodanColors.primary,
    backgroundColor: TarodanColors.primaryLight,
  },
  optionContent: {
    flex: 1,
    marginLeft: 8,
  },
  optionTitle: {
    fontSize: 16,
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
  paymentIcon: {
    fontSize: 24,
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
  summaryCard: {
    backgroundColor: TarodanColors.surfaceVariant,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  summaryContent: {
    flex: 1,
    marginLeft: 12,
  },
  summaryLabel: {
    fontSize: 12,
    color: TarodanColors.textSecondary,
  },
  summaryValue: {
    fontSize: 14,
    color: TarodanColors.textPrimary,
    marginTop: 2,
  },
  securityNotice: {
    flexDirection: 'row',
    backgroundColor: '#E8F5E9',
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
    color: '#388E3C',
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
