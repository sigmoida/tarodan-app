import { View, ScrollView, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { theme, Text, ScreenHeader } from '@tarodan/ui-native';
import { SUPPORT_EMAIL } from '../src/constants/legalFacts';

const { colors } = theme;

/**
 * Platform Hizmet Bedeli şeffaflık sayfası. Web karşılığı:
 * apps/web/src/app/platform-hizmet-bedeli/page.tsx (içerik birebir).
 */
export default function PlatformHizmetBedeliScreen() {
  return (
    <View style={styles.container}>
      <ScreenHeader
        title="Platform Hizmet Bedeli"
        onBack={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)'))}
      />

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.lastUpdated}>Son güncelleme: 2 Haziran 2026</Text>

        <Text style={styles.sectionTitle}>1. Nedir?</Text>
        <Text style={styles.paragraph}>
          Platform Hizmet Bedeli, TARODAN üzerinden yaptığınız her satın almada ürün
          bedelinin %3'ü oranında alınan bir hizmet ücretidir. Bu bedel, ödeme altyapısı,
          güvenli alışveriş garantisi, uyuşmazlık çözümü ve platform üzerinde sunduğumuz
          diğer hizmetler için kullanılır.
        </Text>

        <Text style={styles.sectionTitle}>2. Hesaplama Yöntemi</Text>
        <Text style={styles.listItem}>• Baz tutar: Sadece ürün fiyatı (kargo bedeli ve indirimler hariç).</Text>
        <Text style={styles.listItem}>
          • Oran: Yürürlükteki oran %3'tür. Bu oran zaman içinde değişebilir; değişiklikler
          bu sayfada duyurulur.
        </Text>
        <Text style={styles.listItem}>• KDV: Tutara KDV dahildir; ayrıca KDV eklenmez.</Text>
        <Text style={styles.paragraph}>
          Örnek: 500 TL'lik bir ürün satın alırsanız Platform Hizmet Bedeli 15 TL olur ve
          sepet toplamına dahil edilir.
        </Text>

        <Text style={styles.sectionTitle}>3. Nereye Gider?</Text>
        <Text style={styles.paragraph}>
          Platform Hizmet Bedeli TARODAN'a gelir olarak kaydedilir ve aşağıdaki maliyetlerin
          karşılanmasında kullanılır:
        </Text>
        <Text style={styles.listItem}>• Ödeme sağlayıcısı (PayTR) işlem komisyonu</Text>
        <Text style={styles.listItem}>• SSL sertifikası, güvenlik altyapısı, fraud önleme</Text>
        <Text style={styles.listItem}>• Müşteri desteği ve uyuşmazlık çözümü</Text>
        <Text style={styles.listItem}>• Platform geliştirme ve teknik bakım</Text>

        <Text style={styles.sectionTitle}>4. İade Durumunda Ne Olur?</Text>
        <Text style={styles.paragraph}>
          Platform Hizmet Bedeli'nin iade edilip edilmeyeceği iadenin gerekçesine bağlıdır:
        </Text>
        <Text style={styles.listItem}>
          • Satıcı kaynaklı iade (hasarlı, eksik, yanlış ürün, sahte vb.): Platform Hizmet
          Bedeli tamamen iade edilir.
        </Text>
        <Text style={styles.listItem}>
          • Satıcı göndermediği için iptal: Platform Hizmet Bedeli tamamen iade edilir.
        </Text>
        <Text style={styles.listItem}>
          • Alıcı fikir değişikliği (Senaryo D): Platform Hizmet Bedeli iade edilmez — çünkü
          iadeye konu olmayan hizmetler verilmiştir (ödeme işlem, güvenlik vs.).
        </Text>
        <Text style={styles.listItem}>
          • 48 saat onay süreci dolduktan sonra: Sipariş tamamlanmış sayılır, Platform Hizmet
          Bedeli kesinleşir.
        </Text>

        <Text style={styles.sectionTitle}>5. Şeffaflık</Text>
        <Text style={styles.paragraph}>
          Sepet ve checkout sayfalarında Platform Hizmet Bedeli ayrı bir satır olarak
          gösterilir. Ödemenizden önce tutarı net olarak görebilirsiniz. Ek ücret veya gizli
          bedel uygulanmaz.
        </Text>

        <Text style={styles.sectionTitle}>6. Sorularınız İçin</Text>
        <Text style={styles.paragraph}>
          Platform Hizmet Bedeli hakkında daha fazla bilgi için Yardım Merkezi'ni ziyaret
          edebilir veya {SUPPORT_EMAIL} adresinden bize ulaşabilirsiniz.
        </Text>

        <Text style={styles.disclaimer}>
          Bu sayfa bilgilendirme amaçlıdır; bağlayıcı sözleşme şartları için Kullanım Koşulları
          ve İade Politikası sayfalarımızı inceleyiniz.
        </Text>

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
    padding: 20,
  },
  lastUpdated: {
    fontSize: 13,
    color: colors.text.muted,
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.text.heading,
    marginTop: 24,
    marginBottom: 12,
  },
  paragraph: {
    fontSize: 14,
    color: colors.text.muted,
    lineHeight: 22,
    marginBottom: 12,
  },
  listItem: {
    fontSize: 14,
    color: colors.text.muted,
    lineHeight: 24,
    marginLeft: 8,
  },
  disclaimer: {
    fontSize: 13,
    color: colors.text.subtle,
    lineHeight: 20,
    marginTop: 24,
  },
});
