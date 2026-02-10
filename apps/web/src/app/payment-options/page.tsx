'use client';

import Link from 'next/link';
import { useTranslation } from '@/i18n';
import { CreditCardIcon, ShieldCheckIcon } from '@heroicons/react/24/outline';

export default function PaymentOptionsPage() {
  const { t } = useTranslation();

  return (
    <div className="min-h-screen bg-gray-50">
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <nav className="mb-8 text-sm text-gray-500">
          <Link href="/" className="hover:text-orange-600">Ana Sayfa</Link>
          <span className="mx-2">/</span>
          <span className="text-gray-900">{t('information.paymentOptions.title')}</span>
        </nav>
        <article className="bg-white rounded-xl shadow-sm overflow-hidden">
          <header className="border-b border-gray-100 px-6 py-8">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 rounded-lg">
                <CreditCardIcon className="w-8 h-8 text-green-600" />
              </div>
              <div>
                <h1 className="text-3xl font-bold text-gray-900">{t('information.paymentOptions.title')}</h1>
                <p className="text-gray-600 mt-1">{t('information.paymentOptions.subtitle')}</p>
              </div>
            </div>
          </header>
          <div className="px-6 py-8 space-y-8">
            <section>
              <h2 className="text-lg font-semibold text-gray-900 mb-2">{t('information.paymentOptions.accepted')}</h2>
              <p className="text-gray-700">{t('information.paymentOptions.acceptedDesc')}</p>
            </section>
            <section>
              <div className="flex items-center gap-2 mb-2">
                <ShieldCheckIcon className="w-5 h-5 text-green-600" />
                <h2 className="text-lg font-semibold text-gray-900">{t('information.paymentOptions.security')}</h2>
              </div>
              <p className="text-gray-700">{t('information.paymentOptions.securityDesc')}</p>
            </section>
            <section>
              <h2 className="text-lg font-semibold text-gray-900 mb-2">{t('information.paymentOptions.installments')}</h2>
              <p className="text-gray-700">{t('information.paymentOptions.installmentsDesc')}</p>
            </section>
          </div>
        </article>
      </main>
    </div>
  );
}
