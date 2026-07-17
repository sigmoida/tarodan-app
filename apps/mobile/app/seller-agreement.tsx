import { View, ScrollView, StyleSheet } from "react-native";
import { router } from "expo-router";
import { theme, Text, ScreenHeader } from "@tarodan/ui-native";
import { useTranslation } from "react-i18next";
import {
  COMMISSION_SUMMARY,
  SELLER_SUPPORT_EMAIL,
} from "@/constants/legalFacts";

const { colors } = theme;

export default function SellerAgreementScreen() {
  const { t } = useTranslation();
  return (
    <View style={styles.container}>
      <ScreenHeader
        title={t("mobile.pageSellerAgreement")}
        onBack={() =>
          router.canGoBack() ? router.back() : router.replace("/(tabs)")
        }
      />

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.lastUpdated}>Son güncelleme: 1 Ocak 2026</Text>

        <Text style={styles.sectionTitle}>1. Taraflar ve Tanımlar</Text>
        <Text style={styles.paragraph}>
          İşbu sözleşme, Tarodan Teknoloji A.Ş. ("Platform") ile Tarodan
          platformu üzerinden ürün satışı yapan gerçek veya tüzel kişi
          ("Satıcı") arasında akdedilmiştir.
        </Text>

        <Text style={styles.sectionTitle}>2. Sözleşmenin Konusu</Text>
        <Text style={styles.paragraph}>
          Satıcı'nın Tarodan platformu üzerinden diecast model araç ve
          koleksiyon ürünleri satışına ilişkin hak, yükümlülük ve koşulları
          düzenler.
        </Text>

        <Text style={styles.sectionTitle}>3. Satıcı Yükümlülükleri</Text>
        <Text style={styles.listItem}>
          • Listelenen ürünlerin doğru, eksiksiz ve güncel bilgilerle
          tanımlanması
        </Text>
        <Text style={styles.listItem}>
          • Ürün fotoğraflarının gerçek ve ürünü doğru yansıtması
        </Text>
        <Text style={styles.listItem}>
          • Ürünün belirtilen durumda (sıfır, az kullanılmış, vb.) olması
        </Text>
        <Text style={styles.listItem}>
          • Satış gerçekleştikten sonra 3 iş günü içinde kargo teslimi
        </Text>
        <Text style={styles.listItem}>
          • Platform kurallarına ve Türkiye Cumhuriyeti mevzuatına uyum
        </Text>
        <Text style={styles.listItem}>
          • Sahte, taklit veya çalıntı ürün satmama
        </Text>
        <Text style={styles.listItem}>
          • Alıcılarla profesyonel ve saygılı iletişim
        </Text>

        <Text style={styles.sectionTitle}>4. Platform Yükümlülükleri</Text>
        <Text style={styles.listItem}>
          • Satış altyapısının sorunsuz çalışmasını sağlama
        </Text>
        <Text style={styles.listItem}>• Güvenli ödeme sistemi sunma</Text>
        <Text style={styles.listItem}>
          • Uyuşmazlık durumunda arabuluculuk yapma
        </Text>
        <Text style={styles.listItem}>
          • Satıcı paneli ve raporlama araçları sağlama
        </Text>

        <Text style={styles.sectionTitle}>5. Komisyon ve Ücretler</Text>
        <Text style={styles.paragraph}>
          Her başarılı satıştan platform komisyonu kesilir. {COMMISSION_SUMMARY}
        </Text>
        <Text style={styles.listItem}>• Ücretsiz Üye: Aylık 5 ilan hakkı</Text>
        <Text style={styles.listItem}>
          • Premium Üye: Sınırsız ilan, düşük komisyon
        </Text>
        <Text style={styles.listItem}>
          • Pro Üye: Sınırsız ilan, en düşük komisyon, öncelikli destek
        </Text>

        <Text style={styles.sectionTitle}>6. Ödeme Koşulları</Text>
        <Text style={styles.paragraph}>
          Satış bedeli, alıcının ürünü teslim aldığını onaylamasının ardından 3
          iş günü içinde Satıcı'nın tanımlı banka hesabına (IBAN) aktarılır.
          Komisyon ve varsa iade tutarları düşülerek ödeme yapılır.
        </Text>

        <Text style={styles.sectionTitle}>7. İade ve İptal</Text>
        <Text style={styles.paragraph}>
          Alıcı'nın cayma hakkı kapsamındaki iade taleplerinde Satıcı, ürünü
          teslim aldıktan sonra 3 iş günü içinde iade bedelini onaylamakla
          yükümlüdür. Ürünün açıklamaya uygun olmaması durumunda iade masrafları
          Satıcı'ya aittir.
        </Text>

        <Text style={styles.sectionTitle}>8. Yasaklı Ürünler</Text>
        <Text style={styles.listItem}>• Sahte veya taklit ürünler</Text>
        <Text style={styles.listItem}>• Çalıntı ürünler</Text>
        <Text style={styles.listItem}>
          • Yasal olmayan veya tehlikeli maddeler
        </Text>
        <Text style={styles.listItem}>
          • Platformun kategorileri dışında kalan ürünler
        </Text>
        <Text style={styles.listItem}>• Telif hakkı ihlali içeren ürünler</Text>

        <Text style={styles.sectionTitle}>9. Hesap Askıya Alma ve Fesih</Text>
        <Text style={styles.paragraph}>
          Platform, sözleşme ihlali, olumsuz alıcı geri bildirimleri veya kural
          dışı davranış tespit etmesi halinde Satıcı hesabını uyarabilir, geçici
          olarak askıya alabilir veya kalıcı olarak kapatabilir. Bekleyen
          ödemeler, soruşturma sonuçlanana kadar dondurulabilir.
        </Text>

        <Text style={styles.sectionTitle}>10. Uyuşmazlık Çözümü</Text>
        <Text style={styles.paragraph}>
          İşbu sözleşmeden doğan uyuşmazlıklarda öncelikle platform dahili çözüm
          mekanizması uygulanır. Çözüme ulaşılamaması halinde İstanbul
          Mahkemeleri ve İcra Daireleri yetkilidir.
        </Text>

        <Text style={styles.contactInfo}>İletişim: {SELLER_SUPPORT_EMAIL}</Text>

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
    fontWeight: "bold",
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
    marginTop: theme.spacing[6],
    marginBottom: theme.spacing[2],
  },
});
