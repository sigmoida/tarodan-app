'use client';

import Link from 'next/link';
import { useTranslation } from '@/i18n';
import { useAuthStore } from '@/stores/authStore';
import {
  ShieldCheckIcon,
  UserGroupIcon,
  Cog6ToothIcon,
  ArrowsRightLeftIcon,
  ClipboardDocumentListIcon,
  PhotoIcon,
  TruckIcon,
} from '@heroicons/react/24/outline';

export default function SellOnWebsitePage() {
  const { t } = useTranslation();
  const { isAuthenticated } = useAuthStore();

  const benefits = [
    { icon: ShieldCheckIcon, titleKey: 'benefit1Title', descKey: 'benefit1Desc' },
    { icon: UserGroupIcon, titleKey: 'benefit2Title', descKey: 'benefit2Desc' },
    { icon: Cog6ToothIcon, titleKey: 'benefit3Title', descKey: 'benefit3Desc' },
    { icon: ArrowsRightLeftIcon, titleKey: 'benefit4Title', descKey: 'benefit4Desc' },
  ];

  const steps = [
    { icon: ClipboardDocumentListIcon, textKey: 'step1' },
    { icon: PhotoIcon, textKey: 'step2' },
    { icon: TruckIcon, textKey: 'step3' },
  ];

  return (
    <div className="min-h-screen bg-surface">
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Hero */}
        <section className="text-center mb-14">
          <h1 className="text-4xl font-bold text-heading mb-4">
            {t('sellOnWebsite.title')}
          </h1>
          <p className="text-lg text-muted max-w-2xl mx-auto">
            {t('sellOnWebsite.subtitle')}
          </p>
        </section>

        {/* Benefits */}
        <section className="mb-14">
          <h2 className="text-2xl font-bold text-heading mb-6">
            {t('sellOnWebsite.benefitsTitle')}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {benefits.map(({ icon: Icon, titleKey, descKey }) => (
              <div
                key={titleKey}
                className="bg-surface-elevated rounded-xl shadow-sm p-6 border border-border-subtle"
              >
                <div className="flex items-center gap-3 mb-3">
                  <div className="p-2 bg-primary-100 rounded-lg">
                    <Icon className="w-6 h-6 text-primary-600" />
                  </div>
                  <h3 className="font-semibold text-heading">
                    {t(`sellOnWebsite.${titleKey}`)}
                  </h3>
                </div>
                <p className="text-muted text-sm">
                  {t(`sellOnWebsite.${descKey}`)}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* How it works */}
        <section className="mb-14">
          <h2 className="text-2xl font-bold text-heading mb-6">
            {t('sellOnWebsite.howTitle')}
          </h2>
          <div className="flex flex-col sm:flex-row gap-6 sm:gap-4">
            {steps.map(({ icon: Icon, textKey }, i) => (
              <div key={textKey} className="flex-1 flex items-start gap-4">
                <div className="flex-shrink-0 w-10 h-10 rounded-full bg-primary-500 text-inverted flex items-center justify-center font-bold">
                  {i + 1}
                </div>
                <div className="flex items-center gap-2 min-w-0">
                  <Icon className="w-5 h-5 text-subtle flex-shrink-0" />
                  <p className="text-body">{t(`sellOnWebsite.${textKey}`)}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Requirements */}
        <section className="mb-14">
          <h2 className="text-2xl font-bold text-heading mb-4">
            {t('sellOnWebsite.requirementsTitle')}
          </h2>
          <ul className="space-y-2 text-body">
            <li className="flex items-center gap-2">
              <span className="text-primary-500">•</span>
              {t('sellOnWebsite.req1')}
            </li>
            <li className="flex items-center gap-2">
              <span className="text-primary-500">•</span>
              {t('sellOnWebsite.req2')}
            </li>
            <li className="flex items-center gap-2">
              <span className="text-primary-500">•</span>
              {t('sellOnWebsite.req3')}
            </li>
          </ul>
        </section>

        {/* Success story + CTA */}
        <section className="bg-surface-elevated rounded-xl shadow-sm p-8 border border-border-subtle text-center">
          <p className="text-muted mb-6">{t('sellOnWebsite.successStory')}</p>
          <Link
            href={isAuthenticated ? '/listings/new' : '/register?redirect=/listings/new'}
            className="inline-block px-8 py-4 bg-primary-500 hover:bg-primary-600 text-inverted font-semibold rounded-xl transition-colors"
          >
            {isAuthenticated ? t('sellOnWebsite.ctaLoggedIn') : t('sellOnWebsite.cta')}
          </Link>
          {!isAuthenticated && (
            <p className="text-sm text-muted mt-3 space-x-4">
              <Link href="/login" className="text-primary-500 hover:underline">
                {t('sellOnWebsite.loginPrompt')}
              </Link>
              <span>·</span>
              <Link href="/register/business" className="text-primary-500 hover:underline">
                {t('sellOnWebsite.businessRegister')}
              </Link>
            </p>
          )}
        </section>
      </main>
    </div>
  );
}
