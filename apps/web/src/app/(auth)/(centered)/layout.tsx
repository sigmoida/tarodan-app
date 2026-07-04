'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useTranslation } from '@/i18n';

/**
 * Shared frame for the single-column auth pages (forgot / reset password,
 * verify email): brand gradient background, logo header, centered content
 * slot, and the copyright footer — the block those pages used to each
 * duplicate. Pages under this group render only their card/state content.
 * (login / register keep their own two-column hero frame.)
 */
export default function CenteredAuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { locale } = useTranslation();

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-50 via-surface-elevated to-warning-50 flex flex-col">
      <header className="p-6">
        <Link href="/" className="inline-flex items-center gap-2 group">
          <Image
            src="/tarodan-logo.jpg"
            alt="Tarodan"
            width={162}
            height={40}
            className="rounded-lg object-contain"
          />
        </Link>
      </header>

      <main className="flex-1 flex items-center justify-center px-4 py-8">
        {children}
      </main>

      <footer className="p-6 text-center">
        <p className="text-sm text-subtle">
          © {new Date().getFullYear()} Tarodan.{' '}
          {locale === 'tr' ? 'Tüm hakları saklıdır.' : 'All rights reserved.'}
        </p>
      </footer>
    </div>
  );
}
