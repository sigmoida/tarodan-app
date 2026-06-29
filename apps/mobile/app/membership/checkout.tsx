import { useEffect, useState } from 'react';
import { View, ScrollView, StyleSheet } from 'react-native';
import { theme, Button, Card, Text, ScreenHeader, appAlert } from '@tarodan/ui-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../../src/stores/authStore';
import { membershipApi, paymentsApi } from '../../src/services/api';
import { captureException } from '../../src/services/sentry';

const { colors } = theme;

// API erişilemezse son çare fallback — DB MembershipTier seed değerleriyle hizalı
// (basic 49.99 / premium 99.99 / business 249.99). Normalde fiyat getTiers'tan gelir.
const DEFAULT_MONTHLY: Record<string, number> = {
  basic: 49.99,
  premium: 99.99,
  business: 249.99,
};

// Fiyatları her zaman 2 ondalıkla göster (admin + membership/index ile aynı biçim);
// ham hesap artığı 3 ondalığı (örn. 419,916) önler → "419,92".
const formatTL = (n: number): string =>
  n.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

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
    price: 499,
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
  const [loading, setLoading] = useState(false);
  const [tierPrices, setTierPrices] = useState<{ monthlyPrice: number; yearlyPrice: number } | null>(null);

  const tier = MEMBERSHIP_TIERS[tierParam as keyof typeof MEMBERSHIP_TIERS] || MEMBERSHIP_TIERS.premium;
  const tierType = (tierParam as string) || 'premium';
  const billingPeriod: 'monthly' | 'yearly' = periodParam === 'yearly' ? 'yearly' : 'monthly';

  // TEK FİYAT KAYNAĞI: DB MembershipTier (GET /membership/tiers) — backend ödemede
  // tam bunu tahsil eder. Web checkout ile birebir aynı. Eskiden /admin/settings/public
  // + hardcoded fallback'ler gösterilen tutarı çekilenle uyumsuzlaştırıyordu
  // (UI ₺499 / charge ₺249.99).
  useEffect(() => {
    let active = true;
    membershipApi
      .getTiers()
      .then((res) => {
        if (!active) return;
        const list: any[] = res.data?.data ?? res.data ?? [];
        const t = list.find((x) => x.type === tierType);
        if (t) setTierPrices({ monthlyPrice: Number(t.monthlyPrice), yearlyPrice: Number(t.yearlyPrice) });
      })
      .catch(() => {
        // fallback varsayılan fiyatlara düşülür
      });
    return () => {
      active = false;
    };
  }, [tierType]);

  // Ekranda gösterilecek fiyat (KDV dahil, nihai tahsil tutarı) — seçili periyoda göre.
  const displayPrice: number = (() => {
    if (tierPrices) {
      return billingPeriod === 'yearly' ? tierPrices.yearlyPrice : tierPrices.monthlyPrice;
    }
    // getTiers henüz dönmediyse / başarısızsa son çare fallback.
    const monthly = DEFAULT_MONTHLY[tierType] ?? tier.price;
    if (billingPeriod === 'yearly') return Math.round(monthly * 12 * 0.8);
    return monthly;
  })();

  const periodLabel = billingPeriod === 'yearly' ? 'yıl' : 'ay';

  // Not authenticated redirect
  if (!isAuthenticated) {
    router.replace('/(auth)/login');
    return null;
  }

  const handlePayment = async () => {
    setLoading(true);
    try {
      // Ödeme PayTR'nin barındırılan 3DS sayfasında alınır; uygulamada kart
      // formu yok (web ile parite).
      // subscribe: hedef kademeyi (ör. premium) past_due olarak AYARLAR ve ardından
      // ödemeyi başlatır (paymentId/paymentUrl/useBypass döner). Web ile parite.
      // Doğrudan initiatePayment çağırırsak backend ödemeyi kullanıcının MEVCUT
      // kademesine göre yapar → yükseltme gerçekleşmez, plan "Temel" kalır.
      const initResp: any = await membershipApi.subscribe({ tierType, billingPeriod });
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

      // Gerçek PayTR akışı — WebView ödeme ekranına yönlendir.
      // Token burada üretildi; URL'i geçerek ekranın tekrar initiate etmesini önle.
      if (paymentId) {
        const paymentUrl: string | undefined = initData.paymentUrl;
        setLoading(false);
        router.replace({
          pathname: '/payment/[id]',
          params: {
            id: paymentId,
            provider: 'paytr',
            guest: '0',
            type: 'membership',
            // success ekranı doğru kademeyi göstersin diye taşı (yoksa hep "Premium" yazardı).
            tier: tierType,
            ...(paymentUrl ? { paymentUrl } : {}),
          },
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
      appAlert(
        'Ödeme Hatası',
        e?.response?.data?.message || 'Üyelik ödemesi başlatılamadı. Lütfen tekrar deneyin.',
      );
    }
  };

  return (
    <View style={styles.container}>
      <ScreenHeader title="Üyelik Satın Al" onBack={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)'))} />

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Selected Plan */}
        <Card style={[styles.planCard, { borderColor: tier.color }]}>
          <View style={styles.planHeader}>
            <View>
              <Text style={[styles.planName, { color: tier.color }]}>{tier.name}</Text>
              <Text style={styles.planPrice}>
                ₺{formatTL(displayPrice)}<Text style={styles.planPeriod}>/{periodLabel}</Text>
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
          <View style={styles.paymentOption}>
            <Ionicons name="lock-closed" size={20} color={colors.success[600]!} />
            <Text style={styles.paymentOptionText}>
              Ödemeniz PayTR güvenli altyapısı üzerinden alınır. Kart bilgileriniz
              Tarodan'a kaydedilmez; bir sonraki adımda PayTR'nin 3D Secure ödeme
              sayfası açılır.
            </Text>
          </View>
        </Card>

        {/* Order Summary */}
        <Text style={styles.sectionTitle}>Sipariş Özeti</Text>
        <Card style={styles.summaryCard}>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>{tier.name} Üyelik ({periodLabel === 'yıl' ? 'Yıllık' : 'Aylık'})</Text>
            <Text style={styles.summaryValue}>₺{formatTL(displayPrice)}</Text>
          </View>
          <Text style={styles.vatNote}>KDV dahildir</Text>
          <View style={styles.divider} />
          <View style={styles.summaryRow}>
            <Text style={styles.totalLabel}>Toplam</Text>
            <Text style={styles.totalValue}>₺{formatTL(displayPrice)}</Text>
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
          title={loading ? 'İşleniyor...' : `₺${formatTL(displayPrice)} Öde`}
          onPress={handlePayment}
          isLoading={loading}
          disabled={loading}
          fullWidth
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
    alignItems: 'flex-start',
    gap: 8,
  },
  paymentOptionText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
    color: colors.text.muted,
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
  vatNote: {
    fontSize: 12,
    color: colors.text.muted,
    marginTop: 2,
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
