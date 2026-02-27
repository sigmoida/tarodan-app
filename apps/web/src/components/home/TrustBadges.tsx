'use client';

import { motion } from 'framer-motion';
import { useTranslation } from '@/i18n/LanguageContext';
import {
  ShieldCheckIcon,
  TruckIcon,
  ArrowPathIcon,
  CreditCardIcon,
  RectangleStackIcon,
  ArrowsRightLeftIcon,
} from '@heroicons/react/24/outline';

const TRUST_BADGES = {
  tr: [
    { label: 'Güvenli Alışveriş', description: 'SSL sertifikalı güvenli ödeme', icon: ShieldCheckIcon },
    { label: 'Ücretsiz Kargo', description: '3.000 TL ve üzeri siparişlerde', icon: TruckIcon },
    { label: 'İade İmkanı', description: '14 gün koşulsuz iade', icon: ArrowPathIcon },
    { label: 'Taksit İmkanı', description: '12 aya varan taksit', icon: CreditCardIcon },
    { label: 'Koleksiyon Sergile', description: 'Dijital garajını oluştur', icon: RectangleStackIcon },
    { label: 'Güvenli Takas', description: 'Güvenli takas sistemi', icon: ArrowsRightLeftIcon },
  ],
  en: [
    { label: 'Secure Shopping', description: 'SSL certified secure payment', icon: ShieldCheckIcon },
    { label: 'Free Shipping', description: 'On orders over 3,000 TL', icon: TruckIcon },
    { label: 'Easy Returns', description: '14 days unconditional return', icon: ArrowPathIcon },
    { label: 'Installments', description: 'Up to 12 month installments', icon: CreditCardIcon },
    { label: 'Display Collection', description: 'Create your digital garage', icon: RectangleStackIcon },
    { label: 'Safe Trading', description: 'Secure trading system', icon: ArrowsRightLeftIcon },
  ],
};

export default function TrustBadges() {
  const { locale } = useTranslation();
  const badges = TRUST_BADGES[locale as 'tr' | 'en'];

  return (
    <section className="py-6 bg-white border-y border-gray-100">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-4">
          {badges.map((badge, index) => {
            const Icon = badge.icon;
            return (
              <motion.div
                key={badge.label}
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05, duration: 0.3 }}
                className="flex flex-col items-center text-center px-2 py-2"
              >
                <Icon className="w-5 h-5 text-primary-500 mb-1.5" />
                <p className="text-sm font-semibold text-heading">{badge.label}</p>
                <p className="text-xs text-muted mt-0.5 hidden md:block">{badge.description}</p>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
