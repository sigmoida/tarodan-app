import { View, ScrollView, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { theme, Text, ScreenHeader } from '@tarodan/ui-native';
import { useTranslation } from '@/i18n';
import { PRIVACY_EMAIL } from '@/constants/legalFacts';

const { colors } = theme;

export default function CookiePolicyScreen() {
  const { t } = useTranslation();
  return (
    <View style={styles.container}>
      <ScreenHeader title={t('mobile.pageCookies')} onBack={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)'))} />

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.lastUpdated}>Son güncelleme: 1 Ocak 2026</Text>

        <Text style={styles.sectionTitle}>1. Çerezler Nedir?</Text>
        <Text style={styles.paragraph}>
          Çerezler, web siteleri ve uygulamalar tarafından cihazınıza yerleştirilen küçük metin dosyalarıdır. Bu dosyalar tercihlerinizi hatırlamak, deneyiminizi kişiselleştirmek ve kullanım istatistiklerini analiz etmek amacıyla kullanılır.
        </Text>

        <Text style={styles.sectionTitle}>2. Kullandığımız Çerez Türleri</Text>

        <Text style={styles.subTitle}>a) Zorunlu Çerezler</Text>
        <Text style={styles.paragraph}>
          Platformun temel işlevlerinin çalışması için gereklidir. Oturum yönetimi, güvenlik ve sepet bilgileri bu çerezlerle sağlanır. Bu çerezler devre dışı bırakılamaz.
        </Text>

        <Text style={styles.subTitle}>b) Performans Çerezleri</Text>
        <Text style={styles.paragraph}>
          Ziyaretçilerin platformu nasıl kullandığını anlamamıza yardımcı olur. Hangi sayfaların en çok ziyaret edildiği, hata mesajları gibi bilgileri toplar. Tüm veriler anonimleştirilmiş olarak işlenir.
        </Text>

        <Text style={styles.subTitle}>c) İşlevsellik Çerezleri</Text>
        <Text style={styles.paragraph}>
          Dil tercihi, bölge seçimi ve arayüz özelleştirmelerinizi hatırlar. Bu çerezler olmadan bazı kişiselleştirme özellikleri çalışmayabilir.
        </Text>

        <Text style={styles.subTitle}>d) Hedefleme / Reklam Çerezleri</Text>
        <Text style={styles.paragraph}>
          İlgi alanlarınıza uygun içerik ve reklamlar göstermek için kullanılır. Üçüncü taraf reklam ağları tarafından yerleştirilebilir.
        </Text>

        <Text style={styles.sectionTitle}>3. Üçüncü Taraf Çerezleri</Text>
        <Text style={styles.paragraph}>
          Platformumuzda aşağıdaki üçüncü taraf hizmetlerinin çerezleri bulunabilir:
        </Text>
        <Text style={styles.listItem}>• Google Analytics — Kullanım istatistikleri</Text>
        <Text style={styles.listItem}>• Facebook Pixel — Reklam optimizasyonu</Text>
        <Text style={styles.listItem}>• iyzico / PayTR — Ödeme işlemleri güvenliği</Text>
        <Text style={styles.listItem}>• Hotjar — Kullanıcı davranış analizi</Text>

        <Text style={styles.sectionTitle}>4. Çerezleri Nasıl Yönetirsiniz?</Text>
        <Text style={styles.paragraph}>
          Çerez tercihlerinizi aşağıdaki yöntemlerle yönetebilirsiniz:
        </Text>
        <Text style={styles.listItem}>• Tarayıcı ayarlarından çerezleri engelleyebilir veya silebilirsiniz</Text>
        <Text style={styles.listItem}>• Çerez onay bannerımızdan tercihlerinizi güncelleyebilirsiniz</Text>
        <Text style={styles.listItem}>• Mobil cihaz ayarlarından uygulama izinlerini yönetebilirsiniz</Text>
        <Text style={styles.paragraph}>
          Zorunlu çerezler dışındaki çerezleri devre dışı bırakmak, platformun bazı özelliklerinin düzgün çalışmamasına neden olabilir.
        </Text>

        <Text style={styles.sectionTitle}>5. Veri Saklama Süresi</Text>
        <Text style={styles.paragraph}>
          Oturum çerezleri tarayıcınızı kapattığınızda silinir. Kalıcı çerezler, türüne bağlı olarak 30 gün ile 2 yıl arasında cihazınızda saklanır.
        </Text>

        <Text style={styles.sectionTitle}>6. İletişim</Text>
        <Text style={styles.paragraph}>
          Çerez politikamız hakkında sorularınız için bizimle iletişime geçebilirsiniz:
        </Text>
        <Text style={styles.contactInfo}>E-posta: {PRIVACY_EMAIL}</Text>
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
  subTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text.heading,
    marginTop: theme.spacing[4],
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
    marginBottom: theme.spacing[2],
  },
});
