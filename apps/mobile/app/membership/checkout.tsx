import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, TextInput, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { TarodanColors } from '../../src/theme/colors';
import { useAuthStore } from '../../src/stores/authStore';
import { api, membershipApi, paymentsApi } from '../../src/services/api';

const TIER_NAMES: Record<string, string> = {
  basic: 'Temel',
  premium: 'Premium',
  business: 'Business',
};

const TIER_COLORS: Record<string, string> = {
  basic: '#3B82F6',
  premium: '#8B5CF6',
  business: '#F59E0B',
};

const TIER_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  basic: 'star-outline',
  premium: 'diamond-outline',
  business: 'briefcase-outline',
};

interface PlatformSettings {
  basic_monthly_price?: number;
  basic_yearly_price?: number;
  premium_monthly_price?: number;
  premium_yearly_price?: number;
  business_monthly_price?: number;
  business_yearly_price?: number;
  yearly_discount_percentage?: number;
}

export default function MembershipCheckoutScreen() {
  const { tier, period } = useLocalSearchParams<{ tier: string; period: string }>();
  const { isAuthenticated } = useAuthStore();

  const [settings, setSettings] = useState<PlatformSettings>({});
  const [cardHolder, setCardHolder] = useState('');
  const [cardNumber, setCardNumber] = useState('');
  const [cardExpiry, setCardExpiry] = useState('');
  const [cardCvv, setCardCvv] = useState('');
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [loading, setLoading] = useState(false);
  const [fetchingPrice, setFetchingPrice] = useState(true);

  const tierType = (tier || 'premium') as string;
  const billingPeriod = (period === 'yearly' ? 'yearly' : 'monthly') as 'monthly' | 'yearly';
  const color = TIER_COLORS[tierType] || TarodanColors.primary;
  const tierName = TIER_NAMES[tierType] || 'Premium';

  useEffect(() => {
    if (!isAuthenticated) {
      router.replace('/(auth)/login');
      return;
    }
    fetchSettings();
  }, [isAuthenticated]);

  const fetchSettings = async () => {
    setFetchingPrice(true);
    try {
      const res = await api.get('/admin/settings/public');
      setSettings(res.data || {});
    } catch {
      // defaults will be used
    } finally {
      setFetchingPrice(false);
    }
  };

  const getPrice = (): number => {
    const yearlyKey = `${tierType}_yearly_price` as keyof PlatformSettings;
    const monthlyKey = `${tierType}_monthly_price` as keyof PlatformSettings;
    const monthlyPrice = (settings[monthlyKey] as number | undefined) ?? getDefaultMonthly();

    if (billingPeriod === 'yearly') {
      const yearlyPrice = settings[yearlyKey] as number | undefined;
      if (yearlyPrice) return yearlyPrice;
      const discount = settings.yearly_discount_percentage ?? 20;
      return Math.round(monthlyPrice * 12 * (1 - discount / 100));
    }
    return monthlyPrice;
  };

  const getDefaultMonthly = (): number => {
    switch (tierType) {
      case 'basic': return 49;
      case 'premium': return 99;
      case 'business': return 499;
      default: return 99;
    }
  };

  const price = getPrice();

  const formatCardNumber = (text: string): string => {
    const cleaned = text.replace(/\D/g, '');
    const groups = cleaned.match(/.{1,4}/g);
    return groups ? groups.join(' ').slice(0, 19) : cleaned;
  };

  const formatExpiry = (text: string): string => {
    const cleaned = text.replace(/\D/g, '');
    if (cleaned.length >= 2) {
      return `${cleaned.slice(0, 2)}/${cleaned.slice(2, 4)}`;
    }
    return cleaned;
  };

  const handleSubscribe = async () => {
    const rawCard = cardNumber.replace(/\s/g, '');
    if (rawCard.length < 15) {
      Alert.alert('Hata', 'Geçerli bir kart numarası giriniz.');
      return;
    }
    if (!agreedToTerms) {
      Alert.alert('Uyarı', 'Kullanım koşullarını kabul etmelisiniz.');
      return;
    }

    setLoading(true);
    try {
      const subscribeRes = await membershipApi.subscribe({
        tierType: tierType as string,
        billingPeriod: billingPeriod as 'monthly' | 'yearly',
      });

      const payment = subscribeRes.data?.payment || subscribeRes.data;
      const paymentId = payment?.id || payment?.paymentId;
      const paymentUrl = payment?.paymentUrl;

      if (!paymentId) {
        router.replace('/membership/success');
        return;
      }

      const statusRes = await paymentsApi.getStatusLight(paymentId);
      const statusData = statusRes.data?.data || statusRes.data;
      const status = statusData?.status;
      const useBypass = statusData?.useBypass;

      if (status === 'completed' || status === 'success') {
        router.replace('/membership/success');
        return;
      }

      if (useBypass) {
        try {
          await paymentsApi.bypassComplete(paymentId, rawCard);
          router.replace('/membership/success');
        } catch (bypassErr: any) {
          const msg = bypassErr?.response?.data?.message || bypassErr?.message || 'Ödeme tamamlanamadı.';
          Alert.alert('Ödeme Hatası', msg);
        }
      } else if (paymentUrl) {
        router.replace(`/payment/${paymentId}` as any);
      } else {
        router.replace(`/payment/${paymentId}` as any);
      }
    } catch (err: any) {
      const msg = err?.response?.data?.message || err?.message || 'Abonelik oluşturulamadı.';
      Alert.alert('Hata', msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="arrow-back" size={24} color={TarodanColors.textOnPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Üyelik Satın Al</Text>
        <View style={{ width: 24 }} />
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          {/* Plan Summary */}
          <View style={[styles.planSummary, { borderColor: color }]}>
            <View style={[styles.planIconCircle, { backgroundColor: color + '15' }]}>
              <Ionicons name={TIER_ICONS[tierType] || 'diamond-outline'} size={28} color={color} />
            </View>
            <View style={styles.planInfo}>
              <Text style={[styles.planName, { color }]}>{tierName}</Text>
              <Text style={styles.planPeriodLabel}>
                {billingPeriod === 'monthly' ? 'Aylık Abonelik' : 'Yıllık Abonelik'}
              </Text>
            </View>
            {fetchingPrice ? (
              <ActivityIndicator size="small" color={color} />
            ) : (
              <View style={styles.planPriceBlock}>
                <Text style={styles.planPrice}>{price.toLocaleString('tr-TR')} ₺</Text>
                <Text style={styles.planPriceSub}>/{billingPeriod === 'monthly' ? 'ay' : 'yıl'}</Text>
              </View>
            )}
          </View>

          {/* Card Form */}
          <Text style={styles.sectionTitle}>Kart Bilgileri</Text>

          <View style={styles.formCard}>
            <Text style={styles.inputLabel}>Kart Üzerindeki İsim</Text>
            <View style={styles.inputRow}>
              <Ionicons name="person-outline" size={20} color={TarodanColors.textTertiary} style={styles.inputIcon} />
              <TextInput
                style={styles.textInput}
                value={cardHolder}
                onChangeText={setCardHolder}
                placeholder="AD SOYAD"
                placeholderTextColor={TarodanColors.textTertiary}
                autoCapitalize="characters"
              />
            </View>

            <Text style={styles.inputLabel}>Kart Numarası</Text>
            <View style={styles.inputRow}>
              <Ionicons name="card-outline" size={20} color={TarodanColors.textTertiary} style={styles.inputIcon} />
              <TextInput
                style={styles.textInput}
                value={cardNumber}
                onChangeText={(t) => setCardNumber(formatCardNumber(t))}
                placeholder="0000 0000 0000 0000"
                placeholderTextColor={TarodanColors.textTertiary}
                keyboardType="numeric"
                maxLength={19}
              />
            </View>

            <View style={styles.cardRow}>
              <View style={styles.cardHalf}>
                <Text style={styles.inputLabel}>Son Kullanma</Text>
                <View style={styles.inputRow}>
                  <Ionicons name="calendar-outline" size={18} color={TarodanColors.textTertiary} style={styles.inputIcon} />
                  <TextInput
                    style={styles.textInput}
                    value={cardExpiry}
                    onChangeText={(t) => setCardExpiry(formatExpiry(t))}
                    placeholder="AA/YY"
                    placeholderTextColor={TarodanColors.textTertiary}
                    keyboardType="numeric"
                    maxLength={5}
                  />
                </View>
              </View>
              <View style={styles.cardHalf}>
                <Text style={styles.inputLabel}>CVV</Text>
                <View style={styles.inputRow}>
                  <Ionicons name="lock-closed-outline" size={18} color={TarodanColors.textTertiary} style={styles.inputIcon} />
                  <TextInput
                    style={styles.textInput}
                    value={cardCvv}
                    onChangeText={(t) => setCardCvv(t.replace(/\D/g, '').slice(0, 4))}
                    placeholder="•••"
                    placeholderTextColor={TarodanColors.textTertiary}
                    keyboardType="numeric"
                    maxLength={4}
                    secureTextEntry
                  />
                </View>
              </View>
            </View>
          </View>

          {/* Order Summary */}
          <Text style={styles.sectionTitle}>Sipariş Özeti</Text>

          <View style={styles.summaryCard}>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>{tierName} Üyelik ({billingPeriod === 'monthly' ? 'Aylık' : 'Yıllık'})</Text>
              <Text style={styles.summaryValue}>{price.toLocaleString('tr-TR')} ₺</Text>
            </View>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryRow}>
              <Text style={styles.summaryTotal}>Toplam</Text>
              <Text style={[styles.summaryTotalValue, { color }]}>{price.toLocaleString('tr-TR')} ₺</Text>
            </View>
          </View>

          {/* Terms Checkbox */}
          <TouchableOpacity
            style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 20, paddingHorizontal: 4 }}
            onPress={() => setAgreedToTerms(!agreedToTerms)}
            activeOpacity={0.7}
          >
            <Ionicons
              name={agreedToTerms ? 'checkbox' : 'square-outline'}
              size={24}
              color={agreedToTerms ? TarodanColors.primary : TarodanColors.textTertiary}
            />
            <Text style={[styles.terms, { marginBottom: 0, marginLeft: 8, textAlign: 'left' }]}>
              <Text style={styles.termsLink} onPress={() => router.push('/terms')}>Kullanım Koşulları</Text>
              {' '}ve{' '}
              <Text style={styles.termsLink} onPress={() => router.push('/privacy')}>Gizlilik Politikası</Text>
              'nı kabul ediyorum.
            </Text>
          </TouchableOpacity>

          {/* Pay Button */}
          <TouchableOpacity
            style={[
              styles.payButton,
              { backgroundColor: color },
              (loading || cardNumber.replace(/\s/g, '').length < 15 || !agreedToTerms) && styles.payButtonDisabled,
            ]}
            onPress={handleSubscribe}
            disabled={loading || cardNumber.replace(/\s/g, '').length < 15 || !agreedToTerms}
          >
            {loading ? (
              <ActivityIndicator size="small" color="#FFF" />
            ) : (
              <>
                <Ionicons name="lock-closed" size={18} color="#FFF" />
                <Text style={styles.payButtonText}>{price.toLocaleString('tr-TR')} ₺ Öde</Text>
              </>
            )}
          </TouchableOpacity>

          <View style={{ height: 40 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: TarodanColors.backgroundSecondary,
  },
  header: {
    backgroundColor: TarodanColors.primary,
    paddingVertical: 14,
    paddingHorizontal: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: TarodanColors.textOnPrimary,
  },
  scrollView: {
    flex: 1,
    padding: 16,
  },

  // Plan Summary
  planSummary: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: TarodanColors.background,
    borderRadius: 14,
    borderWidth: 2,
    padding: 16,
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  planIconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  planInfo: {
    flex: 1,
    marginLeft: 14,
  },
  planName: {
    fontSize: 18,
    fontWeight: '700',
  },
  planPeriodLabel: {
    fontSize: 13,
    color: TarodanColors.textSecondary,
    marginTop: 2,
  },
  planPriceBlock: {
    alignItems: 'flex-end',
  },
  planPrice: {
    fontSize: 22,
    fontWeight: '700',
    color: TarodanColors.textPrimary,
  },
  planPriceSub: {
    fontSize: 12,
    color: TarodanColors.textTertiary,
  },

  // Form
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: TarodanColors.textPrimary,
    marginBottom: 12,
  },
  formCard: {
    backgroundColor: TarodanColors.background,
    borderRadius: 14,
    padding: 16,
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: TarodanColors.textSecondary,
    marginBottom: 6,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: TarodanColors.backgroundSecondary,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: TarodanColors.border,
    paddingHorizontal: 12,
    marginBottom: 14,
    height: 48,
  },
  inputIcon: {
    marginRight: 8,
  },
  textInput: {
    flex: 1,
    fontSize: 15,
    color: TarodanColors.textPrimary,
    padding: 0,
  },
  cardRow: {
    flexDirection: 'row',
    gap: 12,
  },
  cardHalf: {
    flex: 1,
  },

  // Summary
  summaryCard: {
    backgroundColor: TarodanColors.background,
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  summaryLabel: {
    fontSize: 14,
    color: TarodanColors.textSecondary,
  },
  summaryValue: {
    fontSize: 14,
    color: TarodanColors.textPrimary,
    fontWeight: '500',
  },
  summaryDivider: {
    height: 1,
    backgroundColor: TarodanColors.border,
    marginVertical: 12,
  },
  summaryTotal: {
    fontSize: 16,
    fontWeight: '700',
    color: TarodanColors.textPrimary,
  },
  summaryTotalValue: {
    fontSize: 18,
    fontWeight: '700',
  },

  // Terms
  terms: {
    fontSize: 12,
    color: TarodanColors.textSecondary,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 20,
    paddingHorizontal: 8,
  },
  termsLink: {
    color: TarodanColors.primary,
    textDecorationLine: 'underline',
  },

  // Pay Button
  payButton: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 16,
    borderRadius: 12,
    gap: 8,
  },
  payButtonDisabled: {
    opacity: 0.5,
  },
  payButtonText: {
    fontSize: 17,
    fontWeight: '700',
    color: '#FFF',
  },
});
