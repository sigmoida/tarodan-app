import { View, ScrollView, StyleSheet, TouchableOpacity, Linking, Alert } from 'react-native';
import { Text, Card, Button, Chip, RadioButton, Divider, ActivityIndicator } from 'react-native-paper';
import { useState } from 'react';
import { router } from 'expo-router';
import { useMutation } from '@tanstack/react-query';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { api } from '../src/services/api';
import { useAuthStore } from '../src/stores/authStore';
import { TarodanColors } from '../src/theme';

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
  { feature: 'Takas Özelliği', free: '❌', premium: '✓' },
  { feature: 'Dijital Garaj', free: '❌', premium: '✓' },
  { feature: 'Öne Çıkan İlan', free: '❌', premium: '3 adet' },
  { feature: 'Günlük Mesaj', free: '50', premium: 'Sınırsız' },
  { feature: 'Reklam', free: 'Var', premium: 'Yok' },
  { feature: 'Destek', free: '24-48 saat', premium: '12 saat' },
];

export default function UpgradeScreen() {
  const { isAuthenticated, user, refreshUserData } = useAuthStore();
  const [selectedPlan, setSelectedPlan] = useState<PlanType>('annual');

  const isPremium = user?.membershipTier === 'premium';

  // Subscribe mutation
  const subscribeMutation = useMutation({
    mutationFn: async (planId: string) => {
      return api.post('/subscriptions/create', { planId });
    },
    onSuccess: (response) => {
      // In a real app, this would redirect to a payment gateway
      const paymentUrl = response.data?.paymentUrl;
      if (paymentUrl) {
        Linking.openURL(paymentUrl);
      } else {
        Alert.alert(
          'Ödeme',
          'Ödeme sayfasına yönlendiriliyorsunuz...',
          [{ text: 'Tamam' }]
        );
      }
      refreshUserData();
    },
    onError: () => {
      Alert.alert('Hata', 'Abonelik oluşturulamadı. Lütfen tekrar deneyin.');
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

  const plan = PLANS[selectedPlan];

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={TarodanColors.textOnPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Premium Üyelik</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Already Premium */}
        {isPremium && (
          <Card style={styles.alreadyPremiumCard}>
            <Card.Content style={styles.alreadyPremiumContent}>
              <Ionicons name="checkmark-shield" size={48} color={TarodanColors.success} />
              <Text variant="titleLarge" style={styles.alreadyPremiumTitle}>
                Zaten Premium Üyesiniz!
              </Text>
              <Text variant="bodyMedium" style={styles.alreadyPremiumText}>
                Tüm premium özelliklerin keyfini çıkarın.
              </Text>
              <Button mode="outlined" onPress={() => router.push('/settings/subscription')}>
                Abonelik Ayarları
              </Button>
            </Card.Content>
          </Card>
        )}

        {/* Hero Section */}
        {!isPremium && (
          <>
            <View style={styles.heroSection}>
              <MaterialCommunityIcons name="crown" size={64} color={TarodanColors.primary} />
              <Text variant="headlineSmall" style={styles.heroTitle}>
                Premium Koleksiyoner
              </Text>
              <Text variant="bodyMedium" style={styles.heroSubtitle}>
                Sınırsız ilan, takas özelliği ve çok daha fazlası
              </Text>
            </View>

            {/* Plan Selection */}
            <Card style={styles.planCard}>
              <Card.Content>
                <Text variant="titleMedium" style={styles.sectionTitle}>Plan Seçin</Text>

                <TouchableOpacity
                  style={[styles.planOption, selectedPlan === 'annual' && styles.planOptionSelected]}
                  onPress={() => setSelectedPlan('annual')}
                >
                  <View style={styles.planOptionContent}>
                    <RadioButton
                      value="annual"
                      status={selectedPlan === 'annual' ? 'checked' : 'unchecked'}
                      onPress={() => setSelectedPlan('annual')}
                    />
                    <View style={styles.planInfo}>
                      <View style={styles.planHeader}>
                        <Text variant="titleSmall">{PLANS.annual.name}</Text>
                        <Chip compact mode="flat" style={styles.savingsBadge}>
                          {PLANS.annual.savings}
                        </Chip>
                      </View>
                      <Text variant="bodySmall" style={styles.planSubtext}>
                        ₺{PLANS.annual.monthlyPrice}/ay olarak ödenir
                      </Text>
                    </View>
                  </View>
                  <Text variant="titleMedium" style={styles.planPrice}>
                    ₺{PLANS.annual.price}/{PLANS.annual.period}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.planOption, selectedPlan === 'monthly' && styles.planOptionSelected]}
                  onPress={() => setSelectedPlan('monthly')}
                >
                  <View style={styles.planOptionContent}>
                    <RadioButton
                      value="monthly"
                      status={selectedPlan === 'monthly' ? 'checked' : 'unchecked'}
                      onPress={() => setSelectedPlan('monthly')}
                    />
                    <View style={styles.planInfo}>
                      <Text variant="titleSmall">{PLANS.monthly.name}</Text>
                      <Text variant="bodySmall" style={styles.planSubtext}>
                        İstediğiniz zaman iptal edin
                      </Text>
                    </View>
                  </View>
                  <Text variant="titleMedium" style={styles.planPrice}>
                    ₺{PLANS.monthly.price}/{PLANS.monthly.period}
                  </Text>
                </TouchableOpacity>
              </Card.Content>
            </Card>

            {/* Subscribe Button */}
            <Button
              mode="contained"
              style={styles.subscribeButton}
              contentStyle={styles.subscribeButtonContent}
              onPress={handleSubscribe}
              loading={subscribeMutation.isPending}
            >
              {selectedPlan === 'annual' 
                ? `Yıllık ₺${PLANS.annual.price} ile Başla`
                : `Aylık ₺${PLANS.monthly.price} ile Başla`}
            </Button>
            <Text style={styles.guaranteeText}>
              7 gün içinde memnun kalmazsanız iade garantisi
            </Text>
          </>
        )}

        {/* Features */}
        <Card style={styles.featuresCard}>
          <Card.Content>
            <Text variant="titleMedium" style={styles.sectionTitle}>Premium Özellikler</Text>
            <View style={styles.featuresGrid}>
              {PREMIUM_FEATURES.map((feature, index) => (
                <View key={index} style={styles.featureItem}>
                  <View style={styles.featureIcon}>
                    <Ionicons name={feature.icon as any} size={24} color={TarodanColors.primary} />
                  </View>
                  <Text variant="bodyMedium" style={styles.featureTitle}>{feature.title}</Text>
                  <Text variant="bodySmall" style={styles.featureDesc}>{feature.description}</Text>
                </View>
              ))}
            </View>
          </Card.Content>
        </Card>

        {/* Comparison Table */}
        <Card style={styles.comparisonCard}>
          <Card.Content>
            <Text variant="titleMedium" style={styles.sectionTitle}>Karşılaştırma</Text>
            
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
          </Card.Content>
        </Card>

        {/* FAQ */}
        <Card style={styles.faqCard}>
          <Card.Content>
            <Text variant="titleMedium" style={styles.sectionTitle}>Sıkça Sorulan Sorular</Text>
            
            <View style={styles.faqItem}>
              <Text variant="titleSmall">İstediğim zaman iptal edebilir miyim?</Text>
              <Text variant="bodySmall" style={styles.faqAnswer}>
                Evet, aboneliğinizi istediğiniz zaman iptal edebilirsiniz. İptal ettiğinizde dönem sonuna kadar premium özellikler aktif kalır.
              </Text>
            </View>
            
            <View style={styles.faqItem}>
              <Text variant="titleSmall">İade garantisi var mı?</Text>
              <Text variant="bodySmall" style={styles.faqAnswer}>
                İlk 7 gün içinde memnun kalmazsanız tam iade yapılır.
              </Text>
            </View>
            
            <View style={styles.faqItem}>
              <Text variant="titleSmall">Ödeme yöntemleri nelerdir?</Text>
              <Text variant="bodySmall" style={styles.faqAnswer}>
                Kredi kartı, banka kartı ve havale/EFT ile ödeme yapabilirsiniz.
              </Text>
            </View>
          </Card.Content>
        </Card>

        {/* Help */}
        <TouchableOpacity style={styles.helpLink} onPress={() => router.push('/help')}>
          <Ionicons name="help-circle" size={20} color={TarodanColors.primary} />
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
  content: {
    flex: 1,
    padding: 16,
  },
  alreadyPremiumCard: {
    marginBottom: 16,
    backgroundColor: TarodanColors.success + '10',
    borderWidth: 1,
    borderColor: TarodanColors.success,
  },
  alreadyPremiumContent: {
    alignItems: 'center',
    padding: 24,
  },
  alreadyPremiumTitle: {
    marginTop: 16,
    marginBottom: 8,
    color: TarodanColors.success,
  },
  alreadyPremiumText: {
    textAlign: 'center',
    marginBottom: 16,
    color: TarodanColors.textSecondary,
  },
  heroSection: {
    alignItems: 'center',
    padding: 24,
    backgroundColor: TarodanColors.background,
    borderRadius: 16,
    marginBottom: 16,
  },
  heroTitle: {
    marginTop: 16,
    textAlign: 'center',
    color: TarodanColors.textPrimary,
  },
  heroSubtitle: {
    marginTop: 8,
    textAlign: 'center',
    color: TarodanColors.textSecondary,
  },
  planCard: {
    marginBottom: 16,
    backgroundColor: TarodanColors.background,
  },
  sectionTitle: {
    marginBottom: 16,
    color: TarodanColors.textPrimary,
  },
  planOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderWidth: 2,
    borderColor: TarodanColors.border,
    borderRadius: 12,
    marginBottom: 12,
  },
  planOptionSelected: {
    borderColor: TarodanColors.primary,
    backgroundColor: TarodanColors.primary + '08',
  },
  planOptionContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  planInfo: {
    marginLeft: 8,
  },
  planHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  savingsBadge: {
    backgroundColor: TarodanColors.success + '20',
  },
  planSubtext: {
    color: TarodanColors.textSecondary,
    marginTop: 2,
  },
  planPrice: {
    color: TarodanColors.primary,
    fontWeight: 'bold',
  },
  subscribeButton: {
    marginBottom: 8,
    backgroundColor: TarodanColors.primary,
    borderRadius: 12,
  },
  subscribeButtonContent: {
    paddingVertical: 8,
  },
  guaranteeText: {
    textAlign: 'center',
    color: TarodanColors.success,
    fontSize: 12,
    marginBottom: 24,
  },
  featuresCard: {
    marginBottom: 16,
    backgroundColor: TarodanColors.background,
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
    backgroundColor: TarodanColors.primary + '10',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  featureTitle: {
    fontWeight: '600',
    color: TarodanColors.textPrimary,
  },
  featureDesc: {
    color: TarodanColors.textSecondary,
    marginTop: 2,
  },
  comparisonCard: {
    marginBottom: 16,
    backgroundColor: TarodanColors.background,
  },
  comparisonHeader: {
    flexDirection: 'row',
    borderBottomWidth: 2,
    borderBottomColor: TarodanColors.border,
    paddingBottom: 12,
    marginBottom: 8,
  },
  comparisonRow: {
    flexDirection: 'row',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: TarodanColors.border,
  },
  comparisonCell: {
    fontSize: 13,
  },
  comparisonFeature: {
    flex: 2,
    color: TarodanColors.textPrimary,
  },
  comparisonValue: {
    flex: 1,
    textAlign: 'center',
    color: TarodanColors.textSecondary,
  },
  premiumColumn: {
    backgroundColor: TarodanColors.primary + '08',
    marginLeft: 4,
    borderRadius: 4,
    paddingVertical: 4,
  },
  premiumValue: {
    color: TarodanColors.primary,
    fontWeight: '600',
  },
  faqCard: {
    marginBottom: 16,
    backgroundColor: TarodanColors.background,
  },
  faqItem: {
    marginBottom: 16,
  },
  faqAnswer: {
    color: TarodanColors.textSecondary,
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
    color: TarodanColors.primary,
    fontWeight: '500',
  },
});
