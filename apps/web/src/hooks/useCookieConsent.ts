"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ALL_ACCEPTED,
  DEFAULT_PREFERENCES,
  getOrCreateVisitorId,
  hasConsent,
  readPreferences,
  saveConsent,
  type CookieCategory,
  type CookiePreferences,
} from "@/lib/cookieConsent";
import { consentsApi } from "@/lib/api";

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
    const saved = saveConsent(prefs);
    setPreferences(saved);
    setNeedsConsent(false);
    // KVKK ispat kaydı: sunucu sürümü, IP'yi ve kullanıcı ajanını damgalar;
    // oturum varsa kaydı üyeye de bağlar. İstemcideki rıza kayıttan bağımsız
    // geçerlidir — kayıt en iyi çaba.
    void consentsApi
      .recordCookiePreferences({
        visitorId: getOrCreateVisitorId(),
        preferences: {
          functional: saved.functional,
          analytics: saved.analytics,
          marketing: saved.marketing,
        },
      })
      .catch(() => undefined);
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
