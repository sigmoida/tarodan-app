'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import trMessages from './messages/tr.json';
import enMessages from './messages/en.json';

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
  en: enMessages,
};

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

function getNestedValue(obj: any, path: string): string | undefined {
  const keys = path.split('.');
  let current = obj;
  
  for (const key of keys) {
    if (current === undefined || current === null) {
      return undefined;
    }
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
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // Check localStorage for saved preference
    const savedLocale = localStorage.getItem('locale') as Locale | null;
    if (savedLocale && (savedLocale === 'tr' || savedLocale === 'en')) {
      setLocaleState(savedLocale);
    } else {
      // Check browser language
      const browserLang = navigator.language.toLowerCase();
      if (browserLang.startsWith('en')) {
        setLocaleState('en');
      }
    }
    setMounted(true);
  }, []);

  const setLocale = (newLocale: Locale) => {
    setLocaleState(newLocale);
    localStorage.setItem('locale', newLocale);
    // Update html lang attribute
    document.documentElement.lang = newLocale;
  };

  const t = (key: string, params?: Record<string, string | number>): string => {
    const value = getNestedValue(messages[locale], key);
    if (value === undefined) {
      // Fallback to Turkish if key not found in current locale
      const fallback = getNestedValue(messages.tr, key);
      if (fallback) {
        return interpolate(fallback, params);
      }
      // Return key if not found anywhere (for debugging)
      console.warn(`Translation key not found: ${key}`);
      return key;
    }
    return interpolate(value, params);
  };

  // Prevent hydration mismatch
  if (!mounted) {
    return (
      <LanguageContext.Provider
        value={{
          locale: defaultLocale,
          setLocale: () => {},
          t: (key: string, params?: Record<string, string | number>) => {
            const value = getNestedValue(messages[defaultLocale], key);
            return value ? interpolate(value, params) : key;
          },
          messages: messages[defaultLocale],
        }}
      >
        {children}
      </LanguageContext.Provider>
    );
  }

  return (
    <LanguageContext.Provider
      value={{
        locale,
        setLocale,
        t,
        messages: messages[locale],
      }}
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

// Shorthand hook for translations
export function useTranslation() {
  const { t, locale } = useLanguage();
  return { t, locale };
}

// Export locale names for UI
export const localeNames: Record<Locale, string> = {
  tr: 'Türkçe',
  en: 'English',
};

// Export locale flags for UI
export const localeFlags: Record<Locale, string> = {
  tr: '🇹🇷',
  en: '🇬🇧',
};
