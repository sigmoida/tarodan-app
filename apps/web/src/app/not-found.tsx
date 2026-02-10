'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { HomeIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline';
import { useTranslation } from '@/i18n/LanguageContext';

const POPULAR_LINKS = [
  { href: '/listings', labelKey: 'nav.listings' },
  { href: '/trades', labelKey: 'nav.trades' },
  { href: '/collections', labelKey: 'nav.collections' },
  { href: '/brands', labelKey: 'nav.brands' },
  { href: '/sell', labelKey: 'utility.sitemap.sellOnSite' },
  { href: '/about', labelKey: 'footer.about' },
  { href: '/contact', labelKey: 'footer.contact' },
  { href: '/sitemap', labelKey: 'footer.sitemap' },
];

export default function NotFound() {
  const { t } = useTranslation();
  const router = useRouter();
  const [query, setQuery] = useState('');

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const q = query.trim();
    if (q) router.push(`/listings?search=${encodeURIComponent(q)}`);
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-4 py-12">
      <div className="text-center max-w-lg w-full">
        <p className="text-6xl font-bold text-primary-500 mb-4">404</p>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">{t('utility.notFound.title')}</h1>
        <p className="text-gray-600 mb-8">{t('utility.notFound.description')}</p>

        <form onSubmit={handleSearch} className="flex gap-2 mb-8 max-w-md mx-auto">
          <div className="relative flex-1">
            <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('utility.notFound.searchPlaceholder')}
              className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-300 focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            />
          </div>
          <button
            type="submit"
            className="px-5 py-3 rounded-xl bg-primary-500 text-white font-medium hover:bg-primary-600 transition-colors"
          >
            {t('utility.notFound.searchButton')}
          </button>
        </form>

        <div className="mb-8 text-left max-w-md mx-auto">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">{t('utility.notFound.popularCategories')}</h2>
          <div className="flex flex-wrap gap-2">
            {POPULAR_LINKS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="px-3 py-2 rounded-lg bg-white border border-gray-200 text-gray-700 hover:border-primary-500 hover:text-primary-600 text-sm transition-colors"
              >
                {t(item.labelKey)}
              </Link>
            ))}
          </div>
        </div>

        <Link
          href="/"
          className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-primary-500 text-white font-semibold hover:bg-primary-600 transition-colors"
        >
          <HomeIcon className="w-5 h-5" />
          {t('utility.notFound.goHome')}
        </Link>
      </div>
    </div>
  );
}
