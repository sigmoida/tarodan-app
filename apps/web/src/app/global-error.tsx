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
      <body className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-4 py-12 antialiased">
        <div className="text-center max-w-md">
          <p className="text-6xl font-bold text-warning-500 mb-4">500</p>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Bir hata oluştu</h1>
          <p className="text-gray-600 mb-8">
            Beklenmeyen bir sorun oluştu. Lütfen sayfayı yenileyin veya ana sayfaya dönün.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button variant="secondary" onClick={reset}
              className="px-6 py-3 rounded-xl bg-primary-500 text-white font-semibold hover:bg-primary-600 transition-colors">
              Tekrar Dene
            </Button>
            <Link
              href="/"
              className="px-6 py-3 rounded-xl border-2 text-gray-700 font-semibold hover:border-primary-500 hover:text-primary-600 text-center"
            >
              Ana Sayfa
            </Link>
          </div>
        </div>
      </body>
    </html>
  );
}
