import { useState } from 'react';
import { View, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { theme, Text, ScreenHeader } from '@tarodan/ui-native';
import { useTranslation } from '../src/i18n';

const { colors } = theme;

const GUIDES = [
  {
    title: 'Nasıl Satın Alınır?',
    icon: 'cart-outline' as const,
    steps: [
      'Arama veya kategoriler aracılığıyla istediğiniz ürünü bulun.',
      'Ürün sayfasını inceleyerek fotoğrafları, açıklamayı, durumu ve satıcı bilgilerini kontrol edin.',
      '"Satın Al" butonuna tıklayın veya satıcıya teklif gönderin.',
      'Teslimat adresinizi girin ve ödeme yönteminizi seçin.',
      '3D Secure doğrulaması ile ödemenizi tamamlayın.',
      'Siparişiniz onaylanacak ve satıcı kargo sürecini başlatacaktır.',
      'Ürün elinize ulaştığında "Teslim Aldım" butonuyla onaylayın.',
    ],
  },
  {
    title: 'Nasıl Satılır?',
    icon: 'pricetag-outline' as const,
    steps: [
      'Üye girişi yapın veya hesap oluşturun.',
      '"İlan Ver" butonuna tıklayın.',
      'Ürün bilgilerini girin: başlık, açıklama, kategori, ölçek, marka, durum.',
      'Kaliteli fotoğraflar yükleyin (en az 2, farklı açılardan).',
      'Satış fiyatını ve kargo tercihlerinizi belirleyin.',
      'Takas kabul ediyorsanız "Takas Açık" seçeneğini işaretleyin.',
      'İlanınızı yayınlayın ve alıcılardan gelen teklifleri takip edin.',
      'Satış gerçekleştiğinde 3 iş günü içinde ürünü kargoya verin.',
    ],
  },
  {
    title: 'Kargo Rehberi',
    icon: 'cube-outline' as const,
    steps: [
      'Diecast model araçları göndermeden önce orijinal kutusuna yerleştirin.',
      'Kutu içinde boşluk varsa bubble wrap veya kağıt ile destekleyin.',
      'Orijinal kutuyu bir dış karton kutuya yerleştirin (çift kutu yöntemi).',
      'Dış kutuyu kargo bandı ile güvenli bir şekilde kapatın.',
      '"Kırılacak" etiketi kullanın.',
      'Anlaşmalı kargo firmamız Sürat Kargo ile gönderinizi oluşturun.',
      'Kargo kodunu sisteme girerek takip bilgisini paylaşın.',
      'Sigortalı gönderi seçeneğini kullanmanız tavsiye edilir.',
    ],
  },
  {
    title: 'Takas Rehberi',
    icon: 'swap-horizontal-outline' as const,
    steps: [
      '"Takas Açık" olan bir ürün bulun.',
      '"Takas Teklifi Gönder" butonuna tıklayın.',
      'Kendi koleksiyonunuzdan takas etmek istediğiniz ürünleri seçin.',
      'Gerekirse nakit fark tutarı belirleyin.',
      'İsteğe bağlı mesaj ekleyerek teklifinizi gönderin.',
      'Karşı tarafın onayını veya karşı teklifini bekleyin.',
      'Her iki taraf da onayladığında takas başlar.',
      'Ürünlerinizi belirtilen süre içinde kargoya verin.',
      'Teslim aldıktan sonra onay verin; takas tamamlanır.',
    ],
  },
  {
    title: 'Koleksiyon Oluşturma',
    icon: 'albums-outline' as const,
    steps: [
      'Profil sayfanızdan "Koleksiyonlarım" bölümüne gidin.',
      '"Yeni Koleksiyon" butonuna tıklayın.',
      'Koleksiyonunuza isim ve açıklama ekleyin.',
      'Kapak fotoğrafı seçin (isteğe bağlı).',
      'Koleksiyonunuzu herkese açık veya özel yapabilirsiniz.',
      'İlan verdiğiniz veya satın aldığınız ürünleri koleksiyonunuza ekleyin.',
      'Digital Garage özelliği ile koleksiyonunuzu paylaşın ve beğeni toplayın.',
    ],
  },
  {
    title: 'Güvenli Alışveriş İpuçları',
    icon: 'shield-outline' as const,
    steps: [
      'Satıcı profilini ve değerlendirmelerini her zaman kontrol edin.',
      'Ürün fotoğraflarını dikkatli inceleyin; stok fotoğraf kullananlara dikkat edin.',
      'Gerçekçi olmayan düşük fiyatlara karşı temkinli olun.',
      'Platform dışı ödeme talebinde bulunan satıcılara itibar etmeyin.',
      'Kişisel iletişim bilgilerinizi mesajlarda paylaşmaktan kaçının.',
      'Ürün teslimini onaylamadan önce dikkatlice kontrol edin.',
      'Şüpheli durumları hemen destek ekibine bildirin.',
    ],
  },
];

export default function GuidesScreen() {
  const { t } = useTranslation();
  const [expandedIndex, setExpandedIndex] = useState<number | null>(0);

  return (
    <View style={styles.container}>
      <ScreenHeader title={t('mobile.pageGuides')} onBack={() => router.back()} />

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.intro}>
          Tarodan'ı en verimli şekilde kullanmanız için hazırladığımız adım adım rehberler.
        </Text>

        {GUIDES.map((guide, index) => {
          const isExpanded = expandedIndex === index;
          return (
            <View key={index} style={styles.guideCard}>
              <TouchableOpacity
                style={styles.guideHeader}
                onPress={() => setExpandedIndex(isExpanded ? null : index)}
                activeOpacity={0.7}
              >
                <View style={styles.guideHeaderLeft}>
                  <View style={styles.guideIconContainer}>
                    <Ionicons name={guide.icon} size={24} color={colors.primary[600]!} />
                  </View>
                  <Text style={styles.guideTitle}>{guide.title}</Text>
                </View>
                <Ionicons
                  name={isExpanded ? 'chevron-up' : 'chevron-down'}
                  size={20}
                  color={colors.text.muted}
                />
              </TouchableOpacity>

              {isExpanded && (
                <View style={styles.guideContent}>
                  {guide.steps.map((step, stepIndex) => (
                    <View key={stepIndex} style={styles.stepRow}>
                      <View style={styles.stepNumber}>
                        <Text style={styles.stepNumberText}>{stepIndex + 1}</Text>
                      </View>
                      <Text style={styles.stepText}>{step}</Text>
                    </View>
                  ))}
                </View>
              )}
            </View>
          );
        })}

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
    padding: 20,
  },
  intro: {
    fontSize: 14,
    color: colors.text.muted,
    lineHeight: 22,
    marginBottom: 20,
  },
  guideCard: {
    backgroundColor: colors.surface.alt,
    borderRadius: 12,
    marginBottom: 12,
    overflow: 'hidden',
  },
  guideHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
  },
  guideHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  guideIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primary[50]!,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  guideTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text.heading,
    flex: 1,
  },
  guideContent: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    borderTopWidth: 1,
    borderTopColor: colors.border.DEFAULT,
    paddingTop: 12,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  stepNumber: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.primary[600]!,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
    marginTop: 1,
  },
  stepNumberText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: colors.white,
  },
  stepText: {
    flex: 1,
    fontSize: 13,
    color: colors.text.muted,
    lineHeight: 20,
  },
});
