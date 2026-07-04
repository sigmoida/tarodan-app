'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { Button } from '@tarodan/ui';

/**
 * Segment-level error boundary (root). Route render/veri hatalarını yakalar;
 * `reset()` ile segment yeniden denenebilir. Root layout'un kendi hatası için
 * ayrıca `global-error.tsx` vardır.
 */
export default function Error({
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
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-surface px-6 text-center">
      <p className="text-7xl font-bold text-danger-500">500</p>
      <h1 className="text-2xl font-semibold text-heading">Bir şeyler ters gitti</h1>
      <p className="max-w-md text-muted">
        Beklenmeyen bir hata oluştu. Tekrar deneyebilir ya da panele dönebilirsiniz.
      </p>
      {error.digest && <p className="text-xs text-subtle">Hata kodu: {error.digest}</p>}
      <div className="mt-2 flex flex-wrap items-center justify-center gap-3">
        <Button onClick={reset}>Tekrar dene</Button>
        <Link
          href="/dashboard"
          className="inline-flex items-center rounded-lg border border-border px-4 py-2 font-medium text-heading transition-colors hover:bg-surface-alt"
        >
          Panele dön
        </Link>
      </div>
    </main>
  );
}
