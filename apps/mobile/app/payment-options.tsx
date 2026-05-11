import { View, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { theme, Text, Card } from '@tarodan/ui-native';
import { useTranslation } from '../src/i18n';

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
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={colors.white} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('mobile.pagePaymentOptions')}</Text>
        <View style={{ width: 24 }} />
      </View>

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
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8, gap: 8 }}>
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
    justifyContent: 'center',
    alignItems: 'center',
  },
  pageTitle: { fontSize: 20, fontWeight: 'bold', color: colors.text.heading },
  pageSubtitle: { fontSize: 14, color: colors.text.subtle, marginTop: 2 },
  card: { backgroundColor: colors.surface.DEFAULT, marginBottom: 12, borderRadius: 12 },
  sectionTitle: { fontSize: 16, fontWeight: '600', color: colors.text.heading, marginBottom: 8 },
  sectionContent: { fontSize: 14, color: colors.text.muted, lineHeight: 22 },
});
