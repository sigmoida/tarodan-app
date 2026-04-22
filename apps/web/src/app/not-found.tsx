'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { HomeIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline';import { Button, Input } from '@tarodan/ui';


const POPULAR_LINKS = [
  { href: '/listings', label: 'İlanlar' },
  { href: '/trades', label: 'Takaslar' },
  { href: '/collections', label: 'Koleksiyonlar' },
  { href: '/ureticiler', label: 'Üreticiler' },
  { href: '/contact', label: 'İletişim' },
  { href: '/sitemap', label: 'Site Haritası' },
];

export default function NotFound() {
  const router = useRouter();
  const [query, setQuery] = useState('');

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const q = query.trim();
    if (q) router.push(`/listings?search=${encodeURIComponent(q)}`);
  };

  return (
    <div className="min-h-screen bg-surface flex flex-col items-center justify-center px-4 py-12">
      <div className="text-center max-w-lg w-full">
        <p className="text-6xl font-bold text-primary-500 mb-4">404</p>
        <h1 className="text-2xl font-bold text-heading mb-2">Sayfa bulunamadı</h1>
        <p className="text-muted mb-8">Aradığınız sayfa mevcut değil veya taşınmış olabilir.</p>

        <form onSubmit={handleSearch} className="flex gap-2 mb-8 max-w-md mx-auto">
          <div className="relative flex-1">
            <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-subtle" />
            <Input type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="İlanlarda ara..."
              className="pl-10 pr-4 py-3 rounded-xl" />
          </div>
          <Button variant="secondary" type="submit"
            className="px-5 py-3 rounded-xl bg-primary-500 text-inverted font-medium hover:bg-primary-600 transition-colors">
            Ara
          </Button>
        </form>

        <div className="mb-8 text-left max-w-md mx-auto">
          <h2 className="text-sm font-semibold text-body mb-3">Popüler sayfalar</h2>
          <div className="flex flex-wrap gap-2">
            {POPULAR_LINKS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="px-3 py-2 rounded-lg bg-surface-elevated border border-border text-body hover:border-primary-500 hover:text-primary-600 text-sm transition-colors"
              >
                {item.label}
              </Link>
            ))}
          </div>
        </div>

        <Link
          href="/"
          className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-primary-500 text-inverted font-semibold hover:bg-primary-600 transition-colors"
        >
          <HomeIcon className="w-5 h-5" />
          Ana Sayfaya Dön
        </Link>
      </div>
    </div>
  );
}
