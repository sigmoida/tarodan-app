import { View, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { theme, Text, Card } from '@tarodan/ui-native';
import { useTranslation } from '../src/i18n';

const { colors } = theme;

const sections = [
  {
    title: 'Kargo Yöntemleri',
    content:
      'Tarodan üzerinden yapılan tüm gönderimler, anlaşmalı kargo firmaları aracılığıyla gerçekleştirilir. Satıcı, ürünü güvenli bir şekilde paketleyerek kargo firmasına teslim eder.',
  },
  {
    title: 'Kargo Ücretleri',
    content:
      'Kargo ücretleri ürün ağırlığına, boyutuna ve gönderim mesafesine göre değişiklik gösterebilir. Ödeme sayfasında kargo ücreti otomatik olarak hesaplanır.',
  },
  {
    title: 'Teslimat Süreleri',
    content:
      'Yurt içi gönderimler genellikle 2-5 iş günü içinde teslim edilir. Kargo takip numarası ile gönderiminizi anlık olarak takip edebilirsiniz.',
  },
  {
    title: 'Kargo Takibi',
    content:
      'Satıcı ürünü kargoya verdikten sonra size bir takip numarası iletilir. Bu numara ile gönderiminizin durumunu istediğiniz zaman kontrol edebilirsiniz.',
  },
];

export default function ShippingDeliveryScreen() {
  const { t } = useTranslation();
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={colors.white} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('mobile.pageShipping')}</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.iconRow}>
          <View style={styles.iconCircle}>
            <Ionicons name="car-outline" size={32} color={colors.primary[600]!} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.pageTitle}>Kargo ve Teslimat</Text>
            <Text style={styles.pageSubtitle}>Gönderim süreçleri hakkında bilgi</Text>
          </View>
        </View>

        {sections.map((s, i) => (
          <Card key={i} style={styles.card}>
            <Text style={styles.sectionTitle}>{s.title}</Text>
            <Text style={styles.sectionContent}>{s.content}</Text>
          </Card>
        ))}

        <TouchableOpacity style={styles.trackLink} onPress={() => router.push('/order-track')}>
          <Ionicons name="locate-outline" size={20} color={colors.primary[600]!} />
          <Text style={styles.trackLinkText}>Kargo Takibi</Text>
          <Ionicons name="chevron-forward" size={20} color={colors.primary[600]!} />
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface.alt },
  header: {
    backgroundColor: colors.primary[600]!,
    paddingTop: 50,
    paddingBottom: 16,
    paddingHorizontal: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerTitle: { fontSize: 18, fontWeight: 'bold', color: colors.white },
  content: { flex: 1, padding: 16 },
  iconRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 20, gap: 12 },
  iconCircle: {
    width: 56,
    height: 56,
    borderRadius: 12,
    backgroundColor: colors.primary[50]!,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pageTitle: { fontSize: 20, fontWeight: 'bold', color: colors.text.heading },
  pageSubtitle: { fontSize: 14, color: colors.text.subtle, marginTop: 2 },
  card: { backgroundColor: colors.surface.DEFAULT, marginBottom: 12, borderRadius: 12 },
  sectionTitle: { fontSize: 16, fontWeight: '600', color: colors.text.heading, marginBottom: 8 },
  sectionContent: { fontSize: 14, color: colors.text.muted, lineHeight: 22 },
  trackLink: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface.DEFAULT,
    padding: 16,
    borderRadius: 12,
    marginTop: 8,
  },
  trackLinkText: { flex: 1, marginLeft: 12, fontSize: 15, color: colors.primary[600]!, fontWeight: '500' },
});
