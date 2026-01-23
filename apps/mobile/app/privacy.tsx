import { View, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { Text } from 'react-native-paper';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { TarodanColors } from '../src/theme';

export default function PrivacyPolicyScreen() {
  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={TarodanColors.textOnPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Gizlilik Politikası</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.lastUpdated}>Son güncelleme: 1 Ocak 2026</Text>

        <Text style={styles.sectionTitle}>1. Giriş</Text>
        <Text style={styles.paragraph}>
          Tarodan ("biz", "bizim" veya "Şirket") olarak, gizliliğinize saygı duyuyor ve kişisel verilerinizi korumayı taahhüt ediyoruz. Bu Gizlilik Politikası, hizmetlerimizi kullanırken topladığımız bilgileri ve bu bilgileri nasıl kullandığımızı açıklar.
        </Text>

        <Text style={styles.sectionTitle}>2. Topladığımız Bilgiler</Text>
        <Text style={styles.paragraph}>
          Hizmetlerimizi kullanırken aşağıdaki bilgileri toplayabiliriz:
        </Text>
        <Text style={styles.listItem}>• Ad, e-posta adresi ve telefon numarası gibi hesap bilgileri</Text>
        <Text style={styles.listItem}>• Teslimat ve fatura adresleri</Text>
        <Text style={styles.listItem}>• Ödeme bilgileri (güvenli ödeme işlemcileri aracılığıyla işlenir)</Text>
        <Text style={styles.listItem}>• İlan verdiğiniz ürün bilgileri</Text>
        <Text style={styles.listItem}>• Platform kullanım verileri ve cihaz bilgileri</Text>

        <Text style={styles.sectionTitle}>3. Bilgilerin Kullanımı</Text>
        <Text style={styles.paragraph}>
          Topladığımız bilgileri şu amaçlarla kullanıyoruz:
        </Text>
        <Text style={styles.listItem}>• Hesabınızı oluşturmak ve yönetmek</Text>
        <Text style={styles.listItem}>• İşlemlerinizi gerçekleştirmek</Text>
        <Text style={styles.listItem}>• Müşteri desteği sağlamak</Text>
        <Text style={styles.listItem}>• Hizmetlerimizi geliştirmek</Text>
        <Text style={styles.listItem}>• Güvenlik ve dolandırıcılık önleme</Text>
        <Text style={styles.listItem}>• Yasal yükümlülükleri yerine getirmek</Text>

        <Text style={styles.sectionTitle}>4. Bilgi Paylaşımı</Text>
        <Text style={styles.paragraph}>
          Kişisel bilgilerinizi üçüncü taraflarla yalnızca aşağıdaki durumlarda paylaşırız:
        </Text>
        <Text style={styles.listItem}>• İşlem yapmak için gerekli olduğunda (örn: kargo şirketleri)</Text>
        <Text style={styles.listItem}>• Yasal zorunluluk olduğunda</Text>
        <Text style={styles.listItem}>• Açık izninizi aldığımızda</Text>
        <Text style={styles.listItem}>• Hizmet sağlayıcılarımızla (gizlilik sözleşmeleri kapsamında)</Text>

        <Text style={styles.sectionTitle}>5. Veri Güvenliği</Text>
        <Text style={styles.paragraph}>
          Verilerinizi korumak için endüstri standardı güvenlik önlemleri uyguluyoruz. Ancak, internet üzerinden hiçbir iletim yöntemi %100 güvenli değildir.
        </Text>

        <Text style={styles.sectionTitle}>6. Çerezler</Text>
        <Text style={styles.paragraph}>
          Web sitemiz ve uygulamamız, deneyiminizi geliştirmek için çerezler ve benzer teknolojiler kullanır. Çerez tercihlerinizi tarayıcı ayarlarınızdan yönetebilirsiniz.
        </Text>

        <Text style={styles.sectionTitle}>7. Haklarınız</Text>
        <Text style={styles.paragraph}>
          KVKK kapsamında aşağıdaki haklara sahipsiniz:
        </Text>
        <Text style={styles.listItem}>• Verilerinize erişim hakkı</Text>
        <Text style={styles.listItem}>• Verilerin düzeltilmesini isteme hakkı</Text>
        <Text style={styles.listItem}>• Verilerin silinmesini isteme hakkı</Text>
        <Text style={styles.listItem}>• İşlemeye itiraz etme hakkı</Text>
        <Text style={styles.listItem}>• Veri taşınabilirliği hakkı</Text>

        <Text style={styles.sectionTitle}>8. Veri Saklama</Text>
        <Text style={styles.paragraph}>
          Kişisel verilerinizi, hizmetlerimizi sağlamak için gerekli olduğu sürece veya yasal yükümlülüklerimizi yerine getirmek için gereken süre boyunca saklarız.
        </Text>

        <Text style={styles.sectionTitle}>9. Çocukların Gizliliği</Text>
        <Text style={styles.paragraph}>
          Hizmetlerimiz 18 yaşın altındaki kişilere yönelik değildir. Bilerek 18 yaşından küçük çocuklardan kişisel bilgi toplamıyoruz.
        </Text>

        <Text style={styles.sectionTitle}>10. Politika Değişiklikleri</Text>
        <Text style={styles.paragraph}>
          Bu Gizlilik Politikası'nı zaman zaman güncelleyebiliriz. Önemli değişiklikler hakkında sizi bilgilendireceğiz.
        </Text>

        <Text style={styles.sectionTitle}>11. İletişim</Text>
        <Text style={styles.paragraph}>
          Gizlilik ile ilgili sorularınız için bizimle iletişime geçebilirsiniz:
        </Text>
        <Text style={styles.contactInfo}>E-posta: privacy@tarodan.com</Text>
        <Text style={styles.contactInfo}>Adres: İstanbul, Türkiye</Text>

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
  lastUpdated: {
    fontSize: 13,
    color: TarodanColors.textSecondary,
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: TarodanColors.textPrimary,
    marginTop: 24,
    marginBottom: 12,
  },
  paragraph: {
    fontSize: 14,
    color: TarodanColors.textSecondary,
    lineHeight: 22,
    marginBottom: 12,
  },
  listItem: {
    fontSize: 14,
    color: TarodanColors.textSecondary,
    lineHeight: 24,
    marginLeft: 8,
  },
  contactInfo: {
    fontSize: 14,
    color: TarodanColors.primary,
    marginBottom: 8,
  },
});
