"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ALL_ACCEPTED,
  DEFAULT_PREFERENCES,
  hasConsent,
  readPreferences,
  saveConsent,
  type CookieCategory,
  type CookiePreferences,
} from "@/lib/cookieConsent";

/**
 * Çerez rızası durumu — banner ve /cookies tercih paneli aynı hook'u kullanır,
 * böylece iki ekran arasında tercih kayması olmaz.
 */
export function useCookieConsent() {
  const [preferences, setPreferences] =
    useState<CookiePreferences>(DEFAULT_PREFERENCES);
  const [needsConsent, setNeedsConsent] = useState(false);

  useEffect(() => {
    // Kayıtlı tercihi rızadan bağımsız oku: kullanıcı banner'da onay verdikten
    // sonra /cookies sayfasında tercihlerini gerçek değerleriyle görmeli.
    setPreferences(readPreferences());
    setNeedsConsent(!hasConsent());
  }, []);

  const toggle = useCallback((category: CookieCategory) => {
    if (category === "necessary") return;
    setPreferences((prev) => ({ ...prev, [category]: !prev[category] }));
  }, []);

  const save = useCallback((prefs: CookiePreferences) => {
    setPreferences(saveConsent(prefs));
    setNeedsConsent(false);
  }, []);

  return {
    preferences,
    needsConsent,
    toggle,
    savePreferences: () => save(preferences),
    acceptAll: () => save(ALL_ACCEPTED),
    rejectAll: () => save(DEFAULT_PREFERENCES),
  };
}
