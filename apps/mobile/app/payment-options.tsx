import { View, ScrollView, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { theme, Text, Card, ScreenHeader } from '@tarodan/ui-native';
import { useTranslation } from '@/i18n';

const { colors } = theme;

const sections = [
  {
    title: 'Kabul Edilen Ödeme Yöntemleri',
    content:
      'Tarodan üzerinde kredi kartı ve banka kartı ile güvenli ödeme yapabilirsiniz. Visa, Mastercard ve Troy kartları desteklenmektedir.',
  },
  {
    icon: 'shield-checkmark-outline',
    title: 'Ödeme Güvenliği',
    content:
      'Tüm ödemeler 256-bit SSL şifreleme ile korunmaktadır. Kart bilgileriniz PayTR güvenli altyapısı üzerinden işlenir ve sunucularımızda saklanmaz.',
  },
  {
    title: 'Taksit Seçenekleri',
    content:
      'Anlaşmalı bankalar aracılığıyla taksit seçeneklerinden yararlanabilirsiniz. Taksit detayları ödeme sayfasında kartınıza göre gösterilir.',
  },
];

export default function PaymentOptionsScreen() {
  const { t } = useTranslation();
  return (
    <View style={styles.container}>
      <ScreenHeader title={t('mobile.pagePaymentOptions')} onBack={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)'))} />

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.iconRow}>
          <View style={[styles.iconCircle, { backgroundColor: colors.success[50]! }]}>
            <Ionicons name="card-outline" size={32} color={colors.success[700]!} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.pageTitle}>Ödeme Seçenekleri</Text>
            <Text style={styles.pageSubtitle}>Güvenli ödeme yöntemleri</Text>
          </View>
        </View>

        {sections.map((s, i) => (
          <Card key={i} style={styles.card}>
            {s.icon && (
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: theme.spacing[2], gap: theme.spacing[2] }}>
                <Ionicons name={s.icon as any} size={20} color={colors.success[700]!} />
                <Text style={styles.sectionTitle}>{s.title}</Text>
              </View>
            )}
            {!s.icon && <Text style={styles.sectionTitle}>{s.title}</Text>}
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
