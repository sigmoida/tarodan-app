'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useTranslation } from '@/i18n/LanguageContext';
import LanguageSwitcher from '@/components/LanguageSwitcher';

export default function Footer() {
  const { t, locale } = useTranslation();

  const FOOTER_LINKS = {
    marketplace: [
      { href: '/listings', label: t('nav.listings') },
      { href: '/trades', label: t('nav.trades') },
      { href: '/collections', label: t('nav.collections') },
      { href: '/pricing', label: t('membership.title') },
    ],
    support: [
      { href: '/about', label: t('footer.about') },
      { href: '/help', label: t('footer.help') },
      { href: '/contact', label: t('footer.contact') },
      { href: '/faq', label: t('footer.faq') },
    ],
    legal: [
      { href: '/terms', label: t('footer.terms') },
      { href: '/privacy', label: t('footer.privacy') },
      { href: '/cookies', label: t('footer.cookies') },
    ],
  };

  return (
    <footer className="bg-white border-t border-gray-200">
      <div className="mx-auto px-6 sm:px-8 lg:px-12 xl:px-16 py-10">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-8">
          {/* Brand */}
          <div className="col-span-2 md:col-span-1">
            <Link href="/" className="inline-block mb-3">
              <Image
                src="/tarodan-logo.jpg"
                alt="Tarodan Logo"
                width={110}
                height={36}
                className="object-contain"
                style={{ width: 'auto', height: 'auto', borderRadius: '2px' }}
              />
            </Link>
            <p className="text-xs text-gray-500 max-w-[220px] leading-relaxed mb-4">
              {t('footer.description')}
            </p>
            <div className="flex items-center gap-3">
              <a href="#" className="w-8 h-8 flex items-center justify-center bg-gray-100 hover:bg-orange-50 hover:text-orange-500 text-gray-500 transition-colors" style={{borderRadius:'4px'}} aria-label="Twitter">
                <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M24 4.557c-.883.392-1.832.656-2.828.775 1.017-.609 1.798-1.574 2.165-2.724-.951.564-2.005.974-3.127 1.195-.897-.957-2.178-1.555-3.594-1.555-3.179 0-5.515 2.966-4.797 6.045-4.091-.205-7.719-2.165-10.148-5.144-1.29 2.213-.669 5.108 1.523 6.574-.806-.026-1.566-.247-2.229-.616-.054 2.281 1.581 4.415 3.949 4.89-.693.188-1.452.232-2.224.084.626 1.956 2.444 3.379 4.6 3.419-2.07 1.623-4.678 2.348-7.29 2.04 2.179 1.397 4.768 2.212 7.548 2.212 9.142 0 14.307-7.721 13.995-14.646.962-.695 1.797-1.562 2.457-2.549z" /></svg>
              </a>
              <a href="#" className="w-8 h-8 flex items-center justify-center bg-gray-100 hover:bg-orange-50 hover:text-orange-500 text-gray-500 transition-colors" style={{borderRadius:'4px'}} aria-label="Instagram">
                <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073z" /></svg>
              </a>
            </div>
          </div>

          {/* Marketplace */}
          <div>
            <h3 className="text-xs font-bold text-gray-900 uppercase tracking-widest mb-3">{t('footer.marketplace')}</h3>
            <ul className="space-y-2">
              {FOOTER_LINKS.marketplace.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="text-sm text-gray-500 hover:text-orange-500 transition-colors">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Support */}
          <div>
            <h3 className="text-xs font-bold text-gray-900 uppercase tracking-widest mb-3">{t('footer.support')}</h3>
            <ul className="space-y-2">
              {FOOTER_LINKS.support.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="text-sm text-gray-500 hover:text-orange-500 transition-colors">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Legal */}
          <div>
            <h3 className="text-xs font-bold text-gray-900 uppercase tracking-widest mb-3">{t('footer.legal')}</h3>
            <ul className="space-y-2">
              {FOOTER_LINKS.legal.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="text-sm text-gray-500 hover:text-orange-500 transition-colors">
                    {link.label}
                  </Link>
                </li>
              ))}
              <li>
                <button
                  onClick={() => { localStorage.removeItem('cookie_consent'); window.location.reload(); }}
                  className="text-sm text-gray-500 hover:text-orange-500 transition-colors text-left"
                >
                  {locale === 'en' ? 'Cookie Settings' : 'Çerez Ayarları'}
                </button>
              </li>
            </ul>
          </div>

          {/* Language */}
          <div>
            <h3 className="text-xs font-bold text-gray-900 uppercase tracking-widest mb-3">
              {locale === 'en' ? 'Language' : 'Dil'}
            </h3>
            <LanguageSwitcher variant="dropdown" className="bg-gray-100 border border-gray-200" />
          </div>
        </div>

        {/* Bottom bar */}
        <div className="border-t border-gray-200 mt-8 pt-6 flex flex-col sm:flex-row justify-between items-center gap-3">
          <p className="text-xs text-gray-400">
            &copy; {new Date().getFullYear()} TARODAN. {t('footer.copyright')}
          </p>
          <div className="flex items-center gap-3">
            <span className="px-3 py-1 bg-gray-100 text-[10px] font-semibold text-gray-500 uppercase tracking-wide" style={{borderRadius:'2px'}}>PayTR</span>
            <span className="px-3 py-1 bg-gray-100 text-[10px] font-semibold text-gray-500 uppercase tracking-wide" style={{borderRadius:'2px'}}>SSL</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
