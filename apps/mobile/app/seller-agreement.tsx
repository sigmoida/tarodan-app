import { View, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { Text } from 'react-native-paper';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { TarodanColors } from '../src/theme';

export default function SellerAgreementScreen() {
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={TarodanColors.textOnPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Satıcı Sözleşmesi</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.lastUpdated}>Son güncelleme: 1 Ocak 2026</Text>

        <Text style={styles.sectionTitle}>1. Taraflar ve Tanımlar</Text>
        <Text style={styles.paragraph}>
          İşbu sözleşme, Tarodan Teknoloji A.Ş. ("Platform") ile Tarodan platformu üzerinden ürün satışı yapan gerçek veya tüzel kişi ("Satıcı") arasında akdedilmiştir.
        </Text>

        <Text style={styles.sectionTitle}>2. Sözleşmenin Konusu</Text>
        <Text style={styles.paragraph}>
          Satıcı'nın Tarodan platformu üzerinden diecast model araç ve koleksiyon ürünleri satışına ilişkin hak, yükümlülük ve koşulları düzenler.
        </Text>

        <Text style={styles.sectionTitle}>3. Satıcı Yükümlülükleri</Text>
        <Text style={styles.listItem}>• Listelenen ürünlerin doğru, eksiksiz ve güncel bilgilerle tanımlanması</Text>
        <Text style={styles.listItem}>• Ürün fotoğraflarının gerçek ve ürünü doğru yansıtması</Text>
        <Text style={styles.listItem}>• Ürünün belirtilen durumda (sıfır, az kullanılmış, vb.) olması</Text>
        <Text style={styles.listItem}>• Satış gerçekleştikten sonra 3 iş günü içinde kargo teslimi</Text>
        <Text style={styles.listItem}>• Platform kurallarına ve Türkiye Cumhuriyeti mevzuatına uyum</Text>
        <Text style={styles.listItem}>• Sahte, taklit veya çalıntı ürün satmama</Text>
        <Text style={styles.listItem}>• Alıcılarla profesyonel ve saygılı iletişim</Text>

        <Text style={styles.sectionTitle}>4. Platform Yükümlülükleri</Text>
        <Text style={styles.listItem}>• Satış altyapısının sorunsuz çalışmasını sağlama</Text>
        <Text style={styles.listItem}>• Güvenli ödeme sistemi sunma</Text>
        <Text style={styles.listItem}>• Uyuşmazlık durumunda arabuluculuk yapma</Text>
        <Text style={styles.listItem}>• Satıcı paneli ve raporlama araçları sağlama</Text>

        <Text style={styles.sectionTitle}>5. Komisyon ve Ücretler</Text>
        <Text style={styles.paragraph}>
          Her başarılı satıştan platform komisyonu kesilir. Standart komisyon oranı %5'tir. Premium üyelik planlarında özel komisyon oranları uygulanabilir.
        </Text>
        <Text style={styles.listItem}>• Ücretsiz Üye: Aylık 5 ilan hakkı, %5 komisyon</Text>
        <Text style={styles.listItem}>• Premium Üye: Sınırsız ilan, %3 komisyon</Text>
        <Text style={styles.listItem}>• Pro Üye: Sınırsız ilan, %2 komisyon, öncelikli destek</Text>

        <Text style={styles.sectionTitle}>6. Ödeme Koşulları</Text>
        <Text style={styles.paragraph}>
          Satış bedeli, alıcının ürünü teslim aldığını onaylamasının ardından 3 iş günü içinde Satıcı'nın tanımlı banka hesabına (IBAN) aktarılır. Komisyon ve varsa iade tutarları düşülerek ödeme yapılır.
        </Text>

        <Text style={styles.sectionTitle}>7. İade ve İptal</Text>
        <Text style={styles.paragraph}>
          Alıcı'nın cayma hakkı kapsamındaki iade taleplerinde Satıcı, ürünü teslim aldıktan sonra 3 iş günü içinde iade bedelini onaylamakla yükümlüdür. Ürünün açıklamaya uygun olmaması durumunda iade masrafları Satıcı'ya aittir.
        </Text>

        <Text style={styles.sectionTitle}>8. Yasaklı Ürünler</Text>
        <Text style={styles.listItem}>• Sahte veya taklit ürünler</Text>
        <Text style={styles.listItem}>• Çalıntı ürünler</Text>
        <Text style={styles.listItem}>• Yasal olmayan veya tehlikeli maddeler</Text>
        <Text style={styles.listItem}>• Platformun kategorileri dışında kalan ürünler</Text>
        <Text style={styles.listItem}>• Telif hakkı ihlali içeren ürünler</Text>

        <Text style={styles.sectionTitle}>9. Hesap Askıya Alma ve Fesih</Text>
        <Text style={styles.paragraph}>
          Platform, sözleşme ihlali, olumsuz alıcı geri bildirimleri veya kural dışı davranış tespit etmesi halinde Satıcı hesabını uyarabilir, geçici olarak askıya alabilir veya kalıcı olarak kapatabilir. Bekleyen ödemeler, soruşturma sonuçlanana kadar dondurulabilir.
        </Text>

        <Text style={styles.sectionTitle}>10. Uyuşmazlık Çözümü</Text>
        <Text style={styles.paragraph}>
          İşbu sözleşmeden doğan uyuşmazlıklarda öncelikle platform dahili çözüm mekanizması uygulanır. Çözüme ulaşılamaması halinde İstanbul Mahkemeleri ve İcra Daireleri yetkilidir.
        </Text>

        <Text style={styles.contactInfo}>İletişim: seller-support@tarodan.com</Text>

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
    marginTop: 24,
    marginBottom: 8,
  },
});
