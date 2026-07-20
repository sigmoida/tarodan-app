"use client";

import { useState } from "react";
import toast from "react-hot-toast";
import { useTranslations } from "next-intl";

export interface CookiePreferences {
  functional: boolean;
  analytics: boolean;
  marketing: boolean;
}

const DEFAULT_PREFERENCES: CookiePreferences = {
  functional: true,
  analytics: true,
  marketing: false,
};

/**
 * Cookie-consent toggle state + persistence. Not a validated data form (no zod):
 * plain local state saved to `localStorage` under `cookie_preferences`.
 */
export function useCookiePreferences() {
  const t = useTranslations();
  const [preferences, setPreferences] =
    useState<CookiePreferences>(DEFAULT_PREFERENCES);

  const togglePreference = (category: string) => {
    setPreferences((prev) => ({
      ...prev,
      [category]: !prev[category as keyof CookiePreferences],
    }));
  };

  const savePreferences = () => {
    localStorage.setItem("cookie_preferences", JSON.stringify(preferences));
    toast.success(t("common.success"));
  };

  const acceptAll = () =>
    setPreferences({ functional: true, analytics: true, marketing: true });

  return { preferences, togglePreference, savePreferences, acceptAll };
}
