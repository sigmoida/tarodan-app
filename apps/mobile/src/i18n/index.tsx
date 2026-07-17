/**
 * Mobile i18n (#215) — i18next + react-i18next + i18next-icu üzerine kurulu.
 * Katalog tek kaynak `@tarodan/i18n`; init `./config`. Bu dosya mevcut API'yi
 * (LanguageProvider / useLanguage / useTranslation / t / localeNames / localeFlags)
 * i18next üzerine KORUYARAK sarmalar — böylece 64 çağrı sitesi değişmez (#216 ayrı iş).
 *
 * - Kalıcılık: AsyncStorage, anahtar 'locale' (eski davranışla aynı; mevcut kullanıcı
 *   seçimi bozulmaz).
 * - Cihaz dili: config.getDeviceLocale() (Hermes Intl) — ilk açılışta i18next lng.
 * - t imzası eski ile uyumlu: t(key, { count }) → i18next-icu ICU {count}.
 */
import React, { useCallback, useEffect, ReactNode } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  I18nextProvider,
  useTranslation as useI18nextTranslation,
} from "react-i18next";
import { type Locale } from "@tarodan/i18n";
import i18n from "./config";

export type { Locale };

const LOCALE_STORAGE_KEY = "locale";

interface LanguageProviderProps {
  children: ReactNode;
  /** Geriye dönük uyum için kabul edilir; i18next lng config.getDeviceLocale()'den gelir. */
  defaultLocale?: Locale;
}

export function LanguageProvider({ children }: LanguageProviderProps) {
  // Kaydedilmiş dil seçimini yükle (cihaz dilinin üzerine yazar).
  useEffect(() => {
    AsyncStorage.getItem(LOCALE_STORAGE_KEY)
      .then((saved) => {
        if ((saved === "tr" || saved === "en") && saved !== i18n.language) {
          i18n.changeLanguage(saved);
        }
      })
      .catch(() => {
        // İlk açılış / bozuk storage — cihaz dili varsayılanı kalır.
      });
  }, []);

  // children cast: merge sonrası @types/react duplicate'i I18nextProvider'ın ReactNode'u
  // ile çakışıyor (render.tsx/RatingModal.test'teki baseline hatanın aynısı — kütüphane sınırı).
  return <I18nextProvider i18n={i18n}>{children as never}</I18nextProvider>;
}

/** Eski API — { locale, setLocale, t }. language.tsx ve tüm ekranlar bunu kullanır. */
export function useLanguage() {
  const { t: i18nextT, i18n: instance } = useI18nextTranslation();
  const locale = (instance.language as Locale) ?? "tr";

  const setLocale = useCallback(
    async (newLocale: Locale) => {
      await instance.changeLanguage(newLocale);
      try {
        await AsyncStorage.setItem(LOCALE_STORAGE_KEY, newLocale);
      } catch {
        // Bazı test ortamlarında storage yok — bellek içi dil korunur.
      }
    },
    [instance],
  );

  const t = useCallback(
    // key: string — çağrı siteleri dinamik anahtar da geçebilir; #216 tip
    // augmentation'ı (typed MessageKey) doğrudan react-i18next kullanımı için
    // aktif, ama bu uyum katmanında gevşetiyoruz.
    (key: string, params?: Record<string, string | number>): string =>
      (i18nextT as (k: string, o?: object) => string)(key, params ?? undefined),
    [i18nextT],
  );

  return { locale, setLocale, t };
}

/** Web ile aynı kısayol — useTranslation import sitelerini taşınabilir tutar. */
export function useTranslation() {
  const { t, locale } = useLanguage();
  return { t, locale };
}

export const localeNames: Record<Locale, string> = {
  tr: "Türkçe",
  en: "English",
};

export const localeFlags: Record<Locale, string> = {
  tr: "🇹🇷",
  en: "🇬🇧",
};
