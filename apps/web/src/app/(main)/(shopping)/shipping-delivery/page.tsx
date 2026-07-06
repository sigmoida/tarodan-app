'use client';

import Link from 'next/link';
import { useTranslation } from '@/i18n';
import { TruckIcon } from '@heroicons/react/24/outline';

export default function ShippingDeliveryPage() {
  const { t } = useTranslation();

  return (
    <div className="min-h-screen bg-surface">
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <nav className="mb-8 text-sm text-muted">
          <Link href="/" className="hover:text-primary-600">Ana Sayfa</Link>
          <span className="mx-2">/</span>
          <span className="text-heading">{t('information.shipping.title')}</span>
        </nav>
        <article className="bg-surface-elevated rounded-xl shadow-sm overflow-hidden">
          <header className="border-b border-border-subtle px-6 py-8">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary-100 rounded-lg">
                <TruckIcon className="w-8 h-8 text-primary-600" />
              </div>
              <div>
                <h1 className="text-3xl font-bold text-heading">{t('information.shipping.title')}</h1>
                <p className="text-muted mt-1">{t('information.shipping.subtitle')}</p>
              </div>
            </div>
          </header>
          <div className="px-6 py-8 space-y-8">
            <section>
              <h2 className="text-lg font-semibold text-heading mb-2">{t('information.shipping.methods')}</h2>
              <p className="text-body">{t('information.shipping.methodsDesc')}</p>
            </section>
            <section>
              <h2 className="text-lg font-semibold text-heading mb-2">{t('information.shipping.costs')}</h2>
              <p className="text-body">{t('information.shipping.costsDesc')}</p>
            </section>
            <section>
              <h2 className="text-lg font-semibold text-heading mb-2">{t('information.shipping.times')}</h2>
              <p className="text-body">{t('information.shipping.timesDesc')}</p>
            </section>
            <section>
              <h2 className="text-lg font-semibold text-heading mb-2">{t('information.shipping.tracking')}</h2>
              <p className="text-body mb-3">{t('information.shipping.trackingDesc')}</p>
              <Link href="/track-order" className="inline-flex items-center gap-2 text-primary-600 hover:text-primary-700 font-medium">
                {t('information.shipping.trackLink')} →
              </Link>
            </section>
          </div>
        </article>
      </main>
    </div>
  );
}
