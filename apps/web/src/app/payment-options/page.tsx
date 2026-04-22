'use client';

import Link from 'next/link';
import { useTranslation } from '@/i18n';
import { CreditCardIcon, ShieldCheckIcon } from '@heroicons/react/24/outline';

export default function PaymentOptionsPage() {
  const { t } = useTranslation();

  return (
    <div className="min-h-screen bg-surface">
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <nav className="mb-8 text-sm text-muted">
          <Link href="/" className="hover:text-primary-600">Ana Sayfa</Link>
          <span className="mx-2">/</span>
          <span className="text-heading">{t('information.paymentOptions.title')}</span>
        </nav>
        <article className="bg-surface-elevated rounded-xl shadow-sm overflow-hidden">
          <header className="border-b border-border-subtle px-6 py-8">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-success-100 rounded-lg">
                <CreditCardIcon className="w-8 h-8 text-success-600" />
              </div>
              <div>
                <h1 className="text-3xl font-bold text-heading">{t('information.paymentOptions.title')}</h1>
                <p className="text-muted mt-1">{t('information.paymentOptions.subtitle')}</p>
              </div>
            </div>
          </header>
          <div className="px-6 py-8 space-y-8">
            <section>
              <h2 className="text-lg font-semibold text-heading mb-2">{t('information.paymentOptions.accepted')}</h2>
              <p className="text-body">{t('information.paymentOptions.acceptedDesc')}</p>
            </section>
            <section>
              <div className="flex items-center gap-2 mb-2">
                <ShieldCheckIcon className="w-5 h-5 text-success-600" />
                <h2 className="text-lg font-semibold text-heading">{t('information.paymentOptions.security')}</h2>
              </div>
              <p className="text-body">{t('information.paymentOptions.securityDesc')}</p>
            </section>
            <section>
              <h2 className="text-lg font-semibold text-heading mb-2">{t('information.paymentOptions.installments')}</h2>
              <p className="text-body">{t('information.paymentOptions.installmentsDesc')}</p>
            </section>
          </div>
        </article>
      </main>
    </div>
  );
}
