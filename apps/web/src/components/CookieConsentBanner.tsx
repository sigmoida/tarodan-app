"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button, Toggle } from "@tarodan/ui";
import { Link } from "@/i18n/navigation";
import { useCookieConsent } from "@/hooks/useCookieConsent";
import { COOKIE_CATEGORIES } from "@/lib/cookieConsent";

export default function CookieConsentBanner() {
  const {
    preferences,
    needsConsent,
    toggle,
    savePreferences,
    acceptAll,
    rejectAll,
  } = useCookieConsent();
  const [showSettings, setShowSettings] = useState(false);

  if (!needsConsent) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ y: 24, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 24, opacity: 0 }}
        transition={{ duration: 0.2, ease: "easeOut" }}
        role="dialog"
        aria-label="Çerez tercihleri"
        // Boşluklar tek tek yazılıyor: alttaki 1rem'e ana ekran çizgisinin payı
        // EKLENMELİ (`pb-safe` onu ezip yerine geçerdi), yanlarda ise `px-gutter`
        // zaten "1rem, çentik daha genişse o kadar" demek.
        className="fixed inset-x-0 bottom-0 z-[9999] px-gutter pt-4 pb-[calc(1rem+env(safe-area-inset-bottom))]"
      >
        <div className="mx-auto max-w-3xl rounded-2xl border border-border bg-surface-elevated p-5 shadow-lg">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm leading-relaxed text-muted">
              Deneyiminizi geliştirmek ve trafiği analiz etmek için çerez
              kullanıyoruz. Ayrıntılar için{" "}
              <Link
                href="/cookies"
                className="text-primary-600 hover:underline"
              >
                Çerez Politikası
              </Link>
              .
            </p>
            <div className="flex shrink-0 flex-wrap gap-2">
              <Button size="sm" onClick={acceptAll}>
                Tümünü kabul et
              </Button>
              <Button variant="secondary" size="sm" onClick={rejectAll}>
                Sadece zorunlu
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowSettings((v) => !v)}
                aria-expanded={showSettings}
              >
                {showSettings ? "Kapat" : "Ayarlar"}
              </Button>
            </div>
          </div>

          {showSettings && (
            <div className="mt-4 space-y-1 border-t border-border pt-4">
              {COOKIE_CATEGORIES.map((category) => (
                <div
                  key={category.id}
                  className="flex items-start justify-between gap-4 py-2"
                >
                  <div>
                    <p className="text-sm font-medium text-heading">
                      {category.name}
                      {category.required && (
                        <span className="ml-2 text-xs font-normal text-subtle">
                          Her zaman aktif
                        </span>
                      )}
                    </p>
                    <p className="text-xs leading-relaxed text-muted">
                      {category.description}
                    </p>
                  </div>
                  <Toggle
                    size="sm"
                    label={category.name}
                    checked={preferences[category.id]}
                    disabled={category.required}
                    onChange={() => toggle(category.id)}
                  />
                </div>
              ))}
              <div className="pt-3">
                <Button size="sm" onClick={savePreferences}>
                  Tercihlerimi kaydet
                </Button>
              </div>
            </div>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
