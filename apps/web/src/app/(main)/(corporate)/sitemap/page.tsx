'use client';

import Link from 'next/link';
import { useTranslation } from '@/i18n/LanguageContext';

const SITEMAP_SECTIONS = [
  {
    titleKey: 'utility.sitemap.marketplace',
    links: [
      { href: '/', labelKey: 'nav.home' },
      { href: '/listings', labelKey: 'nav.listings' },
      { href: '/profile/trades', labelKey: 'nav.trades' },
      { href: '/collections', labelKey: 'nav.collections' },
      { href: '/brands', labelKey: 'nav.brands' },
      { href: '/models', labelKey: 'nav.models' },
      { href: '/pricing', labelKey: 'membership.title' },
    ],
  },
  {
    titleKey: 'utility.sitemap.sell',
    links: [
      { href: '/sell', labelKey: 'utility.sitemap.sellOnSite' },
      { href: '/seller/register', labelKey: 'utility.sitemap.sellerRegister' },
      { href: '/register/business', labelKey: 'utility.sitemap.businessRegister' },
    ],
  },
  {
    titleKey: 'utility.sitemap.account',
    links: [
      { href: '/login', labelKey: 'auth.loginTitle' },
      { href: '/register', labelKey: 'auth.registerTitle' },
      { href: '/profile', labelKey: 'nav.profile' },
      { href: '/profile/orders', labelKey: 'nav.myOrders' },
      { href: '/profile/favorites', labelKey: 'nav.favorites' },
      { href: '/profile/messages', labelKey: 'nav.messages' },
      { href: '/cart', labelKey: 'nav.cart' },
    ],
  },
  {
    titleKey: 'footer.support',
    links: [
      { href: '/about', labelKey: 'footer.about' },
      { href: '/contact', labelKey: 'footer.contact' },
      { href: '/help', labelKey: 'footer.help' },
      { href: '/faq', labelKey: 'footer.faq' },
      { href: '/guides', labelKey: 'footer.guides' },
      { href: '/shipping-delivery', labelKey: 'footer.shipping' },
      { href: '/payment-options', labelKey: 'footer.paymentOptions' },
      { href: '/returns-exchanges', labelKey: 'footer.returns' },
      { href: '/security-features', labelKey: 'footer.security' },
      { href: '/size-guide', labelKey: 'footer.sizeGuide' },
      { href: '/authenticity', labelKey: 'footer.authenticity' },
      { href: '/collectors-guide', labelKey: 'footer.collectorsGuide' },
    ],
  },
  {
    titleKey: 'footer.legal',
    links: [
      { href: '/terms', labelKey: 'footer.terms' },
      { href: '/privacy', labelKey: 'footer.privacy' },
      { href: '/cookies', labelKey: 'footer.cookies' },
      { href: '/distance-sales', labelKey: 'footer.distanceSales' },
      { href: '/refund-policy', labelKey: 'footer.refundPolicy' },
      { href: '/seller-agreement', labelKey: 'footer.sellerAgreement' },
      { href: '/buyer-protection', labelKey: 'footer.buyerProtection' },
      { href: '/intellectual-property', labelKey: 'footer.intellectualProperty' },
    ],
  },
];

export default function SitemapPage() {
  const { t } = useTranslation();
  return (
    <div className="min-h-screen bg-surface">
      <div className="bg-gradient-to-br from-body to-heading text-inverted py-12">
        <div className="max-w-4xl mx-auto px-4">
          <h1 className="text-3xl font-bold mb-2">{t('utility.sitemap.title')}</h1>
          <p className="text-subtle">{t('utility.sitemap.subtitle')}</p>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-12">
        <div className="grid gap-10 sm:grid-cols-1 md:grid-cols-2">
          {SITEMAP_SECTIONS.map((section) => (
            <section key={section.titleKey} className="bg-surface-elevated rounded-2xl shadow-sm p-6">
              <h2 className="text-lg font-semibold text-heading border-b border-border pb-2 mb-4">
                {t(section.titleKey)}
              </h2>
              <ul className="space-y-2">
                {section.links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="text-primary-600 hover:text-primary-700 hover:underline"
                    >
                      {t(link.labelKey)}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
        <p className="mt-8 text-sm text-muted text-center">
          <Link href="/" className="text-primary-500 hover:underline">
            {t('nav.home')}
          </Link>
          {' · '}
          <a href="/sitemap.xml" className="text-primary-500 hover:underline" target="_blank" rel="noopener noreferrer">
            XML Sitemap
          </a>
        </p>
      </div>
    </div>
  );
}
