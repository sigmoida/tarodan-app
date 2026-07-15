import React from 'react';
import { View, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';

import { Ionicons } from '@expo/vector-icons';
import { theme, Text } from '@tarodan/ui-native';
import { ScreenHeader } from '@/components/common';
import { useLanguage, localeNames, localeFlags, Locale } from '@/i18n';

const { colors } = theme;

export default function LanguageSettingsScreen() {
  const { locale, setLocale, t } = useLanguage();

  const options: Locale[] = ['tr', 'en'];

  const handleSelect = (next: Locale) => {
    if (next === locale) return;
    setLocale(next);
  };

  return (
    <View style={styles.container}>
      <ScreenHeader title={t('language.language') || 'Dil / Language'} />

      <ScrollView contentContainerStyle={styles.scrollBody}>
        <View style={styles.infoCard}>
          <Ionicons name="language" size={18} color={colors.primary[600]!} />
          <Text style={styles.infoText}>
            {t('language.languageInfo') ||
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface.alt,
  },
  scrollBody: {
    padding: theme.spacing[4],
    gap: theme.spacing[3],
  },
  infoCard: {
    flexDirection: 'row',
    gap: theme.spacing[2],
    alignItems: 'flex-start',
    backgroundColor: colors.primary[50]!,
    padding: theme.spacing[3],
    borderRadius: theme.radius['2xl'],
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
    gap: theme.spacing[3],
    padding: theme.spacing[3.5],
    backgroundColor: colors.surface.DEFAULT,
    borderRadius: theme.radius['2xl'],
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
