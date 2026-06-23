import { View, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { useState } from 'react';
import { router } from 'expo-router';
import { useMutation } from '@tanstack/react-query';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { theme, Text, Card, Button, Chip, Radio, ScreenHeader, appAlert } from '@tarodan/ui-native';
import { membershipApi } from '../src/services/api';
import { useAuthStore } from '../src/stores/authStore';

const { colors } = theme;

type PlanType = 'monthly' | 'annual';

const PLANS = {
  monthly: {
    id: 'premium-monthly',
    name: 'Aylık Premium',
    price: 99,
    period: 'ay',
    savings: null,
  },
  annual: {
    id: 'premium-annual',
    name: 'Yıllık Premium',
    price: 990,
    period: 'yıl',
    monthlyPrice: 82.5,
    savings: '2 ay bedava!',
  },
};

const PREMIUM_FEATURES = [
  { icon: 'pricetag', title: 'Sınırsız İlan', description: 'İstediğiniz kadar ilan verin' },
  { icon: 'camera', title: '15 Fotoğraf', description: 'Her ilana 15 fotoğraf yükleyin' },
  { icon: 'swap-horizontal', title: 'Takas Özelliği', description: 'Takas teklifleri yapın ve alın' },
  { icon: 'images', title: 'Dijital Garaj', description: 'Koleksiyonlarınızı sergileyin' },
  { icon: 'star', title: 'Öne Çıkan İlanlar', description: '3 adet öne çıkarma hakkı' },
  { icon: 'infinite', title: 'Süresiz İlanlar', description: 'İlanlar expire olmaz' },
  { icon: 'shield-checkmark', title: 'Takas Koruması', description: 'Güvenli takas programı' },
  { icon: 'analytics', title: 'Detaylı Analitik', description: 'Gelişmiş performans metrikleri' },
  { icon: 'chatbubbles', title: 'Sınırsız Mesaj', description: 'Günlük mesaj limiti yok' },
  { icon: 'ribbon', title: 'Premium Rozet', description: 'Profilinizde Premium badge' },
  { icon: 'close-circle', title: 'Reklamsız', description: 'Hiç reklam görmeden gezinin' },
  { icon: 'headset', title: 'Öncelikli Destek', description: '12 saat içinde yanıt' },
];

const COMPARISON = [
  { feature: 'İlan Sayısı', free: '10', premium: 'Sınırsız' },
  { feature: 'Fotoğraf / İlan', free: '5', premium: '15' },
  { feature: 'İlan Süresi', free: '60 gün', premium: 'Süresiz' },
  { feature: 'Takas Özelliği', free: '✕', premium: '✓' },
  { feature: 'Dijital Garaj', free: '✕', premium: '✓' },
  { feature: 'Öne Çıkan İlan', free: '✕', premium: '3 adet' },
  { feature: 'Günlük Mesaj', free: '50', premium: 'Sınırsız' },
  { feature: 'Reklam', free: 'Var', premium: 'Yok' },
  { feature: 'Destek', free: '24-48 saat', premium: '12 saat' },
];

export default function UpgradeScreen() {
  const { isAuthenticated, user, refreshUserData } = useAuthStore();
  const [selectedPlan, setSelectedPlan] = useState<PlanType>('annual');

  const isPremium = user?.membershipTier === 'premium';

  // Subscribe mutation — backend POST /membership/subscribe { tierType, billingPeriod }
  const subscribeMutation = useMutation({
    mutationFn: async (planId: string) => {
      // planId formatı: 'premium-annual' | 'premium-monthly' (örn.) → tierType + billingPeriod
      const isAnnual = planId.includes('annual') || selectedPlan === 'annual';
      const tierType = planId.split('-')[0] || 'premium';
      return membershipApi.subscribe({
        tierType,
        billingPeriod: isAnnual ? 'yearly' : 'monthly',
      });
    },
    onSuccess: (response: any) => {
      const data = response?.data?.data ?? response?.data ?? {};
      const paymentId = data.paymentId || data.id;
      const paymentUrl: string | undefined = data.paymentUrl;

      // Bypass (dev/test) ya da ödeme gerektirmeyen durum → üyelik zaten güncellendi.
      if (data.useBypass === true || (!paymentUrl && !paymentId)) {
        refreshUserData();
        appAlert('Üyelik', 'Üyeliğiniz güncellendi.');
        return;
      }

      // Gerçek PayTR akışı — dış tarayıcı (Linking) yerine app içi WebView ödeme ekranı.
      router.push({
        pathname: '/payment/[id]',
        params: {
          id: paymentId,
          provider: 'paytr',
          guest: '0',
          type: 'membership',
          ...(paymentUrl ? { paymentUrl } : {}),
        },
      } as any);
    },
    onError: () => {
      appAlert('Hata', 'Abonelik oluşturulamadı. Lütfen tekrar deneyin.');
    },
  });

  const handleSubscribe = () => {
    if (!isAuthenticated) {
      router.push('/(auth)/login');
      return;
    }

    const plan = PLANS[selectedPlan];
    subscribeMutation.mutate(plan.id);
  };

  return (
    <View style={styles.container}>
      <ScreenHeader title="Premium Üyelik" onBack={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)'))} />

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Already Premium */}
        {isPremium && (
          <Card style={styles.alreadyPremiumCard}>
            <View style={styles.alreadyPremiumContent}>
              <Ionicons name="shield-checkmark" size={48} color={colors.success[600]!} />
              <Text variant="h2" style={styles.alreadyPremiumTitle}>
                Zaten Premium Üyesiniz!
              </Text>
              <Text variant="body" style={styles.alreadyPremiumText}>
                Tüm premium özelliklerin keyfini çıkarın.
              </Text>
              <Button
                variant="outline"
                title="Abonelik Ayarları"
                onPress={() => router.push('/settings/subscription')}
                style={{ alignSelf: 'center' }}
              />
            </View>
          </Card>
        )}

        {/* Hero Section */}
        {!isPremium && (
          <>
            <View style={styles.heroSection}>
              <MaterialCommunityIcons name="crown" size={64} color={colors.primary[600]!} />
              <Text variant="h2" style={styles.heroTitle}>
                Premium Koleksiyoner
              </Text>
              <Text variant="body" style={styles.heroSubtitle}>
                Sınırsız ilan, takas özelliği ve çok daha fazlası
              </Text>
            </View>

            {/* Plan Selection */}
            <Card style={styles.planCard}>
              <Text variant="h3" style={styles.sectionTitle}>Plan Seçin</Text>

              <TouchableOpacity
                style={[styles.planOption, selectedPlan === 'annual' && styles.planOptionSelected]}
                onPress={() => setSelectedPlan('annual')}
              >
                <View style={styles.planOptionContent}>
                  <Radio
                    checked={selectedPlan === 'annual'}
                    onChange={() => setSelectedPlan('annual')}
                  />
                  <View style={styles.planInfo}>
                    <View style={styles.planHeader}>
                      <Text variant="h3">{PLANS.annual.name}</Text>
                      <Chip
                        label={PLANS.annual.savings!}
                        variant="success"
                        size="sm"
                      />
                    </View>
                    <Text variant="bodySm" style={styles.planSubtext}>
                      ₺{PLANS.annual.monthlyPrice}/ay olarak ödenir
                    </Text>
                  </View>
                </View>
                <Text variant="h3" style={styles.planPrice}>
                  ₺{PLANS.annual.price}/{PLANS.annual.period}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.planOption, selectedPlan === 'monthly' && styles.planOptionSelected]}
                onPress={() => setSelectedPlan('monthly')}
              >
                <View style={styles.planOptionContent}>
                  <Radio
                    checked={selectedPlan === 'monthly'}
                    onChange={() => setSelectedPlan('monthly')}
                  />
                  <View style={styles.planInfo}>
                    <Text variant="h3">{PLANS.monthly.name}</Text>
                    <Text variant="bodySm" style={styles.planSubtext}>
                      İstediğiniz zaman iptal edin
                    </Text>
                  </View>
                </View>
                <Text variant="h3" style={styles.planPrice}>
                  ₺{PLANS.monthly.price}/{PLANS.monthly.period}
                </Text>
              </TouchableOpacity>
            </Card>

            {/* Subscribe Button */}
            <Button
              variant="primary"
              fullWidth
              size="lg"
              title={selectedPlan === 'annual'
                ? `Yıllık ₺${PLANS.annual.price} ile Başla`
                : `Aylık ₺${PLANS.monthly.price} ile Başla`}
              style={styles.subscribeButton}
              onPress={handleSubscribe}
              isLoading={subscribeMutation.isPending}
            />
            <Text style={styles.guaranteeText}>
              7 gün içinde memnun kalmazsanız iade garantisi
            </Text>
          </>
        )}

        {/* Features */}
        <Card style={styles.featuresCard}>
          <Text variant="h3" style={styles.sectionTitle}>Premium Özellikler</Text>
          <View style={styles.featuresGrid}>
            {PREMIUM_FEATURES.map((feature, index) => (
              <View key={index} style={styles.featureItem}>
                <View style={styles.featureIcon}>
                  <Ionicons name={feature.icon as any} size={24} color={colors.primary[600]!} />
                </View>
                <Text variant="body" style={styles.featureTitle}>{feature.title}</Text>
                <Text variant="bodySm" style={styles.featureDesc}>{feature.description}</Text>
              </View>
            ))}
          </View>
        </Card>

        {/* Comparison Table */}
        <Card style={styles.comparisonCard}>
          <Text variant="h3" style={styles.sectionTitle}>Karşılaştırma</Text>

          <View style={styles.comparisonHeader}>
            <Text style={[styles.comparisonCell, styles.comparisonFeature]}>Özellik</Text>
            <Text style={[styles.comparisonCell, styles.comparisonValue]}>Ücretsiz</Text>
            <Text style={[styles.comparisonCell, styles.comparisonValue, styles.premiumColumn]}>Premium</Text>
          </View>

          {COMPARISON.map((row, index) => (
            <View key={index} style={styles.comparisonRow}>
              <Text style={[styles.comparisonCell, styles.comparisonFeature]}>{row.feature}</Text>
              <Text style={[styles.comparisonCell, styles.comparisonValue]}>{row.free}</Text>
              <Text style={[styles.comparisonCell, styles.comparisonValue, styles.premiumColumn, styles.premiumValue]}>
                {row.premium}
              </Text>
            </View>
          ))}
        </Card>

        {/* FAQ */}
        <Card style={styles.faqCard}>
          <Text variant="h3" style={styles.sectionTitle}>Sıkça Sorulan Sorular</Text>

          <View style={styles.faqItem}>
            <Text variant="h3">İstediğim zaman iptal edebilir miyim?</Text>
            <Text variant="bodySm" style={styles.faqAnswer}>
              Evet, aboneliğinizi istediğiniz zaman iptal edebilirsiniz. İptal ettiğinizde dönem sonuna kadar premium özellikler aktif kalır.
            </Text>
          </View>

          <View style={styles.faqItem}>
            <Text variant="h3">İade garantisi var mı?</Text>
            <Text variant="bodySm" style={styles.faqAnswer}>
              İlk 7 gün içinde memnun kalmazsanız tam iade yapılır.
            </Text>
          </View>

          <View style={styles.faqItem}>
            <Text variant="h3">Ödeme yöntemleri nelerdir?</Text>
            <Text variant="bodySm" style={styles.faqAnswer}>
              Kredi kartı, banka kartı ve havale/EFT ile ödeme yapabilirsiniz.
            </Text>
          </View>
        </Card>

        {/* Help */}
        <TouchableOpacity style={styles.helpLink} onPress={() => router.push('/help')}>
          <Ionicons name="help-circle" size={20} color={colors.primary[600]!} />
          <Text style={styles.helpText}>Sorularınız mı var? Yardım Merkezi</Text>
        </TouchableOpacity>

        <View style={{ height: 50 }} />
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
  alreadyPremiumCard: {
    marginBottom: 16,
    backgroundColor: colors.success[50]!,
    borderWidth: 1,
    borderColor: colors.success[600]!,
  },
  alreadyPremiumContent: {
    alignItems: 'center',
    padding: 24,
  },
  alreadyPremiumTitle: {
    marginTop: 16,
    marginBottom: 8,
    color: colors.success[600]!,
  },
  alreadyPremiumText: {
    textAlign: 'center',
    marginBottom: 16,
    color: colors.text.muted,
  },
  heroSection: {
    alignItems: 'center',
    padding: 24,
    backgroundColor: colors.surface.DEFAULT,
    borderRadius: 16,
    marginBottom: 16,
  },
  heroTitle: {
    marginTop: 16,
    textAlign: 'center',
    color: colors.text.heading,
  },
  heroSubtitle: {
    marginTop: 8,
    textAlign: 'center',
    color: colors.text.muted,
  },
  planCard: {
    marginBottom: 16,
    backgroundColor: colors.surface.DEFAULT,
  },
  sectionTitle: {
    marginBottom: 16,
    color: colors.text.heading,
  },
  planOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderWidth: 2,
    borderColor: colors.border.DEFAULT,
    borderRadius: 12,
    marginBottom: 12,
  },
  planOptionSelected: {
    borderColor: colors.primary[600]!,
    backgroundColor: colors.primary[50]!,
  },
  planOptionContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  planInfo: {
    flex: 1,
    marginLeft: 8,
  },
  planHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  planSubtext: {
    color: colors.text.muted,
    marginTop: 2,
  },
  planPrice: {
    color: colors.primary[600]!,
    fontWeight: 'bold',
    flexShrink: 0,
    marginLeft: 12,
    textAlign: 'right',
  },
  subscribeButton: {
    marginBottom: 8,
    borderRadius: 12,
  },
  guaranteeText: {
    textAlign: 'center',
    color: colors.success[600]!,
    fontSize: 12,
    marginBottom: 24,
  },
  featuresCard: {
    marginBottom: 16,
    backgroundColor: colors.surface.DEFAULT,
  },
  featuresGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  featureItem: {
    width: '50%',
    padding: 8,
    marginBottom: 8,
  },
  featureIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.primary[50]!,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  featureTitle: {
    fontWeight: '600',
    color: colors.text.heading,
  },
  featureDesc: {
    color: colors.text.muted,
    marginTop: 2,
  },
  comparisonCard: {
    marginBottom: 16,
    backgroundColor: colors.surface.DEFAULT,
  },
  comparisonHeader: {
    flexDirection: 'row',
    borderBottomWidth: 2,
    borderBottomColor: colors.border.DEFAULT,
    paddingBottom: 12,
    marginBottom: 8,
  },
  comparisonRow: {
    flexDirection: 'row',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.DEFAULT,
  },
  comparisonCell: {
    fontSize: 13,
  },
  comparisonFeature: {
    flex: 2,
    color: colors.text.heading,
  },
  comparisonValue: {
    flex: 1,
    textAlign: 'center',
    color: colors.text.muted,
  },
  premiumColumn: {
    backgroundColor: colors.primary[50]!,
    marginLeft: 4,
    borderRadius: 4,
    paddingVertical: 4,
  },
  premiumValue: {
    color: colors.primary[600]!,
    fontWeight: '600',
  },
  faqCard: {
    marginBottom: 16,
    backgroundColor: colors.surface.DEFAULT,
  },
  faqItem: {
    marginBottom: 16,
  },
  faqAnswer: {
    color: colors.text.muted,
    marginTop: 4,
    lineHeight: 20,
  },
  helpLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  helpText: {
    marginLeft: 8,
    color: colors.primary[600]!,
    fontWeight: '500',
  },
});
