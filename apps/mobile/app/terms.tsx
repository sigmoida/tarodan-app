import { View, ScrollView, StyleSheet } from 'react-native';
import { theme, Text, ScreenHeader } from '@tarodan/ui-native';
import { router } from 'expo-router';
import { useTranslation } from '@/i18n';
import { LEGAL_EMAIL } from '@/constants/legalFacts';

const { colors } = theme;

export default function TermsOfServiceScreen() {
  const { t } = useTranslation();
  return (
    <View style={styles.container}>
      <ScreenHeader title={t('mobile.pageTerms')} onBack={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)'))} />

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
        <Text style={styles.contactInfo}>E-posta: {LEGAL_EMAIL}</Text>
        <Text style={styles.contactInfo}>Adres: İstanbul, Türkiye</Text>

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
  lastUpdated: {
    fontSize: 13,
    color: colors.text.muted,
    marginBottom: theme.spacing[6],
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.text.heading,
    marginTop: theme.spacing[6],
    marginBottom: theme.spacing[3],
  },
  paragraph: {
    fontSize: 14,
    color: colors.text.muted,
    lineHeight: 22,
    marginBottom: theme.spacing[3],
  },
  listItem: {
    fontSize: 14,
    color: colors.text.muted,
    lineHeight: 24,
    marginLeft: theme.spacing[2],
  },
  contactInfo: {
    fontSize: 14,
    color: colors.primary[600]!,
    marginBottom: theme.spacing[2],
  },
});
