import { View, ScrollView, StyleSheet } from "react-native";
import { theme, Text, ScreenHeader } from "@tarodan/ui-native";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";
import { IP_EMAIL } from "@/constants/legalFacts";

const { colors } = theme;

export default function IntellectualPropertyScreen() {
  const { t } = useTranslation();
  return (
    <View style={styles.container}>
      <ScreenHeader
        title={t("mobile.pageIp")}
        onBack={() =>
          router.canGoBack() ? router.back() : router.replace("/(tabs)")
        }
      />

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.lastUpdated}>Son güncelleme: 1 Ocak 2026</Text>

        <Text style={styles.sectionTitle}>1. Platform İçeriği</Text>
        <Text style={styles.paragraph}>
          Tarodan platformunun tasarımı, logosu, yazılımı, kaynak kodu,
          grafikleri, metinleri, veri tabanları ve diğer tüm içerikleri Tarodan
          Teknoloji A.Ş.'nin mülkiyetinde olup, telif hakkı ve fikri mülkiyet
          yasaları ile korunmaktadır.
        </Text>

        <Text style={styles.sectionTitle}>2. Marka ve Logo</Text>
        <Text style={styles.paragraph}>
          "Tarodan" adı, logosu ve ilişkili grafik öğeler tescilli markalardır.
          Bu markaların izinsiz kullanımı, kopyalanması, değiştirilmesi veya
          dağıtılması yasaktır ve yasal işlem başlatılabilir.
        </Text>

        <Text style={styles.sectionTitle}>3. Kullanıcı İçerikleri</Text>
        <Text style={styles.paragraph}>
          Kullanıcılar, platforma yükledikleri fotoğraf, açıklama ve diğer
          içeriklerinin fikri mülkiyet haklarına sahip olduğunu veya gerekli
          izinlere sahip olduğunu beyan ve taahhüt eder.
        </Text>
        <Text style={styles.paragraph}>
          İlan oluşturarak veya içerik paylaşarak, Tarodan'a bu içerikleri
          platform hizmetleri kapsamında kullanma, görüntüleme ve dağıtma hakkı
          tanırsınız. Bu lisans, içeriğinizi platformdan kaldırmanız halinde
          sona erer.
        </Text>

        <Text style={styles.sectionTitle}>4. Üçüncü Taraf Markaları</Text>
        <Text style={styles.paragraph}>
          Platformda yer alan diecast model araç markaları (Hot Wheels,
          Matchbox, Maisto, AutoArt, vb.) ilgili marka sahiplerine aittir.
          Tarodan, bu markaların resmi distribütörü veya temsilcisi değildir.
          Marka adları yalnızca tanımlayıcı amaçla kullanılmaktadır.
        </Text>

        <Text style={styles.sectionTitle}>5. Telif Hakkı İhlali Bildirimi</Text>
        <Text style={styles.paragraph}>
          İçeriğinizin izinsiz olarak platformda kullanıldığını düşünüyorsanız,
          aşağıdaki bilgileri içeren bir bildirim gönderebilirsiniz:
        </Text>
        <Text style={styles.listItem}>• İhlal edilen eserin tanımı</Text>
        <Text style={styles.listItem}>
          • İhlal eden içeriğin platformdaki konumu (URL veya ilan numarası)
        </Text>
        <Text style={styles.listItem}>
          • İletişim bilgileriniz (ad, e-posta, telefon)
        </Text>
        <Text style={styles.listItem}>
          • İçeriğin sizin veya yetkili olduğunuz bir kişinin eserine ait
          olduğuna dair beyan
        </Text>
        <Text style={styles.listItem}>
          • Bildirimin doğruluğuna ilişkin beyan
        </Text>

        <Text style={styles.sectionTitle}>6. İhlal Durumunda Süreç</Text>
        <Text style={styles.paragraph}>Geçerli bir bildirim alındığında:</Text>
        <Text style={styles.listItem}>
          • İlgili içerik 48 saat içinde kaldırılır veya erişime kapatılır
        </Text>
        <Text style={styles.listItem}>
          • İçeriği paylaşan kullanıcıya bildirimde bulunulur
        </Text>
        <Text style={styles.listItem}>
          • Tekrarlayan ihlallerde kullanıcı hesabı kalıcı olarak kapatılabilir
        </Text>

        <Text style={styles.sectionTitle}>7. Karşı Bildirim Hakkı</Text>
        <Text style={styles.paragraph}>
          İçeriğinizin haksız yere kaldırıldığını düşünüyorsanız, karşı bildirim
          göndererek itiraz edebilirsiniz. Platform, her iki tarafın beyanlarını
          değerlendirerek karar verir.
        </Text>

        <Text style={styles.sectionTitle}>8. Yasaklı İçerikler</Text>
        <Text style={styles.listItem}>
          • Başkalarının fotoğraflarının izinsiz kullanımı
        </Text>
        <Text style={styles.listItem}>• Sahte veya taklit ürün görselleri</Text>
        <Text style={styles.listItem}>
          • Telif hakkı bulunan görsellerin izinsiz kopyalanması
        </Text>
        <Text style={styles.listItem}>
          • Diğer platformlardan alınan ve orijinal olmayan ürün açıklamaları
        </Text>

        <Text style={styles.sectionTitle}>9. İletişim</Text>
        <Text style={styles.paragraph}>Fikri mülkiyet bildirimleri için:</Text>
        <Text style={styles.contactInfo}>E-posta: {IP_EMAIL}</Text>
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
    marginBottom: theme.spacing[2],
  },
});
