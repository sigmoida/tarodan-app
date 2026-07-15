import { View, ScrollView, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { theme, Text, ScreenHeader } from '@tarodan/ui-native';
import { useTranslation } from '@/i18n';
import {
  RETURN_REQUEST_DAYS,
  REFUND_PAYOUT_DAYS,
  DAMAGE_REPORT_DAYS,
  SUPPORT_EMAIL,
  SUPPORT_PHONE,
} from '@/constants/legalFacts';

const { colors } = theme;

export default function RefundPolicyScreen() {
  const { t } = useTranslation();
  return (
    <View style={styles.container}>
      <ScreenHeader title={t('mobile.pageRefundPolicy')} onBack={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)'))} />

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.lastUpdated}>Son güncelleme: 1 Ocak 2026</Text>

        <Text style={styles.sectionTitle}>1. Genel İade Koşulları</Text>
        <Text style={styles.paragraph}>
          Tarodan platformu üzerinden satın aldığınız ürünleri, teslim tarihinden itibaren {RETURN_REQUEST_DAYS} gün içinde iade edebilirsiniz. İade hakkınız, 6502 sayılı Tüketicinin Korunması Hakkında Kanun kapsamında güvence altındadır.
        </Text>

        <Text style={styles.sectionTitle}>2. İade Şartları</Text>
        <Text style={styles.listItem}>• Ürün, teslim tarihinden itibaren {RETURN_REQUEST_DAYS} gün içinde iade talebi oluşturulmalıdır</Text>
        <Text style={styles.listItem}>• Ürün kullanılmamış ve orijinal ambalajında olmalıdır</Text>
        <Text style={styles.listItem}>• Ürün etiketi ve aksesuarları eksiksiz olmalıdır</Text>
        <Text style={styles.listItem}>• Diecast model araçlarda kutu ve iç ambalaj hasar görmemiş olmalıdır</Text>
        <Text style={styles.listItem}>• İade formunun eksiksiz doldurulması gerekmektedir</Text>

        <Text style={styles.sectionTitle}>3. İade Süreci</Text>
        <Text style={styles.subTitle}>Adım 1: Talep Oluşturma</Text>
        <Text style={styles.paragraph}>
          Siparişlerim sayfasından ilgili siparişi seçerek "İade Talebi" oluşturun. İade nedeninizi belirtin ve varsa fotoğraf ekleyin.
        </Text>
        <Text style={styles.subTitle}>Adım 2: Satıcı Onayı</Text>
        <Text style={styles.paragraph}>
          Satıcı, iade talebinizi 2 iş günü içinde değerlendirir. Onay durumunda iade kargo kodu gönderilir.
        </Text>
        <Text style={styles.subTitle}>Adım 3: Ürün Gönderimi</Text>
        <Text style={styles.paragraph}>
          Ürünü orijinal ambalajında, size iletilen kargo kodu ile en kısa sürede gönderin.
        </Text>
        <Text style={styles.subTitle}>Adım 4: İade Onayı ve Ödeme</Text>
        <Text style={styles.paragraph}>
          Satıcı ürünü teslim alıp kontrol ettikten sonra iade tutarı {REFUND_PAYOUT_DAYS} gün içinde ödeme yönteminize iade edilir.
        </Text>

        <Text style={styles.sectionTitle}>4. İade Edilemeyen Ürünler</Text>
        <Text style={styles.listItem}>• Ambalajı açılmış ve hasar görmüş ürünler</Text>
        <Text style={styles.listItem}>• Kişiye özel hazırlanmış (custom) ürünler</Text>
        <Text style={styles.listItem}>• {RETURN_REQUEST_DAYS} günlük süreyi aşmış talepler</Text>
        <Text style={styles.listItem}>• Satıcı tarafından "iade kabul edilmez" olarak işaretlenmiş özel ürünler (detaylar ürün sayfasında belirtilir)</Text>

        <Text style={styles.sectionTitle}>5. Hasarlı veya Hatalı Ürün</Text>
        <Text style={styles.paragraph}>
          Ürünün hasarlı, hatalı veya açıklamaya uygun olmadığını tespit ederseniz, teslim tarihinden itibaren {DAMAGE_REPORT_DAYS} gün içinde fotoğraflı bildirimde bulunun. Bu durumda kargo ücreti satıcıya aittir ve tam iade yapılır.
        </Text>

        <Text style={styles.sectionTitle}>6. Kargo Ücreti</Text>
        <Text style={styles.paragraph}>
          Cayma hakkı kapsamındaki iadelerde kargo ücreti alıcıya aittir. Hasarlı veya hatalı ürün iadeleri ile açıklamaya uygun olmayan ürün iadelerde kargo ücreti satıcıya aittir.
        </Text>

        <Text style={styles.sectionTitle}>7. İade Tutarı</Text>
        <Text style={styles.paragraph}>
          İade tutarı, ürünün satın alma bedelidir. Kullanılan kupon/indirim kodları iade tutarından düşülür. Kargo ücreti, uygulanabilir durumlarda ayrıca iade edilir.
        </Text>

        <Text style={styles.sectionTitle}>8. Uyuşmazlık</Text>
        <Text style={styles.paragraph}>
          İade sürecinde satıcı ile anlaşmazlık yaşarsanız, destek ekibimize başvurabilirsiniz. Platform, arabuluculuk yaparak en adil çözümü sağlamaya çalışır.
        </Text>

        <Text style={styles.contactInfo}>E-posta: {SUPPORT_EMAIL}</Text>
        <Text style={styles.contactInfo}>Telefon: {SUPPORT_PHONE}</Text>

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
  subTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text.heading,
    marginTop: theme.spacing[3],
    marginBottom: theme.spacing[2],
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
    marginTop: theme.spacing[2],
    marginBottom: theme.spacing[1],
  },
});
