import React from 'react';
import { View, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';

import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { TarodanColors } from '../../src/theme';
import { ScreenHeader, Text } from '../../src/components/common';
import { useLanguage, localeNames, localeFlags, Locale } from '../../src/i18n/LanguageContext';

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
          <Ionicons name="language" size={18} color={TarodanColors.primary} />
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
              <Ionicons name="checkmark-circle" size={22} color={TarodanColors.primary} />
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
    backgroundColor: TarodanColors.backgroundSecondary,
  },
  scrollBody: {
    padding: 16,
    gap: 12,
  },
  infoCard: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'flex-start',
    backgroundColor: TarodanColors.primaryLight,
    padding: 12,
    borderRadius: 10,
  },
  infoText: {
    flex: 1,
    fontSize: 13,
    color: TarodanColors.textSecondary,
    lineHeight: 18,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    backgroundColor: TarodanColors.background,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: TarodanColors.border,
  },
  rowActive: {
    borderColor: TarodanColors.primary,
    backgroundColor: TarodanColors.primaryLight,
  },
  flag: {
    fontSize: 24,
  },
  name: {
    flex: 1,
    fontSize: 16,
    color: TarodanColors.textPrimary,
    fontWeight: '500',
  },
  nameActive: {
    fontWeight: '700',
    color: TarodanColors.primary,
  },
  emptyCheck: {
    width: 22,
    height: 22,
  },
});
