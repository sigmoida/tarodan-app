import { View, ScrollView, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { theme, Text, ScreenHeader } from '@tarodan/ui-native';
import { useTranslation } from '@/i18n';
import { SECURITY_EMAIL } from '@/constants/legalFacts';

const { colors } = theme;

const FEATURES = [
  {
    icon: 'lock-closed-outline' as const,
    title: 'SSL Şifreleme',
    description: 'Tüm veri aktarımları 256-bit SSL/TLS şifreleme ile korunur. Kişisel bilgileriniz ve ödeme verileriniz üçüncü taraflarca okunamaz.',
  },
  {
    icon: 'shield-checkmark-outline' as const,
    title: 'Alıcı Koruma Sistemi',
    description: 'Ödemeniz, ürünü teslim alıp onaylayana kadar güvenli emanet hesapta tutulur. Ürün gelmezse veya açıklamaya uygun değilse paranız iade edilir.',
  },
  {
    icon: 'card-outline' as const,
    title: 'Güvenli Ödeme Altyapısı',
    description: 'Ödemeler, PCI DSS uyumlu ödeme kuruluşları (iyzico/PayTR) üzerinden işlenir. Kart bilgileriniz Tarodan sunucularında saklanmaz.',
  },
  {
    icon: 'person-circle-outline' as const,
    title: 'Kimlik Doğrulama',
    description: 'Satıcılar e-posta ve telefon doğrulamasından geçer. Premium satıcılar için kimlik ve adres doğrulaması zorunludur.',
  },
  {
    icon: 'eye-off-outline' as const,
    title: 'Veri Gizliliği',
    description: 'Kişisel verileriniz KVKK (6698 sayılı Kanun) kapsamında korunur. Verileriniz yalnızca hizmet sağlamak amacıyla işlenir ve izinsiz üçüncü taraflarla paylaşılmaz.',
  },
  {
    icon: 'chatbubble-ellipses-outline' as const,
    title: 'Güvenli Mesajlaşma',
    description: 'Platform içi mesajlaşma sistemi ile iletişim kurun. Kişisel iletişim bilgilerinizi paylaşmak zorunda kalmadan alıcı/satıcılarla güvenle görüşün.',
  },
  {
    icon: 'swap-horizontal-outline' as const,
    title: 'Güvenli Takas',
    description: 'Takas işlemlerinde her iki tarafın ürünleri platform garantisi altında gönderilir. Anlaşmazlık durumunda platform arabuluculuk yapar.',
  },
  {
    icon: 'alert-circle-outline' as const,
    title: 'Dolandırıcılık Önleme',
    description: 'Yapay zeka destekli sistemler şüpheli işlemleri ve sahte ilanları otomatik olarak tespit eder. Riskli işlemler ek doğrulama gerektirir.',
  },
  {
    icon: 'flag-outline' as const,
    title: 'Raporlama Sistemi',
    description: 'Şüpheli ilanları, kullanıcıları veya mesajları kolayca raporlayabilirsiniz. Her rapor 24 saat içinde uzman ekibimiz tarafından incelenir.',
  },
  {
    icon: 'star-outline' as const,
    title: 'Değerlendirme Sistemi',
    description: 'Alıcı ve satıcı puanlama sistemi sayesinde güvenilir kullanıcıları kolayca belirleyebilirsiniz. Sahte değerlendirmeler tespit edilip kaldırılır.',
  },
];

export default function SecurityFeaturesScreen() {
  const { t } = useTranslation();
  return (
    <View style={styles.container}>
      <ScreenHeader title={t('mobile.pageSecurityFeatures')} onBack={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)'))} />

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.intro}>
          <Ionicons name="shield-checkmark" size={48} color={colors.primary[600]!} />
          <Text style={styles.introTitle}>Güvenliğiniz Bizim Önceliğimiz</Text>
          <Text style={styles.introText}>
            Tarodan'da alışveriş ve takas güvenliği en üst düzeyde sağlanır. Aşağıda platformumuzun sunduğu güvenlik özelliklerini inceleyebilirsiniz.
          </Text>
        </View>

        {FEATURES.map((feature, index) => (
          <View key={index} style={styles.featureCard}>
            <View style={styles.featureIcon}>
              <Ionicons name={feature.icon} size={28} color={colors.primary[600]!} />
            </View>
            <View style={styles.featureContent}>
              <Text style={styles.featureTitle}>{feature.title}</Text>
              <Text style={styles.featureDesc}>{feature.description}</Text>
            </View>
          </View>
        ))}

        <View style={styles.footer}>
          <Text style={styles.footerText}>
            Güvenlikle ilgili bir sorun fark ederseniz lütfen derhal bize bildirin.
          </Text>
          <Text style={styles.contactInfo}>E-posta: {SECURITY_EMAIL}</Text>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface.DEFAULT,
  },
  content: {
    flex: 1,
    padding: theme.spacing[5],
  },
  intro: {
    alignItems: 'center',
    paddingVertical: theme.spacing[6],
    marginBottom: theme.spacing[2],
  },
  introTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.text.heading,
    marginTop: theme.spacing[3],
    marginBottom: theme.spacing[2],
  },
  introText: {
    fontSize: 14,
    color: colors.text.muted,
    lineHeight: 22,
    textAlign: 'center',
  },
  featureCard: {
    flexDirection: 'row',
    backgroundColor: colors.surface.alt,
    borderRadius: 12,
    padding: theme.spacing[4],
    marginBottom: theme.spacing[3],
  },
  featureIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.primary[50]!,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: theme.spacing[3.5],
  },
  featureContent: {
    flex: 1,
  },
  featureTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text.heading,
    marginBottom: theme.spacing[1],
  },
  featureDesc: {
    fontSize: 13,
    color: colors.text.muted,
    lineHeight: 20,
  },
  footer: {
    marginTop: theme.spacing[4],
    padding: theme.spacing[4],
    backgroundColor: colors.surface.alt,
    borderRadius: 12,
    alignItems: 'center',
  },
  footerText: {
    fontSize: 14,
    color: colors.text.muted,
    textAlign: 'center',
    marginBottom: theme.spacing[2],
  },
  contactInfo: {
    fontSize: 14,
    color: colors.primary[600]!,
    fontWeight: '600',
  },
});
