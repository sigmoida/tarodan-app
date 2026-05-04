import { View, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { Text } from 'react-native-paper';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { TarodanColors } from '../src/theme';

export default function RefundPolicyScreen() {
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={TarodanColors.textOnPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>İade Politikası</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.lastUpdated}>Son güncelleme: 1 Ocak 2026</Text>

        <Text style={styles.sectionTitle}>1. Genel İade Koşulları</Text>
        <Text style={styles.paragraph}>
          Tarodan platformu üzerinden satın aldığınız ürünleri, teslim tarihinden itibaren 14 gün içinde iade edebilirsiniz. İade hakkınız, 6502 sayılı Tüketicinin Korunması Hakkında Kanun kapsamında güvence altındadır.
        </Text>

        <Text style={styles.sectionTitle}>2. İade Şartları</Text>
        <Text style={styles.listItem}>• Ürün, teslim tarihinden itibaren 14 gün içinde iade talebi oluşturulmalıdır</Text>
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
          Ürünü orijinal ambalajında, belirtilen kargo kodu ile 3 iş günü içinde gönderin.
        </Text>
        <Text style={styles.subTitle}>Adım 4: İade Onayı ve Ödeme</Text>
        <Text style={styles.paragraph}>
          Satıcı ürünü teslim alıp kontrol ettikten sonra iade tutarı 3-5 iş günü içinde ödeme yönteminize iade edilir.
        </Text>

        <Text style={styles.sectionTitle}>4. İade Edilemeyen Ürünler</Text>
        <Text style={styles.listItem}>• Ambalajı açılmış ve hasar görmüş ürünler</Text>
        <Text style={styles.listItem}>• Kişiye özel hazırlanmış (custom) ürünler</Text>
        <Text style={styles.listItem}>• 14 günlük süreyi aşmış talepler</Text>
        <Text style={styles.listItem}>• Satıcı tarafından "iade kabul edilmez" olarak işaretlenmiş özel ürünler (detaylar ürün sayfasında belirtilir)</Text>

        <Text style={styles.sectionTitle}>5. Hasarlı veya Hatalı Ürün</Text>
        <Text style={styles.paragraph}>
          Ürünün hasarlı, hatalı veya açıklamaya uygun olmadığını tespit ederseniz, teslim tarihinden itibaren 3 gün içinde fotoğraflı bildirimde bulunun. Bu durumda kargo ücreti satıcıya aittir ve tam iade yapılır.
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

        <Text style={styles.contactInfo}>E-posta: destek@tarodan.com</Text>
        <Text style={styles.contactInfo}>Telefon: 0850 123 4567</Text>

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
    marginTop: 8,
    marginBottom: 4,
  },
});
