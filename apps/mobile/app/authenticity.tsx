import { View, ScrollView, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { theme, Text, ScreenHeader } from '@tarodan/ui-native';
import { useTranslation } from '@/i18n';

const { colors } = theme;

/**
 * Orijinallik Garantisi sayfası. Web karşılığı:
 * apps/web/src/app/authenticity/page.tsx. İçerik information.authenticity.*
 * i18n namespace'inden gelir (web ile aynı anahtarlar).
 */
export default function AuthenticityScreen() {
  const { t } = useTranslation();

  return (
    <View style={styles.container}>
      <ScreenHeader
        title={t('information.authenticity.title')}
        onBack={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)'))}
      />

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.subtitle}>{t('information.authenticity.subtitle')}</Text>

        <Text style={styles.sectionTitle}>{t('information.authenticity.process')}</Text>
        <Text style={styles.paragraph}>{t('information.authenticity.processDesc')}</Text>

        <Text style={styles.sectionTitle}>{t('information.authenticity.protection')}</Text>
        <Text style={styles.paragraph}>{t('information.authenticity.protectionDesc')}</Text>

        <Text style={styles.sectionTitle}>{t('information.authenticity.badges')}</Text>
        <Text style={styles.paragraph}>{t('information.authenticity.badgesDesc')}</Text>

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
