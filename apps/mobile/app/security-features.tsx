import { View, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { Text } from 'react-native-paper';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { TarodanColors } from '../src/theme';

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
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={TarodanColors.textOnPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Güvenlik Özellikleri</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.intro}>
          <Ionicons name="shield-checkmark" size={48} color={TarodanColors.primary} />
          <Text style={styles.introTitle}>Güvenliğiniz Bizim Önceliğimiz</Text>
          <Text style={styles.introText}>
            Tarodan'da alışveriş ve takas güvenliği en üst düzeyde sağlanır. Aşağıda platformumuzun sunduğu güvenlik özelliklerini inceleyebilirsiniz.
          </Text>
        </View>

        {FEATURES.map((feature, index) => (
          <View key={index} style={styles.featureCard}>
            <View style={styles.featureIcon}>
              <Ionicons name={feature.icon} size={28} color={TarodanColors.primary} />
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
          <Text style={styles.contactInfo}>E-posta: security@tarodan.com</Text>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: TarodanColors.background,
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
    padding: 20,
  },
  intro: {
    alignItems: 'center',
    paddingVertical: 24,
    marginBottom: 8,
  },
  introTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: TarodanColors.textPrimary,
    marginTop: 12,
    marginBottom: 8,
  },
  introText: {
    fontSize: 14,
    color: TarodanColors.textSecondary,
    lineHeight: 22,
    textAlign: 'center',
  },
  featureCard: {
    flexDirection: 'row',
    backgroundColor: TarodanColors.backgroundSecondary,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  featureIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: TarodanColors.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  featureContent: {
    flex: 1,
  },
  featureTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: TarodanColors.textPrimary,
    marginBottom: 4,
  },
  featureDesc: {
    fontSize: 13,
    color: TarodanColors.textSecondary,
    lineHeight: 20,
  },
  footer: {
    marginTop: 16,
    padding: 16,
    backgroundColor: TarodanColors.backgroundSecondary,
    borderRadius: 12,
    alignItems: 'center',
  },
  footerText: {
    fontSize: 14,
    color: TarodanColors.textSecondary,
    textAlign: 'center',
    marginBottom: 8,
  },
  contactInfo: {
    fontSize: 14,
    color: TarodanColors.primary,
    fontWeight: '600',
  },
});
