/**
 * #215: i18next kurulumu — katalog @tarodan/i18n'den (tek kaynak), ICU postprocessor,
 * cihaz dili Hermes Intl ile (expo-localization native modül gerektirdiği için onun
 * yerine — aynı sonuç, dev-client rebuild yok). Kalıcılık AsyncStorage ('locale'
 * anahtarı) provider tarafında yönetilir.
 *
 * Katalog {count} (tek süslü) interpolation kullanıyor — i18next-icu bunu ICU simple
 * argument olarak çözer, mevcut hand-rolled davranışa parite.
 */
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import ICU from 'i18next-icu';
import { messages, defaultLocale, resolveLocale, type Locale } from '@tarodan/i18n';

/** Cihaz dilini Hermes Intl'den çöz (tr-TR → 'tr'); bilinmeyen → defaultLocale. */
export function getDeviceLocale(): Locale {
  try {
    const tag = Intl.DateTimeFormat().resolvedOptions().locale; // 'tr-TR' | 'en-US' ...
    return resolveLocale(tag.split('-')[0]);
  } catch {
    return defaultLocale;
  }
}

i18n
  .use(ICU)
  .use(initReactI18next)
  .init({
    resources: {
      tr: { translation: messages.tr },
      en: { translation: messages.en },
    },
    lng: getDeviceLocale(),
    fallbackLng: defaultLocale,
    keySeparator: '.',
    nsSeparator: false, // tek namespace; 'common.login' gibi key'ler ns sanılmasın
    interpolation: { escapeValue: false }, // RN'de XSS yok
    returnNull: false,
    react: { useSuspense: false }, // senkron init (inline resources) → ilk render flicker yok
  });

export default i18n;
