/**
 * i18n Configuration for Tarodan
 * 
 * Usage:
 * 1. Import { useTranslation } from '@/i18n'
 * 2. const { t, locale } = useTranslation();
 * 3. Use t('key.path') to get translated string
 * 
 * To change language:
 * 1. Import { useLanguage } from '@/i18n'
 * 2. const { setLocale } = useLanguage();
 * 3. Call setLocale('en') or setLocale('tr')
 */

export { 
  LanguageProvider, 
  useLanguage, 
  useTranslation,
  localeNames,
  localeFlags,
  type Locale 
} from './LanguageContext';

export const locales = ['tr', 'en'] as const;
export const defaultLocale = 'tr' as const;
