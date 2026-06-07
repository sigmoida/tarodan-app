import { useState } from 'react';
import { View, ScrollView, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { theme, Button, Card, Input, Radio, Text } from '@tarodan/ui-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../../src/stores/authStore';
import { membershipApi, paymentsApi } from '../../src/services/api';
import { captureException } from '../../src/services/sentry';

const { colors } = theme;

const MEMBERSHIP_TIERS = {
  basic: {
    id: 'basic',
    name: 'Temel',
    price: 49,
    period: 'ay',
    features: [
      '15 ücretsiz ilan',
      '50 toplam ilan',
      'Takas özelliği',
      'Koleksiyon oluşturma',
      '2 öne çıkan ilan',
    ],
    color: colors.info[600]!,
  },
  premium: {
    id: 'premium',
    name: 'Premium',
    price: 99,
    period: 'ay',
    features: [
      '50 ücretsiz ilan',
      '200 toplam ilan',
      'Takas özelliği',
      'Koleksiyon oluşturma',
      '10 öne çıkan ilan',
      'Reklamsız deneyim',
      'Öncelikli destek',
    ],
    color: colors.primary[600]!,
    popular: true,
  },
  business: {
    id: 'business',
    name: 'İş',
    price: 199,
    period: 'ay',
    features: [
      '200 ücretsiz ilan',
      '1000 toplam ilan',
      'Takas özelliği',
      'Koleksiyon oluşturma',
      '50 öne çıkan ilan',
      'Reklamsız deneyim',
      'Öncelikli destek',
      'API erişimi',
      'Özel satıcı rozeti',
    ],
    color: colors.warning[500]!,
  },
};

export default function MembershipCheckoutScreen() {
  const { tier: tierParam, period: periodParam } = useLocalSearchParams<{ tier: string; period?: string }>();
  const { isAuthenticated, refreshUserData } = useAuthStore();
  const [paymentMethod, setPaymentMethod] = useState('card');
  const [loading, setLoading] = useState(false);
  const [cardNumber, setCardNumber] = useState('');
  const [cardExpiry, setCardExpiry] = useState('');
  const [cardCvc, setCardCvc] = useState('');
  const [cardName, setCardName] = useState('');

  const tier = MEMBERSHIP_TIERS[tierParam as keyof typeof MEMBERSHIP_TIERS] || MEMBERSHIP_TIERS.premium;

  // Not authenticated redirect
  if (!isAuthenticated) {
    router.replace('/(auth)/login');
    return null;
  }

  const handlePayment = async () => {
    setLoading(true);
    const tierType = (tierParam as string) || 'premium';
    const billingPeriod: 'monthly' | 'yearly' = periodParam === 'yearly' ? 'yearly' : 'monthly';
    try {
      // Gerçek üyelik ödemesi — backend POST /membership/payments/initiate
      // (Önceden bu ekran setTimeout ile sahte başarı veriyordu; ödeme/abonelik oluşmuyordu.)
      const initResp: any = await membershipApi.initiatePayment({
        tierType,
        billingPeriod,
        provider: 'paytr',
      });
      const initData = initResp?.data?.data ?? initResp?.data ?? {};
      const paymentId = initData.paymentId || initData.id || initData.payment?.id;

      // PAYMENT_BYPASS=true ortamında API gerçek PayTR token üretmez; `useBypass: true`
      // döner ve istemcinin /payments/:id/bypass-complete çağırması beklenir
      // (sipariş checkout'u ile birebir aynı desen).
      if (initData.useBypass === true) {
        if (paymentId) {
          try {
            await paymentsApi.bypassComplete(paymentId);
          } catch (bypassErr: any) {
            captureException(bypassErr, {
              level: 'error',
              tags: { flow: 'membership.bypassComplete' },
              extra: { paymentId, tierType },
            });
          }
        }
        await refreshUserData();
        setLoading(false);
        router.replace(`/membership/success?tier=${tierType}` as any);
        return;
      }

      // Gerçek PayTR akışı — WebView ödeme ekranına yönlendir
      if (paymentId) {
        setLoading(false);
        router.replace({
          pathname: '/payment/[id]',
          params: { id: paymentId, provider: 'paytr', guest: '0', type: 'membership' },
        } as any);
        return;
      }

      throw new Error('Ödeme başlatılamadı (paymentId alınamadı).');
    } catch (e: any) {
      setLoading(false);
      captureException(e, {
        level: 'error',
        tags: { flow: 'membership.initiatePayment' },
        extra: { tierType, billingPeriod, status: e?.response?.status },
      });
      Alert.alert(
        'Ödeme Hatası',
        e?.response?.data?.message || 'Üyelik ödemesi başlatılamadı. Lütfen tekrar deneyin.',
      );
    }
  };

  const formatCardNumber = (text: string) => {
    const cleaned = text.replace(/\D/g, '');
    const groups = cleaned.match(/.{1,4}/g);
    return groups ? groups.join(' ').slice(0, 19) : cleaned;
  };

  const formatExpiry = (text: string) => {
    const cleaned = text.replace(/\D/g, '');
    if (cleaned.length >= 2) {
      return `${cleaned.slice(0, 2)}/${cleaned.slice(2, 4)}`;
    }
    return cleaned;
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={colors.white} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Üyelik Satın Al</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Selected Plan */}
        <Card style={[styles.planCard, { borderColor: tier.color }]}>
          <View style={styles.planHeader}>
            <View>
              <Text style={[styles.planName, { color: tier.color }]}>{tier.name}</Text>
              <Text style={styles.planPrice}>
                ₺{tier.price}<Text style={styles.planPeriod}>/{tier.period}</Text>
              </Text>
            </View>
            {'popular' in tier && tier.popular && (
              <View style={[styles.popularBadge, { backgroundColor: tier.color }]}>
                <Text style={styles.popularBadgeText}>Popüler</Text>
              </View>
            )}
          </View>
          <View style={styles.featuresCompact}>
            {tier.features.slice(0, 3).map((feature, index) => (
              <View key={index} style={styles.featureItem}>
                <Ionicons name="checkmark-circle" size={16} color={tier.color} />
                <Text style={styles.featureText}>{feature}</Text>
              </View>
            ))}
            {tier.features.length > 3 && (
              <Text style={styles.moreFeatures}>+{tier.features.length - 3} daha fazla</Text>
            )}
          </View>
        </Card>

        {/* Payment Method */}
        <Text style={styles.sectionTitle}>Ödeme Yöntemi</Text>
        <Card style={styles.paymentCard}>
          <TouchableOpacity
            style={styles.paymentOption}
            onPress={() => setPaymentMethod('card')}
          >
            <Radio
              checked={paymentMethod === 'card'}
              onChange={() => setPaymentMethod('card')}
              label=""
            />
            <Ionicons name="card-outline" size={24} color={colors.text.heading} />
            <Text style={styles.paymentOptionText}>Kredi/Banka Kartı</Text>
          </TouchableOpacity>
        </Card>

        {/* Card Details */}
        {paymentMethod === 'card' && (
          <View style={styles.cardForm}>
            <Input
              label="Kart Üzerindeki İsim"
              value={cardName}
              onChangeText={setCardName}
              containerStyle={styles.input}
            />
            <Input
              label="Kart Numarası"
              value={cardNumber}
              onChangeText={(text: string) => setCardNumber(formatCardNumber(text))}
              keyboardType="numeric"
              maxLength={19}
              leftIconName="card-outline"
              containerStyle={styles.input}
            />
            <View style={styles.cardRow}>
              <View style={styles.halfInput}>
                <Input
                  label="Son Kullanma"
                  value={cardExpiry}
                  onChangeText={(text: string) => setCardExpiry(formatExpiry(text))}
                  keyboardType="numeric"
                  maxLength={5}
                  placeholder="MM/YY"
                />
              </View>
              <View style={styles.halfInput}>
                <Input
                  label="CVC"
                  value={cardCvc}
                  onChangeText={setCardCvc}
                  keyboardType="numeric"
                  maxLength={4}
                  secureTextEntry
                />
              </View>
            </View>
          </View>
        )}

        {/* Order Summary */}
        <Text style={styles.sectionTitle}>Sipariş Özeti</Text>
        <Card style={styles.summaryCard}>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>{tier.name} Üyelik</Text>
            <Text style={styles.summaryValue}>₺{tier.price}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>KDV (%20)</Text>
            <Text style={styles.summaryValue}>₺{(tier.price * 0.2).toFixed(2)}</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.summaryRow}>
            <Text style={styles.totalLabel}>Toplam</Text>
            <Text style={styles.totalValue}>₺{(tier.price * 1.2).toFixed(2)}</Text>
          </View>
        </Card>

        {/* Terms */}
        <Text style={styles.terms}>
          Ödemeyi tamamlayarak{' '}
          <Text style={styles.termsLink} onPress={() => router.push('/terms')}>Kullanım Koşulları</Text>
          {' '}ve{' '}
          <Text style={styles.termsLink} onPress={() => router.push('/privacy')}>Gizlilik Politikası</Text>
          'nı kabul etmiş olursunuz.
        </Text>

        {/* Pay Button */}
        <Button
          variant="primary"
          title={loading ? 'İşleniyor...' : `₺${(tier.price * 1.2).toFixed(2)} Öde`}
          onPress={handlePayment}
          isLoading={loading}
          disabled={loading || !cardNumber || !cardExpiry || !cardCvc || !cardName}
          style={styles.payButton}
        />

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface.alt,
  },
  header: {
    backgroundColor: colors.primary[600]!,
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
    color: colors.white,
  },
  content: {
    flex: 1,
    padding: 16,
  },
  planCard: {
    marginBottom: 24,
    borderWidth: 2,
    backgroundColor: colors.surface.DEFAULT,
  },
  planHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  planName: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  planPrice: {
    fontSize: 32,
    fontWeight: 'bold',
    color: colors.text.heading,
    marginTop: 4,
  },
  planPeriod: {
    fontSize: 14,
    fontWeight: 'normal',
    color: colors.text.muted,
  },
  popularBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  popularBadgeText: {
    color: colors.white,
    fontSize: 12,
    fontWeight: 'bold',
  },
  featuresCompact: {
    gap: 8,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  featureText: {
    marginLeft: 8,
    fontSize: 14,
    color: colors.text.heading,
  },
  moreFeatures: {
    marginLeft: 24,
    fontSize: 13,
    color: colors.text.muted,
    fontStyle: 'italic',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: colors.text.heading,
    marginBottom: 12,
  },
  paymentCard: {
    marginBottom: 24,
    backgroundColor: colors.surface.DEFAULT,
  },
  paymentOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  paymentOptionText: {
    fontSize: 15,
    color: colors.text.heading,
  },
  cardForm: {
    marginBottom: 24,
  },
  input: {
    marginBottom: 12,
  },
  cardRow: {
    flexDirection: 'row',
    gap: 12,
  },
  halfInput: {
    flex: 1,
  },
  summaryCard: {
    marginBottom: 16,
    backgroundColor: colors.surface.DEFAULT,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  summaryLabel: {
    fontSize: 14,
    color: colors.text.muted,
  },
  summaryValue: {
    fontSize: 14,
    color: colors.text.heading,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border.DEFAULT,
    marginVertical: 12,
  },
  totalLabel: {
    fontSize: 16,
    fontWeight: 'bold',
    color: colors.text.heading,
  },
  totalValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.primary[600]!,
  },
  terms: {
    fontSize: 12,
    color: colors.text.muted,
    textAlign: 'center',
    marginBottom: 16,
    lineHeight: 18,
  },
  termsLink: {
    color: colors.primary[600]!,
    textDecorationLine: 'underline',
  },
  payButton: {
    borderRadius: 12,
  },
});
