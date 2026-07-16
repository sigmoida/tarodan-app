import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

/**
 * Global 404. Rendered at the root level for all unmatched URLs (and
 * `notFound()` calls) — full screen, without the admin chrome. A Server
 * Component (no `use client`), so it reads translations directly via
 * `getTranslations` rather than the `useTranslations` hook.
 */
export default async function NotFound() {
  const t = await getTranslations();

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-surface px-6 text-center">
      <p className="text-7xl font-bold text-primary-600">404</p>
      <h1 className="text-2xl font-semibold text-heading">{t('admin.shared.notFound.title')}</h1>
      <p className="max-w-md text-muted">{t('admin.shared.notFound.description')}</p>
      <Link
        href="/dashboard"
        className="mt-2 inline-flex items-center rounded-lg bg-primary-600 px-4 py-2 font-medium text-inverted transition-colors hover:bg-primary-700"
      >
        {t('admin.shared.errors.backToPanel')}
      </Link>
    </main>
  );
}
