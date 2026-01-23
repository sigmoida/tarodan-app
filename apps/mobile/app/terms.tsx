import { View, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { Text } from 'react-native-paper';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { TarodanColors } from '../src/theme';

export default function TermsOfServiceScreen() {
  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={TarodanColors.textOnPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Kullanım Koşulları</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.lastUpdated}>Son güncelleme: 1 Ocak 2026</Text>

        <Text style={styles.sectionTitle}>1. Hizmet Tanımı</Text>
        <Text style={styles.paragraph}>
          Tarodan, diecast model araç koleksiyonerleri için bir pazaryeri platformudur. Platform, kullanıcıların diecast model araçlarını listelemesine, satın almasına ve takas etmesine olanak tanır.
        </Text>

        <Text style={styles.sectionTitle}>2. Hesap Oluşturma</Text>
        <Text style={styles.paragraph}>
          Hizmetlerimizi kullanmak için bir hesap oluşturmanız gerekmektedir. Hesap oluştururken doğru ve güncel bilgiler vermeyi kabul edersiniz. Hesabınızın güvenliğinden siz sorumlusunuz.
        </Text>

        <Text style={styles.sectionTitle}>3. Kullanıcı Sorumlulukları</Text>
        <Text style={styles.listItem}>• Doğru ve yanıltıcı olmayan ürün bilgileri sağlamak</Text>
        <Text style={styles.listItem}>• Gerçekçi ve güncel fiyatlandırma yapmak</Text>
        <Text style={styles.listItem}>• Yasal olmayan ürünleri listelememek</Text>
        <Text style={styles.listItem}>• Diğer kullanıcılara saygılı davranmak</Text>
        <Text style={styles.listItem}>• Platform kurallarına uymak</Text>

        <Text style={styles.sectionTitle}>4. İlan Kuralları</Text>
        <Text style={styles.paragraph}>
          İlanlarınızda şunları sağlamalısınız:
        </Text>
        <Text style={styles.listItem}>• Gerçek ürün fotoğrafları</Text>
        <Text style={styles.listItem}>• Doğru ürün açıklaması ve durum bilgisi</Text>
        <Text style={styles.listItem}>• Uygun kategori seçimi</Text>
        <Text style={styles.listItem}>• Makul fiyatlandırma</Text>

        <Text style={styles.sectionTitle}>5. Satış ve Satın Alma</Text>
        <Text style={styles.paragraph}>
          Satıcılar, listelenen ürünleri belirtilen koşullarda ve sürede teslim etmekle yükümlüdür. Alıcılar, ödeme yapmakla ve ürünü teslim almakla yükümlüdür.
        </Text>

        <Text style={styles.sectionTitle}>6. Takas İşlemleri</Text>
        <Text style={styles.paragraph}>
          Takas işlemleri, her iki tarafın da onayı ile gerçekleşir. Platform, takas işlemlerinde aracılık eder ancak ürünlerin değerlemesinden sorumlu değildir.
        </Text>

        <Text style={styles.sectionTitle}>7. Ödeme ve Komisyonlar</Text>
        <Text style={styles.paragraph}>
          Satışlar üzerinden platform komisyonu alınır. Komisyon oranları üyelik planına göre değişiklik gösterir. Ödemeler güvenli ödeme altyapısı üzerinden işlenir.
        </Text>

        <Text style={styles.sectionTitle}>8. İptal ve İade</Text>
        <Text style={styles.paragraph}>
          İade koşulları satıcı tarafından belirlenir. Platform, uyuşmazlık durumunda arabuluculuk yapabilir. Mesafeli satış sözleşmesi kapsamında yasal haklarınız saklıdır.
        </Text>

        <Text style={styles.sectionTitle}>9. Fikri Mülkiyet</Text>
        <Text style={styles.paragraph}>
          Platform içeriği ve tasarımı Tarodan'a aittir. Kullanıcılar, kendi içeriklerinin haklarına sahip olmalıdır ve başkalarının haklarını ihlal etmemelidir.
        </Text>

        <Text style={styles.sectionTitle}>10. Yasaklı Davranışlar</Text>
        <Text style={styles.listItem}>• Sahte veya çalıntı ürün satışı</Text>
        <Text style={styles.listItem}>• Fiyat manipülasyonu</Text>
        <Text style={styles.listItem}>• Spam veya yanıltıcı içerik</Text>
        <Text style={styles.listItem}>• Platform dışı ödeme yönlendirmesi</Text>
        <Text style={styles.listItem}>• Taciz veya uygunsuz davranış</Text>

        <Text style={styles.sectionTitle}>11. Hesap Askıya Alma</Text>
        <Text style={styles.paragraph}>
          Kural ihlali durumunda hesabınız uyarılabilir, geçici olarak askıya alınabilir veya kalıcı olarak kapatılabilir.
        </Text>

        <Text style={styles.sectionTitle}>12. Sorumluluk Sınırlaması</Text>
        <Text style={styles.paragraph}>
          Tarodan, kullanıcılar arasındaki işlemlerden, ürün kalitesinden veya teslimat sorunlarından doğrudan sorumlu değildir. Platform yalnızca aracılık hizmeti sağlar.
        </Text>

        <Text style={styles.sectionTitle}>13. Değişiklikler</Text>
        <Text style={styles.paragraph}>
          Bu koşulları önceden bildirimde bulunarak değiştirme hakkımızı saklı tutarız. Değişiklikler yayınlandıktan sonra platformu kullanmaya devam etmeniz, yeni koşulları kabul ettiğiniz anlamına gelir.
        </Text>

        <Text style={styles.sectionTitle}>14. Uyuşmazlık Çözümü</Text>
        <Text style={styles.paragraph}>
          İhtilaf halinde öncelikle platform üzerinden çözüm aranır. Çözülemeyen uyuşmazlıklar Türk hukuku kapsamında İstanbul mahkemelerinde çözüme kavuşturulur.
        </Text>

        <Text style={styles.sectionTitle}>15. İletişim</Text>
        <Text style={styles.paragraph}>
          Sorularınız için bizimle iletişime geçebilirsiniz:
        </Text>
        <Text style={styles.contactInfo}>E-posta: legal@tarodan.com</Text>
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
