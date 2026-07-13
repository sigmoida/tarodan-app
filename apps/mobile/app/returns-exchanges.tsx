import { View, ScrollView, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { theme, Text, Card, ScreenHeader } from '@tarodan/ui-native';
import { useTranslation } from '@/i18n';
import { RETURN_REQUEST_DAYS, REFUND_PAYOUT_DAYS } from '@/constants/legalFacts';

const { colors } = theme;

const sections = [
  {
    title: 'İade Politikası',
    content: `Tarodan üzerinden satın aldığınız ürünleri, teslim tarihinden itibaren ${RETURN_REQUEST_DAYS} gün içinde iade edebilirsiniz. İade edilecek ürünlerin kullanılmamış ve orijinal ambalajında olması gerekmektedir.`,
  },
  {
    title: 'İade Süreci',
    content:
      'İade talebinizi sipariş detay sayfasından veya destek ekibimize başvurarak oluşturabilirsiniz. Talebiniz onaylandıktan sonra ürünü anlaşmalı kargo firması ile gönderebilirsiniz.',
  },
  {
    title: 'İade Süreleri',
    content: `İade talebinizin onaylanmasından sonra ürünü, size iletilen kargo koduyla en kısa sürede kargoya verin. Ürün satıcıya ulaştıktan sonra iade tutarı ${REFUND_PAYOUT_DAYS} gün içinde hesabınıza aktarılır.`,
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
  content: { flex: 1, padding: theme.spacing[4] },
  iconRow: { flexDirection: 'row', alignItems: 'center', marginBottom: theme.spacing[5], gap: theme.spacing[3] },
  iconCircle: {
    width: 56,
    height: 56,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pageTitle: { fontSize: 20, fontWeight: 'bold', color: colors.text.heading },
  pageSubtitle: { fontSize: 14, color: colors.text.subtle, marginTop: theme.spacing[0.5] },
  card: { backgroundColor: colors.surface.DEFAULT, marginBottom: theme.spacing[3], borderRadius: 12 },
  sectionTitle: { fontSize: 16, fontWeight: '600', color: colors.text.heading, marginBottom: theme.spacing[2] },
  sectionContent: { fontSize: 14, color: colors.text.muted, lineHeight: 22 },
});
