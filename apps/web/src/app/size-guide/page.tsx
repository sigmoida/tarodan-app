'use client';

import Link from 'next/link';
import { useTranslation } from '@/i18n';
import { ScaleIcon } from '@heroicons/react/24/outline';

export default function SizeGuidePage() {
  const { t } = useTranslation();

  const scales = [
    { scale: t('information.sizeGuide.scale18'), length: '~25–30 cm', note: t('information.sizeGuide.note18') },
    { scale: t('information.sizeGuide.scale24'), length: '~18–20 cm', note: t('information.sizeGuide.note24') },
    { scale: t('information.sizeGuide.scale43'), length: '~10–12 cm', note: t('information.sizeGuide.note43') },
    { scale: t('information.sizeGuide.scale64'), length: '~6–8 cm', note: t('information.sizeGuide.note64') },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <nav className="mb-8 text-sm text-gray-500">
          <Link href="/" className="hover:text-orange-600">Ana Sayfa</Link>
          <span className="mx-2">/</span>
          <span className="text-gray-900">{t('information.sizeGuide.title')}</span>
        </nav>
        <article className="bg-white rounded-xl shadow-sm overflow-hidden">
          <header className="border-b border-gray-100 px-6 py-8">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-amber-100 rounded-lg">
                <ScaleIcon className="w-8 h-8 text-amber-600" />
              </div>
              <div>
                <h1 className="text-3xl font-bold text-gray-900">{t('information.sizeGuide.title')}</h1>
                <p className="text-gray-600 mt-1">{t('information.sizeGuide.subtitle')}</p>
              </div>
            </div>
          </header>
          <div className="px-6 py-8 space-y-8">
            <p className="text-gray-700">{t('information.sizeGuide.intro')}</p>
            <section>
              <h2 className="text-lg font-semibold text-gray-900 mb-4">{t('information.sizeGuide.tableTitle')}</h2>
              <div className="overflow-x-auto">
                <table className="w-full border border-gray-200 rounded-lg overflow-hidden">
                  <thead>
                    <tr className="bg-gray-50">
                      <th className="text-left px-4 py-3 text-sm font-semibold text-gray-900 border-b border-gray-200">{t('information.sizeGuide.scale')}</th>
                      <th className="text-left px-4 py-3 text-sm font-semibold text-gray-900 border-b border-gray-200">{t('information.sizeGuide.approxLength')}</th>
                      <th className="text-left px-4 py-3 text-sm font-semibold text-gray-900 border-b border-gray-200">{t('information.sizeGuide.notes')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {scales.map((row, i) => (
                      <tr key={i} className="border-b border-gray-100 last:border-0">
                        <td className="px-4 py-3 text-gray-900 font-medium">{row.scale}</td>
                        <td className="px-4 py-3 text-gray-700">{row.length}</td>
                        <td className="px-4 py-3 text-gray-600">{row.note}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        </article>
      </main>
    </div>
  );
}
