'use client';

import Link from 'next/link';
import { useTranslation } from '@/i18n';

export default function AboutPage() {
  const { t } = useTranslation();

  return (
    <div className="min-h-screen bg-gray-50">
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <nav className="mb-8 text-sm text-gray-500">
          <Link href="/" className="hover:text-primary-600">Ana Sayfa</Link>
          <span className="mx-2">/</span>
          <span className="text-gray-900">{t('information.about.title')}</span>
        </nav>
        <article className="bg-white rounded-xl shadow-sm overflow-hidden">
          <header className="border-b border-gray-100 px-6 py-8">
            <h1 className="text-3xl font-bold text-gray-900">{t('information.about.title')}</h1>
            <p className="text-gray-600 mt-2">{t('information.about.subtitle')}</p>
          </header>
          <div className="px-6 py-8 space-y-6 prose prose-gray max-w-none">
            <section>
              <h2 className="text-xl font-semibold text-gray-900 mb-2">{t('information.about.storyTitle')}</h2>
              <p className="text-gray-700">{t('information.about.story')}</p>
            </section>
            <section>
              <h2 className="text-xl font-semibold text-gray-900 mb-2">{t('information.about.missionTitle')}</h2>
              <p className="text-gray-700">{t('information.about.mission')}</p>
            </section>
            <section>
              <h2 className="text-xl font-semibold text-gray-900 mb-2">{t('information.about.valuesTitle')}</h2>
              <p className="text-gray-700">{t('information.about.values')}</p>
            </section>
          </div>
        </article>
      </main>
    </div>
  );
}
