'use client';

import Link from 'next/link';
import { useTranslation } from '@/i18n';
import { ShieldCheckIcon } from '@heroicons/react/24/outline';

export default function SecurityFeaturesPage() {
  const { t } = useTranslation();

  return (
    <div className="min-h-screen bg-surface">
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <nav className="mb-8 text-sm text-muted">
          <Link href="/" className="hover:text-primary-600">Ana Sayfa</Link>
          <span className="mx-2">/</span>
          <span className="text-heading">{t('information.security.title')}</span>
        </nav>
        <article className="bg-surface-elevated rounded-xl shadow-sm overflow-hidden">
          <header className="border-b border-border-subtle px-6 py-8">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-success-100 rounded-lg">
                <ShieldCheckIcon className="w-8 h-8 text-success-600" />
              </div>
              <div>
                <h1 className="text-3xl font-bold text-heading">{t('information.security.title')}</h1>
                <p className="text-muted mt-1">{t('information.security.subtitle')}</p>
              </div>
            </div>
          </header>
          <div className="px-6 py-8 space-y-8">
            <section>
              <h2 className="text-lg font-semibold text-heading mb-2">{t('information.security.measures')}</h2>
              <p className="text-body">{t('information.security.measuresDesc')}</p>
            </section>
            <section>
              <h2 className="text-lg font-semibold text-heading mb-2">{t('information.security.buyerProtection')}</h2>
              <p className="text-body">{t('information.security.buyerProtectionDesc')}</p>
            </section>
            <section>
              <h2 className="text-lg font-semibold text-heading mb-2">{t('information.security.dataPrivacy')}</h2>
              <p className="text-body">{t('information.security.dataPrivacyDesc')}</p>
            </section>
          </div>
        </article>
      </main>
    </div>
  );
}
