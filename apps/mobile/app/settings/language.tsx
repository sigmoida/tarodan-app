import React from 'react';
import { View, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';

import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { theme, Text } from '@tarodan/ui-native';
import { ScreenHeader } from '../../src/components/common';
import { useLanguage, localeNames, localeFlags, Locale } from '../../src/i18n/LanguageContext';

const { colors } = theme;

export default function LanguageSettingsScreen() {
  const { locale, setLocale, t } = useLanguage();

  const options: Locale[] = ['tr', 'en'];

  const handleSelect = (next: Locale) => {
    if (next === locale) return;
    setLocale(next);
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScreenHeader title={t('settings.language') || 'Dil / Language'} />

      <ScrollView contentContainerStyle={styles.scrollBody}>
        <View style={styles.infoCard}>
          <Ionicons name="language" size={18} color={colors.primary[600]!} />
          <Text style={styles.infoText}>
            {t('settings.languageInfo') ||
              'Uygulama dilini değiştirdiğinizde tüm menü ve bildirimler seçtiğiniz dile geçer.'}
          </Text>
        </View>

        {options.map(l => (
          <TouchableOpacity
            key={l}
            style={[styles.row, locale === l && styles.rowActive]}
            onPress={() => handleSelect(l)}
            activeOpacity={0.8}
          >
            <Text style={styles.flag}>{localeFlags[l]}</Text>
            <Text style={[styles.name, locale === l && styles.nameActive]}>
              {localeNames[l]}
            </Text>
            {locale === l ? (
              <Ionicons name="checkmark-circle" size={22} color={colors.primary[600]!} />
            ) : (
              <View style={styles.emptyCheck} />
            )}
          </TouchableOpacity>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface.alt,
  },
  scrollBody: {
    padding: 16,
    gap: 12,
  },
  infoCard: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'flex-start',
    backgroundColor: colors.primary[50]!,
    padding: 12,
    borderRadius: 10,
  },
  infoText: {
    flex: 1,
    fontSize: 13,
    color: colors.text.muted,
    lineHeight: 18,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    backgroundColor: colors.surface.DEFAULT,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border.DEFAULT,
  },
  rowActive: {
    borderColor: colors.primary[600]!,
    backgroundColor: colors.primary[50]!,
  },
  flag: {
    fontSize: 24,
  },
  name: {
    flex: 1,
    fontSize: 16,
    color: colors.text.heading,
    fontWeight: '500',
  },
  nameActive: {
    fontWeight: '700',
    color: colors.primary[600]!,
  },
  emptyCheck: {
    width: 22,
    height: 22,
  },
});
