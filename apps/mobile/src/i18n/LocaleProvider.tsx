/**
 * Mobile locale glue (#216). i18next itself is initialized in ./config (imported
 * here for its side effect). This module owns only the parts react-i18next does
 * not: persisting the user's language choice to AsyncStorage and restoring it on
 * boot. Translation call sites use `useTranslation` from 'react-i18next' directly
 * — the hand-rolled shim (old LanguageProvider/useLanguage/useTranslation/t) is
 * gone.
 *
 * - Persistence: AsyncStorage, key 'locale' (unchanged from the old behavior so an
 *   existing user's choice survives the migration).
 * - Device locale: config.getDeviceLocale() (Hermes Intl) is the first-launch lng.
 */
import { useCallback, useEffect, ReactNode } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { I18nextProvider, useTranslation } from "react-i18next";
import { type Locale } from "@tarodan/i18n";
import i18n from "./config";

const LOCALE_STORAGE_KEY = "locale";

/** Binds the i18next instance to the tree and restores the persisted language on boot. */
export function LocaleProvider({ children }: { children: ReactNode }) {
  // Restore the saved language choice (overrides the device-locale default).
  useEffect(() => {
    AsyncStorage.getItem(LOCALE_STORAGE_KEY)
      .then((saved) => {
        if ((saved === "tr" || saved === "en") && saved !== i18n.language) {
          i18n.changeLanguage(saved);
        }
      })
      .catch(() => {
        // First launch / unavailable storage — keep the device-locale default.
      });
  }, []);

  // children cast: post-merge @types/react duplication clashes with I18nextProvider's
  // ReactNode (same baseline issue as render.tsx/RatingModal.test — a library boundary).
  return <I18nextProvider i18n={i18n}>{children as never}</I18nextProvider>;
}

/** Current locale + a setter that persists the choice. Used by the language screen. */
export function useLocale() {
  const { i18n: instance } = useTranslation();
  const locale = (instance.language as Locale) ?? "tr";

  const setLocale = useCallback(
    async (next: Locale) => {
      await instance.changeLanguage(next);
      try {
        await AsyncStorage.setItem(LOCALE_STORAGE_KEY, next);
      } catch {
        // Storage may be unavailable in some test environments — in-memory language stays.
      }
    },
    [instance],
  );

  return { locale, setLocale };
}

export const localeNames: Record<Locale, string> = {
  tr: "Türkçe",
  en: "English",
};

export const localeFlags: Record<Locale, string> = {
  tr: "🇹🇷",
  en: "🇬🇧",
};
