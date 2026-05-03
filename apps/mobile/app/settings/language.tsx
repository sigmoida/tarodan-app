import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { TarodanColors } from '../../src/theme';
import { useLanguage, localeNames, localeFlags, type Locale } from '../../src/i18n';

const SUPPORTED: Locale[] = ['tr', 'en'];

export default function LanguageScreen() {
  const { locale, setLocale, t } = useLanguage();

  const handleSelect = async (next: Locale) => {
    if (next === locale) return;
    await setLocale(next);
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton} accessibilityLabel={t('common.back')}>
          <Ionicons name="arrow-back" size={24} color={TarodanColors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('mobile.language')}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {SUPPORTED.map((code) => {
          const isSelected = code === locale;
          return (
            <TouchableOpacity
              key={code}
              testID={`language-${code}`}
              style={[styles.row, isSelected && styles.rowSelected]}
              onPress={() => handleSelect(code)}
              activeOpacity={0.7}
            >
              <Text style={styles.flag}>{localeFlags[code]}</Text>
              <View style={styles.rowText}>
                <Text style={styles.rowLabel}>{localeNames[code]}</Text>
                <Text style={styles.rowSubLabel}>
                  {code === 'tr' ? t('mobile.languageTurkish') : t('mobile.languageEnglish')}
                </Text>
              </View>
              {isSelected && (
                <Ionicons name="checkmark-circle" size={24} color={TarodanColors.primary} />
              )}
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: TarodanColors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: TarodanColors.borderLight,
  },
  backButton: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '600', color: TarodanColors.textPrimary },
  content: { padding: 16 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: TarodanColors.surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: TarodanColors.borderLight,
  },
  rowSelected: { borderColor: TarodanColors.primary, borderWidth: 2 },
  flag: { fontSize: 32, marginRight: 16 },
  rowText: { flex: 1 },
  rowLabel: { fontSize: 16, fontWeight: '600', color: TarodanColors.textPrimary },
  rowSubLabel: { fontSize: 13, color: TarodanColors.textSecondary, marginTop: 2 },
});
