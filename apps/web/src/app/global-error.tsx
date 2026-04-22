'use client';

import Link from 'next/link';import { Button } from '@tarodan/ui';


export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="tr">
      <body className="min-h-screen bg-surface flex flex-col items-center justify-center px-4 py-12 antialiased">
        <div className="text-center max-w-md">
          <p className="text-6xl font-bold text-warning-500 mb-4">500</p>
          <h1 className="text-2xl font-bold text-heading mb-2">Bir hata oluştu</h1>
          <p className="text-muted mb-8">
            Beklenmeyen bir sorun oluştu. Lütfen sayfayı yenileyin veya ana sayfaya dönün.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button variant="secondary" onClick={reset}
              className="px-6 py-3 rounded-xl bg-primary-500 text-inverted font-semibold hover:bg-primary-600 transition-colors">
              Tekrar Dene
            </Button>
            <Link
              href="/"
              className="px-6 py-3 rounded-xl border-2 text-body font-semibold hover:border-primary-500 hover:text-primary-600 text-center"
            >
              Ana Sayfa
            </Link>
          </div>
        </div>
      </body>
    </html>
  );
}
