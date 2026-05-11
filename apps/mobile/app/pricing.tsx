import { View, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { theme, Text, Card, Button } from '@tarodan/ui-native';
import { useAuthStore } from '../src/stores/authStore';
import { useTranslation } from '../src/i18n';

const { colors } = theme;

const MEMBERSHIP_TIERS = [
  {
    id: 'free',
    name: 'Ücretsiz',
    price: 0,
    period: '',
    description: 'Başlangıç için ideal',
    color: colors.gray[500]!,
    features: [
      { text: '5 ücretsiz ilan', included: true },
      { text: '10 toplam ilan', included: true },
      { text: '3 resim/ilan', included: true },
      { text: 'Takas özelliği', included: false },
      { text: 'Koleksiyon oluşturma', included: false },
      { text: 'Öne çıkan ilan', included: false },
      { text: 'Reklamsız deneyim', included: false },
    ],
  },
  {
    id: 'basic',
    name: 'Temel',
    price: 49,
    period: '/ay',
    description: 'Koleksiyonerler için',
    color: colors.info[500]!,
    features: [
      { text: '15 ücretsiz ilan', included: true },
      { text: '50 toplam ilan', included: true },
      { text: '6 resim/ilan', included: true },
      { text: 'Takas özelliği', included: true },
      { text: 'Koleksiyon oluşturma', included: true },
      { text: '2 öne çıkan ilan', included: true },
      { text: 'Reklamsız deneyim', included: false },
    ],
  },
  {
    id: 'premium',
    name: 'Premium',
    price: 99,
    period: '/ay',
    description: 'En popüler seçim',
    color: colors.primary[600]!,
    popular: true,
    features: [
      { text: '50 ücretsiz ilan', included: true },
      { text: '200 toplam ilan', included: true },
      { text: '10 resim/ilan', included: true },
      { text: 'Takas özelliği', included: true },
      { text: 'Koleksiyon oluşturma', included: true },
      { text: '10 öne çıkan ilan', included: true },
      { text: 'Reklamsız deneyim', included: true },
      { text: 'Öncelikli destek', included: true },
    ],
  },
  {
    id: 'business',
    name: 'İş',
    price: 199,
    period: '/ay',
    description: 'Profesyonel satıcılar için',
    color: colors.warning[500]!,
    features: [
      { text: '200 ücretsiz ilan', included: true },
      { text: '1000 toplam ilan', included: true },
      { text: '15 resim/ilan', included: true },
      { text: 'Takas özelliği', included: true },
      { text: 'Koleksiyon oluşturma', included: true },
      { text: '50 öne çıkan ilan', included: true },
      { text: 'Reklamsız deneyim', included: true },
      { text: 'Öncelikli destek', included: true },
      { text: 'API erişimi', included: true },
      { text: 'Özel satıcı rozeti', included: true },
    ],
  },
];

export default function PricingScreen() {
  const { t } = useTranslation();
  const { isAuthenticated, user } = useAuthStore();
  const currentTier = user?.membershipTier || 'free';

  const handleSelectPlan = (tierId: string) => {
    if (!isAuthenticated) {
      router.push('/(auth)/login');
      return;
    }

    if (tierId === 'free') {
      return; // Already free
    }

    router.push(`/membership/checkout?tier=${tierId}&period=monthly`);
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={colors.white} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('mobile.pagePricing')}</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Title Section */}
        <View style={styles.titleSection}>
          <Text style={styles.title}>Size Uygun Planı Seçin</Text>
          <Text style={styles.subtitle}>
            Koleksiyonunuzu büyütün, daha fazla satış yapın ve tüm özelliklerden yararlanın.
          </Text>
        </View>

        {/* Plans */}
        {MEMBERSHIP_TIERS.map((tier) => (
          <Card
            key={tier.id}
            style={{
              ...styles.planCard,
              ...(tier.popular ? styles.popularPlanCard : null),
              ...(currentTier === tier.id ? styles.currentPlanCard : null),
            }}
          >
            {tier.popular && (
              <View style={[styles.popularBadge, { backgroundColor: tier.color }]}>
                <Text style={styles.popularBadgeText}>Popüler</Text>
              </View>
            )}
            {currentTier === tier.id && (
              <View style={styles.currentBadge}>
                <Text style={styles.currentBadgeText}>Mevcut Plan</Text>
              </View>
            )}

            <Text style={[styles.planName, { color: tier.color }]}>{tier.name}</Text>
            <Text style={styles.planDescription}>{tier.description}</Text>

            <View style={styles.priceRow}>
              {tier.price > 0 ? (
                <>
                  <Text style={styles.planPrice}>₺{tier.price}</Text>
                  <Text style={styles.planPeriod}>{tier.period}</Text>
                </>
              ) : (
                <Text style={styles.planPrice}>Ücretsiz</Text>
              )}
            </View>

            <View style={styles.featuresList}>
              {tier.features.map((feature, index) => (
                <View key={index} style={styles.featureItem}>
                  <Ionicons
                    name={feature.included ? 'checkmark-circle' : 'close-circle'}
                    size={18}
                    color={feature.included ? tier.color : colors.text.subtle}
                  />
                  <Text style={[
                    styles.featureText,
                    !feature.included && styles.featureTextDisabled,
                  ]}>
                    {feature.text}
                  </Text>
                </View>
              ))}
            </View>

            <Button
              variant={tier.popular ? 'primary' : 'outline'}
              title={currentTier === tier.id
                ? 'Mevcut Plan'
                : tier.price === 0
                  ? 'Mevcut'
                  : 'Seç'}
              onPress={() => handleSelectPlan(tier.id)}
              style={styles.planButton}
              disabled={currentTier === tier.id}
            />
          </Card>
        ))}

        {/* FAQ Section */}
        <View style={styles.faqSection}>
          <Text style={styles.faqTitle}>Sık Sorulan Sorular</Text>

          <TouchableOpacity style={styles.faqItem}>
            <Text style={styles.faqQuestion}>Plan değişikliği nasıl yapılır?</Text>
            <Text style={styles.faqAnswer}>
              İstediğiniz zaman planınızı yükseltebilirsiniz. Mevcut dönem sonunda yeni plan aktif olur.
            </Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.faqItem}>
            <Text style={styles.faqQuestion}>İptal edebilir miyim?</Text>
            <Text style={styles.faqAnswer}>
              Evet, istediğiniz zaman iptal edebilirsiniz. Mevcut dönem sonuna kadar premium özellikler aktif kalır.
            </Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.faqItem}>
            <Text style={styles.faqQuestion}>Ödeme yöntemleri nelerdir?</Text>
            <Text style={styles.faqAnswer}>
              Kredi kartı ve banka kartı ile ödeme yapabilirsiniz. Tüm ödemeler güvenli altyapı üzerinden işlenir.
            </Text>
          </TouchableOpacity>
        </View>

        {/* Support Link */}
        <TouchableOpacity
          style={styles.supportLink}
          onPress={() => router.push('/support')}
        >
          <Ionicons name="help-circle-outline" size={20} color={colors.primary[600]!} />
          <Text style={styles.supportLinkText}>Sorularınız mı var? Destek ekibimizle iletişime geçin</Text>
        </TouchableOpacity>

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
  titleSection: {
    marginBottom: 24,
    alignItems: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.text.heading,
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: colors.text.muted,
    textAlign: 'center',
    lineHeight: 20,
  },
  planCard: {
    marginBottom: 16,
    backgroundColor: colors.surface.DEFAULT,
    position: 'relative',
    overflow: 'visible',
  },
  popularPlanCard: {
    borderWidth: 2,
    borderColor: colors.primary[600]!,
  },
  currentPlanCard: {
    borderWidth: 2,
    borderColor: colors.success[600]!,
  },
  popularBadge: {
    position: 'absolute',
    top: -12,
    right: 16,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    zIndex: 1,
  },
  popularBadgeText: {
    color: colors.white,
    fontSize: 12,
    fontWeight: 'bold',
  },
  currentBadge: {
    position: 'absolute',
    top: -12,
    left: 16,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: colors.success[600]!,
    zIndex: 1,
  },
  currentBadgeText: {
    color: colors.white,
    fontSize: 12,
    fontWeight: 'bold',
  },
  planName: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 4,
    marginTop: 8,
  },
  planDescription: {
    fontSize: 13,
    color: colors.text.muted,
    marginBottom: 16,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: 16,
  },
  planPrice: {
    fontSize: 32,
    fontWeight: 'bold',
    color: colors.text.heading,
  },
  planPeriod: {
    fontSize: 14,
    color: colors.text.muted,
    marginLeft: 4,
  },
  featuresList: {
    marginBottom: 16,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  featureText: {
    marginLeft: 10,
    fontSize: 14,
    color: colors.text.heading,
  },
  featureTextDisabled: {
    color: colors.text.subtle,
    textDecorationLine: 'line-through',
  },
  planButton: {
    borderRadius: 12,
    marginTop: 8,
  },
  faqSection: {
    marginTop: 24,
    marginBottom: 24,
  },
  faqTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.text.heading,
    marginBottom: 16,
  },
  faqItem: {
    backgroundColor: colors.surface.DEFAULT,
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
  },
  faqQuestion: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text.heading,
    marginBottom: 8,
  },
  faqAnswer: {
    fontSize: 13,
    color: colors.text.muted,
    lineHeight: 20,
  },
  supportLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  supportLinkText: {
    marginLeft: 8,
    fontSize: 14,
    color: colors.primary[600]!,
    fontWeight: '500',
  },
});
