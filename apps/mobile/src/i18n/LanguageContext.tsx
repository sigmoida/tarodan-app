import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import trMessages from './messages/tr.json';
import enMessages from './messages/en.json';

/**
 * i18n (TR / EN) — web paritesi.
 * Web'deki LanguageContext davranışı birebir mobile'a portlanmıştır:
 *   - locale key: @tarodan/locale (AsyncStorage)
 *   - t(key, params) nested + interpolation
 *   - fallback: tr
 */

export type Locale = 'tr' | 'en';

type Messages = typeof trMessages;

interface LanguageContextType {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
  messages: Messages;
}

const messages: Record<Locale, Messages> = {
  tr: trMessages,
  en: enMessages as Messages,
};

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

const LOCALE_STORAGE_KEY = '@tarodan/locale';

function getNestedValue(obj: any, path: string): string | undefined {
  const keys = path.split('.');
  let current = obj;
  for (const key of keys) {
    if (current === undefined || current === null) return undefined;
    current = current[key];
  }
  return typeof current === 'string' ? current : undefined;
}

function interpolate(text: string, params?: Record<string, string | number>): string {
  if (!params) return text;
  return text.replace(/\{(\w+)\}/g, (match, key) => {
    return params[key] !== undefined ? String(params[key]) : match;
  });
}

interface LanguageProviderProps {
  children: ReactNode;
  defaultLocale?: Locale;
}

export function LanguageProvider({ children, defaultLocale = 'tr' }: LanguageProviderProps) {
  const [locale, setLocaleState] = useState<Locale>(defaultLocale);

  useEffect(() => {
    const loadSaved = async () => {
      try {
        const saved = await AsyncStorage.getItem(LOCALE_STORAGE_KEY);
        if (saved === 'tr' || saved === 'en') {
          setLocaleState(saved);
        }
      } catch (err) {
        console.warn('i18n: failed to load locale from AsyncStorage', err);
      }
    };
    loadSaved();
  }, []);

  const setLocale = async (newLocale: Locale) => {
    setLocaleState(newLocale);
    try {
      await AsyncStorage.setItem(LOCALE_STORAGE_KEY, newLocale);
    } catch (err) {
      console.warn('i18n: failed to persist locale', err);
    }
  };

  const t = (key: string, params?: Record<string, string | number>): string => {
    const value = getNestedValue(messages[locale], key);
    if (value === undefined) {
      const fallback = getNestedValue(messages.tr, key);
      if (fallback) return interpolate(fallback, params);
      if (__DEV__) console.warn(`Translation key not found: ${key}`);
      return key;
    }
    return interpolate(value, params);
  };

  return (
    <LanguageContext.Provider
      value={{ locale, setLocale, t, messages: messages[locale] }}
    >
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (context === undefined) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
}

export function useTranslation() {
  const { t, locale } = useLanguage();
  return { t, locale };
}

export const localeNames: Record<Locale, string> = {
  tr: 'Türkçe',
  en: 'English',
};

export const localeFlags: Record<Locale, string> = {
  tr: '🇹🇷',
  en: '🇬🇧',
};
