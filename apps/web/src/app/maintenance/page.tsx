'use client';

import { useTranslation } from '@/i18n/LanguageContext';
import { WrenchScrewdriverIcon } from '@heroicons/react/24/outline';

const SOCIAL_LINKS = [
  { name: 'Twitter', href: '#', icon: 'X' },
  { name: 'Instagram', href: '#', icon: 'IG' },
  { name: 'Facebook', href: '#', icon: 'f' },
];

export default function MaintenancePage() {
  const { t } = useTranslation();
  return (
    <div className="min-h-screen bg-gray-900 flex flex-col items-center justify-center px-4 text-white">
      <div className="text-center max-w-md">
        <WrenchScrewdriverIcon className="w-20 h-20 mx-auto text-amber-400 mb-6" />
        <h1 className="text-3xl font-bold mb-2">{t('utility.maintenance.title')}</h1>
        <p className="text-gray-400 mb-6">{t('utility.maintenance.description')}</p>
        <p className="text-sm text-gray-500 mb-8">
          {t('utility.maintenance.estimatedTime')}: ~30 dakika
        </p>
        <p className="text-sm font-medium text-gray-300 mb-2">{t('utility.maintenance.socialTitle')}</p>
        <div className="flex justify-center gap-4">
          {SOCIAL_LINKS.map((s) => (
            <a
              key={s.name}
              href={s.href}
              className="w-10 h-10 rounded-full bg-gray-700 flex items-center justify-center text-sm font-medium hover:bg-orange-500 transition-colors"
              aria-label={s.name}
            >
              {s.icon}
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}
