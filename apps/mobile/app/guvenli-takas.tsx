import { View, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { Text } from 'react-native-paper';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { TarodanColors } from '../src/theme';
import { useTranslation } from '../src/i18n';

const STEPS = [
  {
    icon: 'search-outline' as const,
    title: 'Ürün Bulun',
    description: '"Takas Açık" etiketli ürünleri arayın veya filtreleyin.',
  },
  {
    icon: 'swap-horizontal-outline' as const,
    title: 'Teklif Gönderin',
    description: 'Kendi koleksiyonunuzdan ürün seçin, gerekirse nakit fark ekleyin ve teklif gönderin.',
  },
  {
    icon: 'chatbubbles-outline' as const,
    title: 'Müzakere Edin',
    description: 'Karşı taraf kabul edebilir, reddedebilir veya karşı teklif gönderebilir.',
  },
  {
    icon: 'checkmark-circle-outline' as const,
    title: 'Onaylayın',
    description: 'Her iki taraf da takas şartlarını kabul ettiğinde takas resmi olarak başlar.',
  },
  {
    icon: 'cube-outline' as const,
    title: 'Kargolayın',
    description: 'Ürünlerinizi güvenli şekilde paketleyerek belirtilen süre içinde kargoya verin.',
  },
  {
    icon: 'shield-checkmark-outline' as const,
    title: 'Teslim Alın ve Onaylayın',
    description: 'Ürünü kontrol edin ve "Teslim Aldım" ile onaylayın. Takas tamamlanır.',
  },
];

export default function GuvenliTakasScreen() {
  const { t } = useTranslation();
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={TarodanColors.textOnPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('mobile.pageSafeTrade')}</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <Ionicons name="swap-horizontal" size={56} color={TarodanColors.primary} />
          <Text style={styles.heroTitle}>Güvenli Takas Sistemi</Text>
          <Text style={styles.heroText}>
            Koleksiyonunuzu büyütmenin en kolay yolu. Platform güvencesi altında diğer koleksiyonerlerle model araçlarınızı takas edin.
          </Text>
        </View>

        <Text style={styles.sectionTitle}>Nasıl Çalışır?</Text>
        {STEPS.map((step, index) => (
          <View key={index} style={styles.stepCard}>
            <View style={styles.stepLeft}>
              <View style={styles.stepNumberBadge}>
                <Text style={styles.stepNumber}>{index + 1}</Text>
              </View>
              {index < STEPS.length - 1 && <View style={styles.stepLine} />}
            </View>
            <View style={styles.stepContent}>
              <View style={styles.stepIconRow}>
                <Ionicons name={step.icon} size={20} color={TarodanColors.primary} />
                <Text style={styles.stepTitle}>{step.title}</Text>
              </View>
              <Text style={styles.stepDesc}>{step.description}</Text>
            </View>
          </View>
        ))}

        <Text style={styles.sectionTitle}>Güvenlik Garantileri</Text>
        <View style={styles.guaranteeCard}>
          <View style={styles.guaranteeRow}>
            <Ionicons name="checkmark-circle" size={20} color={TarodanColors.accent} />
            <Text style={styles.guaranteeText}>Her iki tarafın ürünleri platform garantisi altındadır</Text>
          </View>
          <View style={styles.guaranteeRow}>
            <Ionicons name="checkmark-circle" size={20} color={TarodanColors.accent} />
            <Text style={styles.guaranteeText}>Nakit fark ödemeleri güvenli emanet hesapta tutulur</Text>
          </View>
          <View style={styles.guaranteeRow}>
            <Ionicons name="checkmark-circle" size={20} color={TarodanColors.accent} />
            <Text style={styles.guaranteeText}>Anlaşmazlık durumunda platform arabuluculuk yapar</Text>
          </View>
          <View style={styles.guaranteeRow}>
            <Ionicons name="checkmark-circle" size={20} color={TarodanColors.accent} />
            <Text style={styles.guaranteeText}>Ürün açıklamaya uymuyorsa takas iptal edilebilir</Text>
          </View>
          <View style={styles.guaranteeRow}>
            <Ionicons name="checkmark-circle" size={20} color={TarodanColors.accent} />
            <Text style={styles.guaranteeText}>Kargo takibi her iki taraf için de platformda görüntülenir</Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Kimler Takas Yapabilir?</Text>
        <Text style={styles.paragraph}>
          Takas özelliği Premium ve Pro üyelere açıktır. Takas yapmak için en az bir aktif ilanınızın bulunması ve hesabınızın doğrulanmış olması gerekmektedir.
        </Text>

        <Text style={styles.sectionTitle}>Fark Ödemeli Takas</Text>
        <Text style={styles.paragraph}>
          Takas edilen ürünlerin değerleri eşit olmak zorunda değildir. Teklifte nakit fark belirleyebilirsiniz. Fark ödemesi, güvenli ödeme sistemi üzerinden alıcı koruma kapsamında işlenir.
        </Text>

        <TouchableOpacity
          style={styles.ctaButton}
          onPress={() => router.push('/(tabs)/trades')}
          activeOpacity={0.8}
        >
          <Ionicons name="swap-horizontal" size={20} color={TarodanColors.textOnPrimary} />
          <Text style={styles.ctaText}>Takas Tekliflerini Keşfet</Text>
        </TouchableOpacity>

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
  hero: {
    alignItems: 'center',
    paddingVertical: 24,
    marginBottom: 8,
  },
  heroTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: TarodanColors.textPrimary,
    marginTop: 12,
  },
  heroText: {
    fontSize: 14,
    color: TarodanColors.textSecondary,
    lineHeight: 22,
    textAlign: 'center',
    marginTop: 8,
    paddingHorizontal: 10,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: TarodanColors.textPrimary,
    marginTop: 24,
    marginBottom: 16,
  },
  stepCard: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  stepLeft: {
    alignItems: 'center',
    width: 36,
    marginRight: 12,
  },
  stepNumberBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: TarodanColors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepNumber: {
    fontSize: 13,
    fontWeight: 'bold',
    color: TarodanColors.textOnPrimary,
  },
  stepLine: {
    width: 2,
    flex: 1,
    backgroundColor: TarodanColors.primaryMedium,
    marginVertical: 4,
  },
  stepContent: {
    flex: 1,
    paddingBottom: 20,
  },
  stepIconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  stepTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: TarodanColors.textPrimary,
  },
  stepDesc: {
    fontSize: 13,
    color: TarodanColors.textSecondary,
    lineHeight: 20,
  },
  guaranteeCard: {
    backgroundColor: TarodanColors.accentLight,
    borderRadius: 12,
    padding: 16,
    gap: 12,
  },
  guaranteeRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  guaranteeText: {
    flex: 1,
    fontSize: 13,
    color: TarodanColors.textSecondary,
    lineHeight: 20,
  },
  paragraph: {
    fontSize: 14,
    color: TarodanColors.textSecondary,
    lineHeight: 22,
    marginBottom: 12,
  },
  ctaButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: TarodanColors.primary,
    paddingVertical: 14,
    borderRadius: 12,
    marginTop: 24,
    gap: 8,
  },
  ctaText: {
    fontSize: 15,
    fontWeight: '600',
    color: TarodanColors.textOnPrimary,
  },
});
