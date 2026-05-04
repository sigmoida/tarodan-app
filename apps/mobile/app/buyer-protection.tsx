import { View, ScrollView, StyleSheet } from 'react-native';
import { Text, Card } from 'react-native-paper';
import { Stack, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { TouchableOpacity } from 'react-native';
import { TarodanColors } from '../src/theme';

const sections = [
  {
    title: '1. Alıcı Koruma Nedir?',
    icon: 'shield-checkmark-outline' as const,
    content: 'TARODAN Alıcı Koruma programı, platform üzerinden yaptığınız alışverişlerde ürünün tanıma uygun gelmemesi, hiç gönderilmemesi veya ciddi anlaşmazlık durumlarında inceleme ve gerekirse para iadesi süreçlerini kapsar.',
  },
  {
    title: '2. Kapsam',
    icon: 'list-outline' as const,
    content: '• Platformda ödeme alınan siparişler\n• Ürün hiç kargolanmadı veya takip bilgisi verilmedi\n• Ürün açıklamaya ciddi şekilde aykırı\n• Sahte veya taklit ürün iddiası',
  },
  {
    title: '3. Para İade Garantisi',
    icon: 'cash-outline' as const,
    content: 'Uygun koşullarda ve inceleme sonucunda para iadesi yapılabilir. "Para iade garantisi" her durumda otomatik iade anlamına gelmez; her talep ayrı ayrı incelenir.',
  },
  {
    title: '4. Anlaşmazlık Çözümü',
    icon: 'chatbubbles-outline' as const,
    content: '1. Satıcı ile iletişime geçin\n2. Destek talebi açın (Hesabım → Siparişlerim → Sorun bildir)\n3. Ekibimiz durumu inceler\n4. Karar ve uygulama\n\nSüre: 5–10 iş günü.',
  },
  {
    title: '5. Sizin Yapmanız Gerekenler',
    icon: 'checkbox-outline' as const,
    content: '• Sipariş ve hasar fotoğraflarını saklayın\n• Kargo takip ve iletişim geçmişini paylaşın\n• Talep açıklamasını net yazın\n• Platform iletişimlerine zamanında cevap verin',
  },
  {
    title: '6. Sınırlamalar',
    icon: 'warning-outline' as const,
    content: 'Alıcı koruma yasal haklarınızın yerine geçmez; onlara ek olarak sunulur.',
  },
  {
    title: '7. İletişim',
    icon: 'mail-outline' as const,
    content: 'destek@tarodan.com – konu: "Alıcı Koruma – Sipariş No"',
  },
];

export default function BuyerProtectionScreen() {
  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: 'Alıcı Koruma' }} />

      <View style={styles.hero}>
        <Ionicons name="shield-checkmark" size={40} color="#fff" />
        <Text style={styles.heroTitle}>Alıcı Koruma Programı</Text>
        <Text style={styles.heroDate}>Son güncelleme: 24 Ocak 2026</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {sections.map((section, i) => (
          <Card key={i} style={styles.card}>
            <Card.Content>
              <View style={styles.sectionHeader}>
                <Ionicons name={section.icon} size={20} color={TarodanColors.primary} />
                <Text variant="titleSmall" style={styles.sectionTitle}>{section.title}</Text>
              </View>
              <Text variant="bodyMedium" style={styles.text}>{section.content}</Text>
            </Card.Content>
          </Card>
        ))}

        <View style={styles.links}>
          <TouchableOpacity style={styles.linkButton} onPress={() => router.push('/refund-policy' as any)}>
            <Text style={styles.linkText}>İade Politikası</Text>
            <Ionicons name="chevron-forward" size={18} color={TarodanColors.primary} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.linkButton} onPress={() => router.push('/returns-exchanges' as any)}>
            <Text style={styles.linkText}>İade ve Değişim</Text>
            <Ionicons name="chevron-forward" size={18} color={TarodanColors.primary} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.linkButton} onPress={() => router.push('/terms')}>
            <Text style={styles.linkText}>Kullanım Şartları</Text>
            <Ionicons name="chevron-forward" size={18} color={TarodanColors.primary} />
          </TouchableOpacity>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: TarodanColors.backgroundSecondary },
  hero: {
    backgroundColor: '#1F2937',
    paddingVertical: 32,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  heroTitle: { fontSize: 22, fontWeight: 'bold', color: '#fff', marginTop: 12 },
  heroDate: { fontSize: 13, color: '#9CA3AF', marginTop: 6 },
  content: { padding: 16 },
  card: { marginBottom: 12, backgroundColor: TarodanColors.background },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 10, gap: 8 },
  sectionTitle: { fontWeight: '600', color: TarodanColors.textPrimary, flex: 1 },
  text: { color: TarodanColors.textSecondary, lineHeight: 22 },
  links: { marginTop: 8 },
  linkButton: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: TarodanColors.background,
    padding: 16,
    borderRadius: 12,
    marginBottom: 8,
  },
  linkText: { fontSize: 15, color: TarodanColors.primary, fontWeight: '500' },
});
