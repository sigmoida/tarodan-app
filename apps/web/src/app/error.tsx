'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { ArrowPathIcon } from '@heroicons/react/24/outline';import { Button } from '@tarodan/ui';


export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-4 py-12">
      <div className="text-center max-w-md">
        <p className="text-6xl font-bold text-warning-500 mb-4">500</p>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Bir hata oluştu</h1>
        <p className="text-gray-600 mb-8">Beklenmeyen bir sorun oluştu. Lütfen tekrar deneyin veya ana sayfaya dönün.</p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Button variant="secondary" onClick={reset}
            className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-primary-500 text-white font-semibold hover:bg-primary-600 transition-colors">
            <ArrowPathIcon className="w-5 h-5" />
            Tekrar Dene
          </Button>
          <Link
            href="/"
            className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl border-2 text-gray-700 font-semibold hover:border-primary-500 hover:text-primary-600"
          >
            Ana Sayfa
          </Link>
        </div>
      </div>
    </div>
  );
}
