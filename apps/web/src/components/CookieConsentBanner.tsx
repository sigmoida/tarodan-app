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
        // Check if user has already given consent
        const consent = localStorage.getItem(COOKIE_CONSENT_KEY);
        if (!consent) {
            // Don't show immediately - wait a bit for better UX
            const timer = setTimeout(() => setIsVisible(true), 1500);
            return () => clearTimeout(timer);
        } else {
            // Load saved preferences
            const savedPrefs = localStorage.getItem(COOKIE_PREFERENCES_KEY);
            if (savedPrefs) {
                try {
                    setPreferences(JSON.parse(savedPrefs));
                } catch {
                    setPreferences(defaultPreferences);
                }
            }
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
                    <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                        {/* Main Banner */}
                        {!showSettings && (
                            <div className="p-6">
                                <div className="flex items-start gap-4">
                                    <div className="flex-shrink-0 w-12 h-12 bg-orange-100 dark:bg-orange-900/30 rounded-xl flex items-center justify-center">
                                        <ShieldCheckIcon className="w-6 h-6 text-orange-500" />
                                    </div>
                                    <div className="flex-1">
                                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                                            🍪 Çerez Kullanımı
                                        </h3>
                                        <p className="text-gray-600 dark:text-gray-300 text-sm leading-relaxed mb-4">
                                            Sitemizde deneyiminizi geliştirmek, trafiği analiz etmek ve size kişiselleştirilmiş
                                            içerik sunmak için çerezler kullanıyoruz. Detaylı bilgi için{' '}
                                            <Link href="/cookies" className="text-orange-500 hover:underline font-medium">
                                                Çerez Politikamızı
                                            </Link>{' '}
                                            inceleyebilirsiniz.
                                        </p>
                                        <div className="flex flex-wrap gap-3">
                                            <button
                                                onClick={acceptAll}
                                                className="px-5 py-2.5 bg-orange-500 hover:bg-orange-600 text-white rounded-lg font-medium text-sm transition-colors flex items-center gap-2"
                                            >
                                                <CheckIcon className="w-4 h-4" />
                                                Tümünü Kabul Et
                                            </button>
                                            <button
                                                onClick={acceptNecessaryOnly}
                                                className="px-5 py-2.5 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg font-medium text-sm transition-colors"
                                            >
                                                Sadece Gerekli Olanlar
                                            </button>
                                            <button
                                                onClick={() => setShowSettings(true)}
                                                className="px-5 py-2.5 border border-gray-300 dark:border-gray-600 hover:border-orange-500 text-gray-700 dark:text-gray-300 rounded-lg font-medium text-sm transition-colors flex items-center gap-2"
                                            >
                                                <Cog6ToothIcon className="w-4 h-4" />
                                                Ayarlar
                                            </button>
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
                                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                                        Çerez Ayarları
                                    </h3>
                                    <button
                                        onClick={() => setShowSettings(false)}
                                        className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
                                    >
                                        <XMarkIcon className="w-5 h-5 text-gray-500" />
                                    </button>
                                </div>

                                <div className="space-y-4 mb-6">
                                    {/* Necessary Cookies - Always enabled */}
                                    <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800/50 rounded-xl">
                                        <div className="flex-1">
                                            <div className="flex items-center gap-2 mb-1">
                                                <span className="font-medium text-gray-900 dark:text-white">Zorunlu Çerezler</span>
                                                <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded-full font-medium">
                                                    Her Zaman Aktif
                                                </span>
                                            </div>
                                            <p className="text-sm text-gray-600 dark:text-gray-400">
                                                Web sitesinin temel işlevleri için gereklidir. Güvenlik, ağ yönetimi ve erişilebilirlik
                                                gibi temel özellikleri sağlar. Bu çerezler olmadan site düzgün çalışmaz.
                                            </p>
                                        </div>
                                        <div className="ml-4">
                                            <div className="w-12 h-7 bg-green-500 rounded-full flex items-center justify-end px-1">
                                                <div className="w-5 h-5 bg-white rounded-full shadow" />
                                            </div>
                                        </div>
                                    </div>

                                    {/* Analytics Cookies */}
                                    <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800/50 rounded-xl">
                                        <div className="flex-1">
                                            <div className="font-medium text-gray-900 dark:text-white mb-1">Analitik Çerezler</div>
                                            <p className="text-sm text-gray-600 dark:text-gray-400">
                                                Ziyaretçilerimizin sitemizi nasıl kullandığını anlamamıza yardımcı olur.
                                                Sayfa görüntülemeleri, trafik kaynakları ve kullanıcı davranışları gibi
                                                istatistiksel verileri toplar.
                                            </p>
                                        </div>
                                        <div className="ml-4">
                                            <button
                                                onClick={() => setPreferences({ ...preferences, analytics: !preferences.analytics })}
                                                className={`w-12 h-7 rounded-full flex items-center px-1 transition-colors ${preferences.analytics ? 'bg-orange-500' : 'bg-gray-300 dark:bg-gray-600'
                                                    }`}
                                            >
                                                <div
                                                    className={`w-5 h-5 bg-white rounded-full shadow transition-transform ${preferences.analytics ? 'translate-x-5' : ''
                                                        }`}
                                                />
                                            </button>
                                        </div>
                                    </div>

                                    {/* Marketing Cookies */}
                                    <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800/50 rounded-xl">
                                        <div className="flex-1">
                                            <div className="font-medium text-gray-900 dark:text-white mb-1">Pazarlama Çerezleri</div>
                                            <p className="text-sm text-gray-600 dark:text-gray-400">
                                                Size kişiselleştirilmiş reklamlar ve içerikler sunmak için kullanılır.
                                                İlgi alanlarınıza göre hedeflenmiş pazarlama kampanyaları için verilerinizi
                                                reklam ortaklarıyla paylaşabilir.
                                            </p>
                                        </div>
                                        <div className="ml-4">
                                            <button
                                                onClick={() => setPreferences({ ...preferences, marketing: !preferences.marketing })}
                                                className={`w-12 h-7 rounded-full flex items-center px-1 transition-colors ${preferences.marketing ? 'bg-orange-500' : 'bg-gray-300 dark:bg-gray-600'
                                                    }`}
                                            >
                                                <div
                                                    className={`w-5 h-5 bg-white rounded-full shadow transition-transform ${preferences.marketing ? 'translate-x-5' : ''
                                                        }`}
                                                />
                                            </button>
                                        </div>
                                    </div>
                                </div>

                                <div className="flex flex-wrap gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
                                    <button
                                        onClick={saveCustomPreferences}
                                        className="px-5 py-2.5 bg-orange-500 hover:bg-orange-600 text-white rounded-lg font-medium text-sm transition-colors"
                                    >
                                        Tercihlerimi Kaydet
                                    </button>
                                    <button
                                        onClick={acceptAll}
                                        className="px-5 py-2.5 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg font-medium text-sm transition-colors"
                                    >
                                        Tümünü Kabul Et
                                    </button>
                                </div>
                            </motion.div>
                        )}
                    </div>
                </div>
            </motion.div>
        </AnimatePresence>
    );
}
