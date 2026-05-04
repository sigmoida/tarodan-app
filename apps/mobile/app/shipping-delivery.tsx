import { View, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { Text, Card } from 'react-native-paper';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { TarodanColors } from '../src/theme';

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
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={TarodanColors.textOnPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Kargo ve Teslimat</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.iconRow}>
          <View style={styles.iconCircle}>
            <Ionicons name="car-outline" size={32} color={TarodanColors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.pageTitle}>Kargo ve Teslimat</Text>
            <Text style={styles.pageSubtitle}>Gönderim süreçleri hakkında bilgi</Text>
          </View>
        </View>

        {sections.map((s, i) => (
          <Card key={i} style={styles.card}>
            <Card.Content>
              <Text style={styles.sectionTitle}>{s.title}</Text>
              <Text style={styles.sectionContent}>{s.content}</Text>
            </Card.Content>
          </Card>
        ))}

        <TouchableOpacity style={styles.trackLink} onPress={() => router.push('/order-track')}>
          <Ionicons name="locate-outline" size={20} color={TarodanColors.primary} />
          <Text style={styles.trackLinkText}>Kargo Takibi</Text>
          <Ionicons name="chevron-forward" size={20} color={TarodanColors.primary} />
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: TarodanColors.backgroundSecondary },
  header: {
    backgroundColor: TarodanColors.primary,
    paddingTop: 50,
    paddingBottom: 16,
    paddingHorizontal: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerTitle: { fontSize: 18, fontWeight: 'bold', color: TarodanColors.textOnPrimary },
  content: { flex: 1, padding: 16 },
  iconRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 20, gap: 12 },
  iconCircle: {
    width: 56,
    height: 56,
    borderRadius: 12,
    backgroundColor: TarodanColors.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pageTitle: { fontSize: 20, fontWeight: 'bold', color: TarodanColors.text },
  pageSubtitle: { fontSize: 14, color: TarodanColors.textLight, marginTop: 2 },
  card: { backgroundColor: TarodanColors.background, marginBottom: 12, borderRadius: 12 },
  sectionTitle: { fontSize: 16, fontWeight: '600', color: TarodanColors.text, marginBottom: 8 },
  sectionContent: { fontSize: 14, color: TarodanColors.textSecondary, lineHeight: 22 },
  trackLink: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: TarodanColors.background,
    padding: 16,
    borderRadius: 12,
    marginTop: 8,
  },
  trackLinkText: { flex: 1, marginLeft: 12, fontSize: 15, color: TarodanColors.primary, fontWeight: '500' },
});
