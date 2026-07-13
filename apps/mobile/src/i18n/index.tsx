/**
 * Mobile i18n — web'in `apps/web/src/i18n/LanguageContext.tsx` port'u.
 *
 * Tasarım kararları:
 * - Web ile **aynı** key yapısı (apps/mobile/src/i18n/messages/*.json doğrudan
 *   web'in messages/ klasöründen seed'lendi). Yeni key'ler eklerken her iki
 *   tarafta paralel ekleyin ya da paylaşılan bir paket'e taşıyın (ayrı iş).
 * - Kalıcılık: AsyncStorage (web localStorage'a karşılık).
 * - Cihaz dili tespiti: şu an yok — varsayılan 'tr'. expo-localization paketi
 *   eklenince getDeviceLocale() helper'ı doldurulacak (Expo Go uyumlu, ama
 *   şimdiki commit'te paket bağımlılığı eklemiyoruz).
 * - Fallback: bilinmeyen key → TR sürümünü dene → yoksa key'i göster.
 */
import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import trMessages from './messages/tr.json';
import enMessages from './messages/en.json';

export type Locale = 'tr' | 'en';

type Messages = typeof trMessages;

interface LanguageContextType {
  locale: Locale;
  setLocale: (locale: Locale) => Promise<void>;
  t: (key: string, params?: Record<string, string | number>) => string;
  messages: Messages;
}

const messages: Record<Locale, Messages> = {
  tr: trMessages,
  en: enMessages as unknown as Messages,
};

const LOCALE_STORAGE_KEY = 'locale';

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

function getNestedValue(obj: unknown, path: string): string | undefined {
  const keys = path.split('.');
  let current: unknown = obj;
  for (const key of keys) {
    if (current === undefined || current === null || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return typeof current === 'string' ? current : undefined;
}

function interpolate(text: string, params?: Record<string, string | number>): string {
  if (!params) return text;
  return text.replace(/\{(\w+)\}/g, (match, key) => (params[key] !== undefined ? String(params[key]) : match));
}

interface LanguageProviderProps {
  children: ReactNode;
  defaultLocale?: Locale;
}

export function LanguageProvider({ children, defaultLocale = 'tr' }: LanguageProviderProps) {
  const [locale, setLocaleState] = useState<Locale>(defaultLocale);

  useEffect(() => {
    AsyncStorage.getItem(LOCALE_STORAGE_KEY)
      .then((saved) => {
        if (saved === 'tr' || saved === 'en') setLocaleState(saved);
      })
      .catch(() => {
        // First run / corrupted storage — fall back to default.
      });
  }, []);

  const setLocale = useCallback(async (newLocale: Locale) => {
    setLocaleState(newLocale);
    try {
      await AsyncStorage.setItem(LOCALE_STORAGE_KEY, newLocale);
    } catch {
      // Storage may be unavailable in some test environments — keep in-memory state.
    }
  }, []);

  const t = useCallback(
    (key: string, params?: Record<string, string | number>): string => {
      const value = getNestedValue(messages[locale], key);
      if (value !== undefined) return interpolate(value, params);
      const fallback = getNestedValue(messages.tr, key);
      if (fallback !== undefined) return interpolate(fallback, params);
      if (__DEV__) console.warn(`[i18n] missing key: ${key}`);
      return key;
    },
    [locale],
  );

  // Provider value memoized so every text consumer doesn't re-render on unrelated
  // provider renders (#75). Identity changes only when locale/t/setLocale change.
  const value = useMemo(
    () => ({ locale, setLocale, t, messages: messages[locale] }),
    [locale, setLocale, t],
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (ctx === undefined) throw new Error('useLanguage must be used within LanguageProvider');
  return ctx;
}

// Shorthand identical to web — keeps `useTranslation` import sites portable.
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
