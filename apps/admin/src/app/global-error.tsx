'use client';

import { useEffect } from 'react';
import { Button } from '@tarodan/ui';
import './globals.css';

/**
 * Root layout'un kendisi hata verdiğinde devreye girer — kendi `<html>`/`<body>`
 * ağacını render eder ve globals.css'i getirir (aksi halde token'lar yüklenmez).
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') console.error(error);
  }, [error]);

  return (
    <html lang="tr">
      <body>
        <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-surface px-6 text-center">
          <p className="text-7xl font-bold text-danger-500">500</p>
          <h1 className="text-2xl font-semibold text-heading">Bir şeyler ters gitti</h1>
          <p className="max-w-md text-muted">
            Uygulama beklenmeyen bir hatayla karşılaştı. Yeniden denemeyi deneyin.
          </p>
          {error.digest && <p className="text-xs text-subtle">Hata kodu: {error.digest}</p>}
          <Button className="mt-2" onClick={reset}>
            Yeniden dene
          </Button>
        </main>
      </body>
    </html>
  );
}
