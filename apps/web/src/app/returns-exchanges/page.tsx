'use client';

import Link from 'next/link';
import { useTranslation } from '@/i18n';
import { ArrowPathIcon } from '@heroicons/react/24/outline';

export default function ReturnsExchangesPage() {
  const { t } = useTranslation();

  return (
    <div className="min-h-screen bg-gray-50">
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <nav className="mb-8 text-sm text-gray-500">
          <Link href="/" className="hover:text-orange-600">Ana Sayfa</Link>
          <span className="mx-2">/</span>
          <span className="text-gray-900">{t('information.returns.title')}</span>
        </nav>
        <article className="bg-white rounded-xl shadow-sm overflow-hidden">
          <header className="border-b border-gray-100 px-6 py-8">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <ArrowPathIcon className="w-8 h-8 text-blue-600" />
              </div>
              <div>
                <h1 className="text-3xl font-bold text-gray-900">{t('information.returns.title')}</h1>
                <p className="text-gray-600 mt-1">{t('information.returns.subtitle')}</p>
              </div>
            </div>
          </header>
          <div className="px-6 py-8 space-y-8">
            <section>
              <h2 className="text-lg font-semibold text-gray-900 mb-2">{t('information.returns.policy')}</h2>
              <p className="text-gray-700">{t('information.returns.policyDesc')}</p>
            </section>
            <section>
              <h2 className="text-lg font-semibold text-gray-900 mb-2">{t('information.returns.process')}</h2>
              <p className="text-gray-700">{t('information.returns.processDesc')}</p>
            </section>
            <section>
              <h2 className="text-lg font-semibold text-gray-900 mb-2">{t('information.returns.timeline')}</h2>
              <p className="text-gray-700">{t('information.returns.timelineDesc')}</p>
            </section>
          </div>
        </article>
      </main>
    </div>
  );
}
