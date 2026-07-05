'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import {
    XMarkIcon,
    Cog6ToothIcon,
    CheckIcon,
    ShieldCheckIcon,
} from '@heroicons/react/24/outline';
import { Button } from '@tarodan/ui';

export interface CookiePreferences {
    necessary: boolean; // Always true, required
    analytics: boolean;
    marketing: boolean;
    timestamp?: string;
}

const defaultPreferences: CookiePreferences = {
    necessary: true,
    analytics: false,
    marketing: false,
};

const COOKIE_CONSENT_KEY = 'cookie_consent';
const COOKIE_PREFERENCES_KEY = 'cookie_preferences';

export default function CookieConsentBanner() {
    const [isVisible, setIsVisible] = useState(false);
    const [showSettings, setShowSettings] = useState(false);
    const [preferences, setPreferences] = useState<CookiePreferences>(defaultPreferences);

    useEffect(() => {
        // Kayıtlı tercihler VARSA her durumda state'e yükle. Footer'daki "Çerez
        // Ayarları" yalnızca cookie_consent'i silip banner'ı yeniden açtığından,
        // tercihleri consent'ten bağımsız okumazsak toggle'lar default'a (hepsi
        // kapalı) düşer ve kullanıcının gerçek seçimiyle uyuşmaz — "kapattım ama
        // geri açık" tutarsızlığının kaynağı buydu.
        const savedPrefs = localStorage.getItem(COOKIE_PREFERENCES_KEY);
        if (savedPrefs) {
            try {
                setPreferences(JSON.parse(savedPrefs));
            } catch {
                setPreferences(defaultPreferences);
            }
        }

        // Consent yoksa banner'ı (biraz gecikmeyle) göster.
        const consent = localStorage.getItem(COOKIE_CONSENT_KEY);
        if (!consent) {
            const timer = setTimeout(() => setIsVisible(true), 1500);
            return () => clearTimeout(timer);
        }
    }, []);

    const saveConsent = (prefs: CookiePreferences) => {
        const prefsWithTimestamp = {
            ...prefs,
            timestamp: new Date().toISOString(),
        };

        // Save to localStorage
        localStorage.setItem(COOKIE_CONSENT_KEY, 'true');
        localStorage.setItem(COOKIE_PREFERENCES_KEY, JSON.stringify(prefsWithTimestamp));

        // Also set a real cookie for server-side access (1 year expiry)
        const expiryDate = new Date();
        expiryDate.setFullYear(expiryDate.getFullYear() + 1);
        document.cookie = `${COOKIE_CONSENT_KEY}=true; expires=${expiryDate.toUTCString()}; path=/; SameSite=Lax`;
        document.cookie = `${COOKIE_PREFERENCES_KEY}=${encodeURIComponent(JSON.stringify(prefsWithTimestamp))}; expires=${expiryDate.toUTCString()}; path=/; SameSite=Lax`;

        setPreferences(prefsWithTimestamp);
        setIsVisible(false);
        setShowSettings(false);

        // Log consent for KVKK/GDPR compliance
        console.log('[Cookie Consent]', prefsWithTimestamp);

        // Send to backend for compliance logging (fire and forget)
        fetch('/api/consent-log', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                type: 'cookie_consent',
                preferences: prefsWithTimestamp,
                userAgent: navigator.userAgent,
            }),
        }).catch(() => {
            // Silently fail - consent still works client-side
        });

        // Handle Google Analytics consent
        if (typeof window !== 'undefined' && (window as any).gtag) {
            (window as any).gtag('consent', 'update', {
                analytics_storage: prefs.analytics ? 'granted' : 'denied',
                ad_storage: prefs.marketing ? 'granted' : 'denied',
                ad_user_data: prefs.marketing ? 'granted' : 'denied',
                ad_personalization: prefs.marketing ? 'granted' : 'denied',
            });
        }

        // Disable/remove cookies if user opted out
        if (!prefs.analytics) {
            // Clear Google Analytics cookies
            document.cookie = '_ga=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
            document.cookie = '_gid=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
            document.cookie = '_gat=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
        }

        if (!prefs.marketing) {
            // Clear Facebook Pixel and other marketing cookies
            document.cookie = '_fbp=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
        }
    };

    const acceptAll = () => {
        saveConsent({
            necessary: true,
            analytics: true,
            marketing: true,
        });
    };

    const acceptNecessaryOnly = () => {
        saveConsent({
            necessary: true,
            analytics: false,
            marketing: false,
        });
    };

    const saveCustomPreferences = () => {
        saveConsent(preferences);
    };

    if (!isVisible) return null;

    return (
        <AnimatePresence>
            <motion.div
                initial={{ y: 100, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: 100, opacity: 0 }}
                transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                className="fixed bottom-0 left-0 right-0 z-[9999] p-4 md:p-6"
            >
                <div className="max-w-5xl mx-auto">
                    <div className="bg-surface-elevated dark:bg-heading rounded-2xl shadow-2xl border border-border dark:border-border-strong overflow-hidden">
                        {/* Main Banner */}
                        {!showSettings && (
                            <div className="p-6">
                                <div className="flex items-start gap-4">
                                    <div className="flex-shrink-0 w-12 h-12 bg-primary-100 dark:bg-primary-900/30 rounded-xl flex items-center justify-center">
                                        <ShieldCheckIcon className="w-6 h-6 text-primary-500" />
                                    </div>
                                    <div className="flex-1">
                                        <h3 className="text-lg font-semibold text-heading dark:text-inverted mb-2">
                                            🍪 Çerez Kullanımı
                                        </h3>
                                        <p className="text-muted dark:text-border-strong text-sm leading-relaxed mb-4">
                                            Sitemizde deneyiminizi geliştirmek, trafiği analiz etmek ve size kişiselleştirilmiş
                                            içerik sunmak için çerezler kullanıyoruz. Detaylı bilgi için{' '}
                                            <Link href="/cookies" className="text-primary-500 hover:underline font-medium">
                                                Çerez Politikamızı
                                            </Link>{' '}
                                            inceleyebilirsiniz.
                                        </p>
                                        <div className="flex flex-wrap gap-3">
                                            <Button
                                                variant="primary"
                                                size="md"
                                                className="flex items-center gap-2"
                                                onClick={acceptAll}
                                            >
                                                <CheckIcon className="w-4 h-4" />
                                                Tümünü Kabul Et
                                            </Button>
                                            <Button
                                                variant="secondary"
                                                size="md"
                                                onClick={acceptNecessaryOnly}
                                            >
                                                Sadece Gerekli Olanlar
                                            </Button>
                                            <Button
                                                variant="outline"
                                                size="md"
                                                className="flex items-center gap-2"
                                                onClick={() => setShowSettings(true)}
                                            >
                                                <Cog6ToothIcon className="w-4 h-4" />
                                                Ayarlar
                                            </Button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Settings Panel */}
                        {showSettings && (
                            <motion.div
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: 'auto' }}
                                exit={{ opacity: 0, height: 0 }}
                                className="p-6"
                            >
                                <div className="flex items-center justify-between mb-6">
                                    <h3 className="text-lg font-semibold text-heading dark:text-inverted">
                                        Çerez Ayarları
                                    </h3>
                                    <Button variant="secondary" onClick={() => setShowSettings(false)}
                                        className="p-2 hover:bg-surface-alt dark:hover:bg-heading rounded-lg transition-colors">
                                        <XMarkIcon className="w-5 h-5 text-muted" />
                                    </Button>
                                </div>

                                <div className="space-y-4 mb-6">
                                    {/* Necessary Cookies - Always enabled */}
                                    <div className="flex items-center justify-between p-4 bg-surface dark:bg-heading/50 rounded-xl">
                                        <div className="flex-1">
                                            <div className="flex items-center gap-2 mb-1">
                                                <span className="font-medium text-heading dark:text-inverted">Zorunlu Çerezler</span>
                                                <span className="px-2 py-0.5 bg-success-100 text-success-700 text-xs rounded-full font-medium">
                                                    Her Zaman Aktif
                                                </span>
                                            </div>
                                            <p className="text-sm text-muted dark:text-subtle">
                                                Web sitesinin temel işlevleri için gereklidir. Güvenlik, ağ yönetimi ve erişilebilirlik
                                                gibi temel özellikleri sağlar. Bu çerezler olmadan site düzgün çalışmaz.
                                            </p>
                                        </div>
                                        <div className="ml-4">
                                            <div className="w-12 h-7 bg-success-600 rounded-full flex items-center justify-end px-1">
                                                <div className="w-5 h-5 bg-surface-elevated rounded-full shadow" />
                                            </div>
                                        </div>
                                    </div>

                                    {/* Analytics Cookies */}
                                    <div className="flex items-center justify-between p-4 bg-surface dark:bg-heading/50 rounded-xl">
                                        <div className="flex-1">
                                            <div className="font-medium text-heading dark:text-inverted mb-1">Analitik Çerezler</div>
                                            <p className="text-sm text-muted dark:text-subtle">
                                                Ziyaretçilerimizin sitemizi nasıl kullandığını anlamamıza yardımcı olur.
                                                Sayfa görüntülemeleri, trafik kaynakları ve kullanıcı davranışları gibi
                                                istatistiksel verileri toplar.
                                            </p>
                                        </div>
                                        <div className="ml-4">
                                            <Button variant="secondary" onClick={() => setPreferences({ ...preferences, analytics: !preferences.analytics })}
                                                className={`w-12 h-7 rounded-full flex items-center px-1 transition-colors ${preferences.analytics ? 'bg-primary-500' : 'bg-border-strong dark:bg-body'
                                                    }`}>
                                                <div
                                                    className={`w-5 h-5 bg-surface-elevated rounded-full shadow transition-transform ${preferences.analytics ? 'translate-x-5' : ''
                                                        }`}
                                                />
                                            </Button>
                                        </div>
                                    </div>

                                    {/* Marketing Cookies */}
                                    <div className="flex items-center justify-between p-4 bg-surface dark:bg-heading/50 rounded-xl">
                                        <div className="flex-1">
                                            <div className="font-medium text-heading dark:text-inverted mb-1">Pazarlama Çerezleri</div>
                                            <p className="text-sm text-muted dark:text-subtle">
                                                Size kişiselleştirilmiş reklamlar ve içerikler sunmak için kullanılır.
                                                İlgi alanlarınıza göre hedeflenmiş pazarlama kampanyaları için verilerinizi
                                                reklam ortaklarıyla paylaşabilir.
                                            </p>
                                        </div>
                                        <div className="ml-4">
                                            <Button variant="secondary" onClick={() => setPreferences({ ...preferences, marketing: !preferences.marketing })}
                                                className={`w-12 h-7 rounded-full flex items-center px-1 transition-colors ${preferences.marketing ? 'bg-primary-500' : 'bg-border-strong dark:bg-body'
                                                    }`}>
                                                <div
                                                    className={`w-5 h-5 bg-surface-elevated rounded-full shadow transition-transform ${preferences.marketing ? 'translate-x-5' : ''
                                                        }`}
                                                />
                                            </Button>
                                        </div>
                                    </div>
                                </div>

                                <div className="flex flex-wrap gap-3 pt-4 border-t border-border dark:border-border-strong">
                                    <Button
                                        variant="primary"
                                        size="md"
                                        onClick={saveCustomPreferences}
                                    >
                                        Tercihlerimi Kaydet
                                    </Button>
                                    <Button
                                        variant="secondary"
                                        size="md"
                                        onClick={acceptAll}
                                    >
                                        Tümünü Kabul Et
                                    </Button>
                                </div>
                            </motion.div>
                        )}
                    </div>
                </div>
            </motion.div>
        </AnimatePresence>
    );
}
