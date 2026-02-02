'use client';

import { motion } from 'framer-motion';
import { useTranslation } from '@/i18n/LanguageContext';

const TRUST_BADGES = {
    tr: [
        { label: 'Güvenli Alışveriş', description: 'SSL sertifikalı güvenli ödeme' },
        { label: 'Ücretsiz Kargo', description: '3.000 TL ve üzeri siparişlerde' },
        { label: 'İade İmkanı', description: '14 gün koşulsuz iade' },
        { label: 'Taksit İmkanı', description: '12 aya varan taksit' },
        { label: 'Koleksiyon Sergile', description: 'Dijital garajını oluştur' },
        { label: 'Güvenli Takas', description: 'Güvenli takas sistemi' },
    ],
    en: [
        { label: 'Secure Shopping', description: 'SSL certified secure payment' },
        { label: 'Free Shipping', description: 'On orders over 3,000 TL' },
        { label: 'Easy Returns', description: '14 days unconditional return' },
        { label: 'Installments', description: 'Up to 12 month installments' },
        { label: 'Display Collection', description: 'Create your digital garage' },
        { label: 'Safe Trading', description: 'Secure trading system' },
    ],
};

export default function TrustBadges() {
    const { locale } = useTranslation();
    const badges = TRUST_BADGES[locale as 'tr' | 'en'];

    return (
        <section className="py-6 bg-gray-50 border-y border-gray-200">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-4">
                    {badges.map((badge, index) => (
                        <motion.div
                            key={badge.label}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: index * 0.05 }}
                            className="flex flex-col items-center text-center px-2"
                        >
                            <p className="text-sm font-semibold text-gray-900">{badge.label}</p>
                            <p className="text-xs text-gray-500 mt-0.5 hidden md:block">{badge.description}</p>
                        </motion.div>
                    ))}
                </div>
            </div>
        </section>
    );
}
