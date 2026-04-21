'use client';

import Link from 'next/link';
import { useTranslation } from '@/i18n';
import { CheckBadgeIcon } from '@heroicons/react/24/outline';

export default function AuthenticityPage() {
  const { t } = useTranslation();

  return (
    <div className="min-h-screen bg-gray-50">
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <nav className="mb-8 text-sm text-gray-500">
          <Link href="/" className="hover:text-primary-600">Ana Sayfa</Link>
          <span className="mx-2">/</span>
          <span className="text-gray-900">{t('information.authenticity.title')}</span>
        </nav>
        <article className="bg-white rounded-xl shadow-sm overflow-hidden">
          <header className="border-b border-gray-100 px-6 py-8">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-info-100 rounded-lg">
                <CheckBadgeIcon className="w-8 h-8 text-info-600" />
              </div>
              <div>
                <h1 className="text-3xl font-bold text-gray-900">{t('information.authenticity.title')}</h1>
                <p className="text-gray-600 mt-1">{t('information.authenticity.subtitle')}</p>
              </div>
            </div>
          </header>
          <div className="px-6 py-8 space-y-8">
            <section>
              <h2 className="text-lg font-semibold text-gray-900 mb-2">{t('information.authenticity.process')}</h2>
              <p className="text-gray-700">{t('information.authenticity.processDesc')}</p>
            </section>
            <section>
              <h2 className="text-lg font-semibold text-gray-900 mb-2">{t('information.authenticity.protection')}</h2>
              <p className="text-gray-700">{t('information.authenticity.protectionDesc')}</p>
            </section>
            <section>
              <h2 className="text-lg font-semibold text-gray-900 mb-2">{t('information.authenticity.badges')}</h2>
              <p className="text-gray-700">{t('information.authenticity.badgesDesc')}</p>
            </section>
          </div>
        </article>
      </main>
    </div>
  );
}
