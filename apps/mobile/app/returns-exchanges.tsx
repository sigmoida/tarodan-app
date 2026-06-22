import { View, ScrollView, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { theme, Text, Card, ScreenHeader } from '@tarodan/ui-native';
import { useTranslation } from '../src/i18n';

const { colors } = theme;

const sections = [
  {
    title: 'İade Politikası',
    content:
      'Tarodan üzerinden satın aldığınız ürünleri, teslim tarihinden itibaren 14 gün içinde iade edebilirsiniz. İade edilecek ürünlerin kullanılmamış ve orijinal ambalajında olması gerekmektedir.',
  },
  {
    title: 'İade Süreci',
    content:
      'İade talebinizi sipariş detay sayfasından veya destek ekibimize başvurarak oluşturabilirsiniz. Talebiniz onaylandıktan sonra ürünü anlaşmalı kargo firması ile gönderebilirsiniz.',
  },
  {
    title: 'İade Süreleri',
    content:
      'İade talebinizin onaylanmasından sonra ürünü 7 iş günü içinde kargoya vermeniz gerekmektedir. Ürün tarafımıza ulaştıktan sonra iade tutarı 3-5 iş günü içinde hesabınıza aktarılır.',
  },
];

export default function ReturnsExchangesScreen() {
  const { t } = useTranslation();
  return (
    <View style={styles.container}>
      <ScreenHeader title={t('mobile.pageReturns')} onBack={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)'))} />

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.iconRow}>
          <View style={[styles.iconCircle, { backgroundColor: colors.info[50]! }]}>
            <Ionicons name="repeat-outline" size={32} color={colors.info[600]!} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.pageTitle}>İade ve Değişim</Text>
            <Text style={styles.pageSubtitle}>İade ve değişim koşulları hakkında bilgi</Text>
          </View>
        </View>

        {sections.map((s, i) => (
          <Card key={i} style={styles.card}>
            <Text style={styles.sectionTitle}>{s.title}</Text>
            <Text style={styles.sectionContent}>{s.content}</Text>
          </Card>
        ))}

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface.alt },
  content: { flex: 1, padding: 16 },
  iconRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 20, gap: 12 },
  iconCircle: {
    width: 56,
    height: 56,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pageTitle: { fontSize: 20, fontWeight: 'bold', color: colors.text.heading },
  pageSubtitle: { fontSize: 14, color: colors.text.subtle, marginTop: 2 },
  card: { backgroundColor: colors.surface.DEFAULT, marginBottom: 12, borderRadius: 12 },
  sectionTitle: { fontSize: 16, fontWeight: '600', color: colors.text.heading, marginBottom: 8 },
  sectionContent: { fontSize: 14, color: colors.text.muted, lineHeight: 22 },
});
