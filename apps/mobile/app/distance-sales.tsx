import { View, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { Text } from 'react-native-paper';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { TarodanColors } from '../src/theme';
import { useTranslation } from '../src/i18n';

export default function DistanceSalesScreen() {
  const { t } = useTranslation();
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={TarodanColors.textOnPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('mobile.pageDistanceSales')}</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.lastUpdated}>Son güncelleme: 1 Ocak 2026</Text>

        <Text style={styles.sectionTitle}>Madde 1 — Taraflar</Text>
        <Text style={styles.subTitle}>SATICI</Text>
        <Text style={styles.paragraph}>
          Unvan: Tarodan Teknoloji A.Ş.{'\n'}
          Adres: İstanbul, Türkiye{'\n'}
          E-posta: info@tarodan.com{'\n'}
          Telefon: 0850 123 4567
        </Text>
        <Text style={styles.subTitle}>ALICI</Text>
        <Text style={styles.paragraph}>
          Sipariş sürecinde belirtilen ad, adres ve iletişim bilgileri geçerlidir.
        </Text>

        <Text style={styles.sectionTitle}>Madde 2 — Sözleşmenin Konusu</Text>
        <Text style={styles.paragraph}>
          İşbu sözleşme, ALICI'nın SATICI'ya ait Tarodan platformu üzerinden elektronik ortamda sipariş verdiği ürünlerin satışı ve teslimi ile ilgili olarak 6502 sayılı Tüketicinin Korunması Hakkında Kanun ve Mesafeli Sözleşmelere Dair Yönetmelik hükümleri gereğince tarafların hak ve yükümlülüklerini düzenler.
        </Text>

        <Text style={styles.sectionTitle}>Madde 3 — Sözleşme Konusu Ürün</Text>
        <Text style={styles.paragraph}>
          Ürünün türü, miktarı, marka/modeli, rengi, adedi, satış fiyatı ve ödeme şekli sipariş onay sayfasında ve e-posta ile gönderilen sipariş özetinde belirtildiği gibidir.
        </Text>

        <Text style={styles.sectionTitle}>Madde 4 — Genel Hükümler</Text>
        <Text style={styles.listItem}>• ALICI, sipariş verdiği ürünün temel niteliklerini, satış fiyatını ve ödeme şeklini kabul ettiğini beyan eder.</Text>
        <Text style={styles.listItem}>• Ürün, eksiksiz ve sipariş özelliklerine uygun teslim edilecektir.</Text>
        <Text style={styles.listItem}>• Sözleşme konusu ürünün ALICI'ya teslimi için işbu sözleşmenin imzalanmış olması ve bedelinin ödenmesi şarttır.</Text>
        <Text style={styles.listItem}>• Ürünün tesliminden sonra ALICI'ya ait kredi kartının yetkisiz kullanımı halinde ALICI kart sahibi bankaya başvurur.</Text>

        <Text style={styles.sectionTitle}>Madde 5 — Teslimat</Text>
        <Text style={styles.paragraph}>
          Ürün, sipariş tarihinden itibaren en geç 30 gün içinde teslim edilir. Kargo ücreti ALICI'ya aittir (aksi belirtilmedikçe). Ürün, ALICI'nın sipariş formunda belirttiği adrese teslim edilir.
        </Text>
        <Text style={styles.paragraph}>
          Teslimat sırasında ALICI'nın adresinde bulunmaması durumunda kargo firması prosedürleri uygulanır. Teslimatın gecikmesi halinde ALICI siparişi iptal edebilir.
        </Text>

        <Text style={styles.sectionTitle}>Madde 6 — Cayma Hakkı</Text>
        <Text style={styles.paragraph}>
          ALICI, ürünün kendisine veya gösterdiği adresteki kişi/kuruluşa teslim tarihinden itibaren 14 gün içinde, herhangi bir gerekçe göstermeksizin ve cezai şart ödemeksizin sözleşmeden cayma hakkına sahiptir.
        </Text>
        <Text style={styles.paragraph}>
          Cayma hakkının kullanılması için bu süre içinde SATICI'ya bildirimde bulunulması zorunludur. Ürün, ambalajı açılmamış, kullanılmamış ve orijinal durumunda iade edilmelidir.
        </Text>

        <Text style={styles.sectionTitle}>Madde 7 — Cayma Hakkı Kullanılamayan Durumlar</Text>
        <Text style={styles.listItem}>• Fiyatı borsa veya benzeri piyasalardaki dalgalanmalara bağlı ürünler</Text>
        <Text style={styles.listItem}>• Tüketici talebine göre hazırlanan veya kişiye özel ürünler</Text>
        <Text style={styles.listItem}>• Çabuk bozulma veya son kullanma tarihi geçme ihtimali olan ürünler</Text>
        <Text style={styles.listItem}>• Teslimden sonra ambalajı açılmış, iade edilemeyecek nitelikteki ürünler</Text>

        <Text style={styles.sectionTitle}>Madde 8 — Ödeme ve Güvence</Text>
        <Text style={styles.paragraph}>
          Ödemeler, güvenli ödeme altyapısı (iyzico/PayTR) üzerinden kredi kartı veya banka kartı ile yapılır. Ödeme bilgileri Tarodan tarafından saklanmaz; ödeme kuruluşu tarafından güvenli ortamda işlenir.
        </Text>
        <Text style={styles.paragraph}>
          Alıcı Koruma Sistemi kapsamında ödeme, alıcı ürünü teslim alıp onaylayana kadar emanet hesapta tutulur.
        </Text>

        <Text style={styles.sectionTitle}>Madde 9 — Uyuşmazlık Çözümü</Text>
        <Text style={styles.paragraph}>
          İşbu sözleşmeden doğan uyuşmazlıklarda Tüketici Hakem Heyetleri ve Tüketici Mahkemeleri yetkilidir. Başvurular, Ticaret Bakanlığı tarafından ilan edilen parasal sınırlar dahilinde yapılır.
        </Text>

        <Text style={styles.sectionTitle}>Madde 10 — Yürürlük</Text>
        <Text style={styles.paragraph}>
          ALICI, sipariş onayı ile birlikte işbu sözleşmenin tüm koşullarını kabul etmiş sayılır. SATICI, siparişin gerçekleşmesi ile sözleşme yükümlülüklerini yerine getirmeyi taahhüt eder.
        </Text>

        <Text style={styles.contactInfo}>İletişim: legal@tarodan.com</Text>

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
  subTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: TarodanColors.textPrimary,
    marginTop: 12,
    marginBottom: 8,
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
    marginTop: 24,
    marginBottom: 8,
  },
});
