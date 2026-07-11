import { View, ScrollView, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { theme, Text, ScreenHeader } from '@tarodan/ui-native';
import { useTranslation } from '@/i18n';

const { colors } = theme;

/**
 * Koleksiyoner Rehberi sayfası. Web karşılığı:
 * apps/web/src/app/collectors-guide/page.tsx. İçerik
 * information.collectorsGuide.* i18n namespace'inden gelir (web ile aynı).
 */
export default function CollectorsGuideScreen() {
  const { t } = useTranslation();

  return (
    <View style={styles.container}>
      <ScreenHeader
        title={t('information.collectorsGuide.title')}
        onBack={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)'))}
      />

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.subtitle}>{t('information.collectorsGuide.subtitle')}</Text>

        <Text style={styles.sectionTitle}>{t('information.collectorsGuide.tips')}</Text>
        <Text style={styles.paragraph}>{t('information.collectorsGuide.tipsDesc')}</Text>

        <Text style={styles.sectionTitle}>{t('information.collectorsGuide.grading')}</Text>
        <Text style={styles.paragraph}>{t('information.collectorsGuide.gradingDesc')}</Text>

        <Text style={styles.sectionTitle}>{t('information.collectorsGuide.storage')}</Text>
        <Text style={styles.paragraph}>{t('information.collectorsGuide.storageDesc')}</Text>

        <Text style={styles.sectionTitle}>{t('information.collectorsGuide.valuation')}</Text>
        <Text style={styles.paragraph}>{t('information.collectorsGuide.valuationDesc')}</Text>

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
  subtitle: {
    fontSize: 14,
    color: colors.text.muted,
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.text.heading,
    marginTop: 24,
    marginBottom: 12,
  },
  paragraph: {
    fontSize: 14,
    color: colors.text.muted,
    lineHeight: 22,
  },
});
