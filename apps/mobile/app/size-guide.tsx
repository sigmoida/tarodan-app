import { View, ScrollView, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { theme, Text, ScreenHeader } from '@tarodan/ui-native';
import { useTranslation } from '@/i18n';

const { colors } = theme;

const SCALES = [
  {
    scale: '1:8',
    length: '~55-65 cm',
    weight: '~3-5 kg',
    description: 'En büyük ve en detaylı ölçek. Gerçek araç boyutunun 1/8\'i kadardır. Genellikle yüksek kaliteli reçine veya metal malzemeden üretilir. Koleksiyoncular için vitrin ürünüdür.',
    brands: 'Pocher, DeAgostini, GT Spirit',
    priceRange: '₺5.000 - ₺50.000+',
    highlight: true,
  },
  {
    scale: '1:12',
    length: '~35-40 cm',
    weight: '~1.5-3 kg',
    description: 'Büyük ve detaylı modeller. Açılır kapılar, motor detayları ve gerçekçi iç mekan özellikleri yaygındır. Premium koleksiyon parçası olarak tercih edilir.',
    brands: 'Kyosho, AUTOart, TSM',
    priceRange: '₺2.000 - ₺20.000',
    highlight: false,
  },
  {
    scale: '1:18',
    length: '~25-30 cm',
    weight: '~800g - 1.5 kg',
    description: 'En popüler koleksiyon ölçeği. Açılır kapılar, kaput, bagaj ve direksiyon detayları içerir. Geniş marka ve model yelpazesi mevcuttur.',
    brands: 'AUTOart, CMC, BBR, Maisto, Bburago',
    priceRange: '₺300 - ₺15.000',
    highlight: true,
  },
  {
    scale: '1:24',
    length: '~18-20 cm',
    weight: '~300-500g',
    description: 'Uygun fiyat/boyut dengesi sunar. Hobi ve koleksiyon için idealdir. Bazı modellerde açılır parçalar bulunur. Geniş çeşitlilik sunar.',
    brands: 'Maisto, Welly, Jada Toys, Motormax',
    priceRange: '₺100 - ₺2.000',
    highlight: false,
  },
  {
    scale: '1:32',
    length: '~12-15 cm',
    weight: '~100-200g',
    description: 'Orta boy modeller. Slot car yarışları için de kullanılan popüler bir ölçektir. Detay seviyesi ölçeğe göre tatmin edicidir.',
    brands: 'Bburago, Siku, Kinsmart',
    priceRange: '₺50 - ₺500',
    highlight: false,
  },
  {
    scale: '1:36',
    length: '~11-13 cm',
    weight: '~80-150g',
    description: 'Çekbırak (pull-back) mekanizmalı modellerde yaygın ölçektir. Uygun fiyatlı giriş seviyesi koleksiyon parçalarıdır.',
    brands: 'Kinsmart, Welly, RMZ City',
    priceRange: '₺30 - ₺200',
    highlight: false,
  },
  {
    scale: '1:43',
    length: '~9-11 cm',
    weight: '~50-120g',
    description: 'Vitrin koleksiyonu için ideal boyut. Az yer kaplar, detaylı modeller bulunur. Özellikle yarış araçları ve klasik otomobillerde popülerdir.',
    brands: 'Spark, IXO, Minichamps, Schuco',
    priceRange: '₺80 - ₺3.000',
    highlight: true,
  },
  {
    scale: '1:64',
    length: '~7-8 cm',
    weight: '~30-50g',
    description: 'En yaygın ve uygun fiyatlı ölçek. Hot Wheels ve Matchbox boyutudur. Geniş model çeşitliliği ve aktif koleksiyoner topluluğu mevcuttur.',
    brands: 'Hot Wheels, Matchbox, Greenlight, Tomica',
    priceRange: '₺10 - ₺1.000+',
    highlight: true,
  },
];

export default function SizeGuideScreen() {
  const { t } = useTranslation();
  return (
    <View style={styles.container}>
      <ScreenHeader title={t('mobile.pageSizeGuide')} onBack={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)'))} />

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.intro}>
          Diecast model arabalarda ölçek, modelin gerçek aracın boyutuna oranını belirtir. Aşağıda en yaygın ölçeklerin karşılaştırmasını bulabilirsiniz.
        </Text>

        {SCALES.map((item, index) => (
          <View
            key={index}
            style={[styles.scaleCard, item.highlight && styles.scaleCardHighlight]}
          >
            <View style={styles.scaleHeader}>
              <View style={[styles.scaleBadge, item.highlight && styles.scaleBadgeHighlight]}>
                <Text style={[styles.scaleText, item.highlight && styles.scaleTextHighlight]}>
                  {item.scale}
                </Text>
              </View>
              <View style={styles.scaleSpecs}>
                <View style={styles.specRow}>
                  <Ionicons name="resize-outline" size={14} color={colors.text.subtle} />
                  <Text style={styles.specText}>{item.length}</Text>
                </View>
                <View style={styles.specRow}>
                  <Ionicons name="barbell-outline" size={14} color={colors.text.subtle} />
                  <Text style={styles.specText}>{item.weight}</Text>
                </View>
              </View>
            </View>

            <Text style={styles.scaleDesc}>{item.description}</Text>

            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Markalar:</Text>
              <Text style={styles.detailValue}>{item.brands}</Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Fiyat Aralığı:</Text>
              <Text style={styles.priceValue}>{item.priceRange}</Text>
            </View>
          </View>
        ))}

        <View style={styles.tip}>
          <Ionicons name="bulb-outline" size={20} color={colors.warning[600]!} />
          <Text style={styles.tipText}>
            İpucu: Koleksiyonunuza başlarken tek bir ölçekte yoğunlaşmanız, vitrin düzeninizi kolaylaştırır ve bütçenizi daha iyi yönetmenizi sağlar.
          </Text>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface.DEFAULT,
  },
  content: {
    flex: 1,
    padding: theme.spacing[5],
  },
  intro: {
    fontSize: 14,
    color: colors.text.muted,
    lineHeight: 22,
    marginBottom: theme.spacing[5],
  },
  scaleCard: {
    backgroundColor: colors.surface.alt,
    borderRadius: 12,
    padding: theme.spacing[4],
    marginBottom: theme.spacing[3],
    borderWidth: 1,
    borderColor: colors.border.subtle,
  },
  scaleCardHighlight: {
    borderColor: colors.primary[600]!,
    backgroundColor: colors.primary[50]!,
  },
  scaleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: theme.spacing[2.5],
  },
  scaleBadge: {
    backgroundColor: colors.gray[200],
    paddingHorizontal: theme.spacing[3.5],
    paddingVertical: theme.spacing[1.5],
    borderRadius: theme.radius.xl,
  },
  scaleBadgeHighlight: {
    backgroundColor: colors.primary[600]!,
  },
  scaleText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.text.heading,
  },
  scaleTextHighlight: {
    color: colors.white,
  },
  scaleSpecs: {
    flexDirection: 'row',
    gap: theme.spacing[4],
  },
  specRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[1],
  },
  specText: {
    fontSize: 12,
    color: colors.text.subtle,
  },
  scaleDesc: {
    fontSize: 13,
    color: colors.text.muted,
    lineHeight: 20,
    marginBottom: theme.spacing[2.5],
  },
  detailRow: {
    flexDirection: 'row',
    marginTop: theme.spacing[1],
  },
  detailLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.text.heading,
    marginRight: theme.spacing[1.5],
  },
  detailValue: {
    fontSize: 12,
    color: colors.text.muted,
    flex: 1,
  },
  priceValue: {
    fontSize: 12,
    color: colors.primary[700]!,
    fontWeight: '600',
    flex: 1,
  },
  tip: {
    flexDirection: 'row',
    backgroundColor: colors.warning[50]!,
    borderRadius: 12,
    padding: theme.spacing[4],
    marginTop: theme.spacing[2],
    gap: theme.spacing[2.5],
    alignItems: 'flex-start',
  },
  tipText: {
    flex: 1,
    fontSize: 13,
    color: colors.text.muted,
    lineHeight: 20,
  },
});
