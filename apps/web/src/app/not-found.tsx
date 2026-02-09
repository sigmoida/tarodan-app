import Link from 'next/link';
import { HomeIcon } from '@heroicons/react/24/outline';

export default function NotFound() {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-4">
      <div className="text-center max-w-md">
        <p className="text-6xl font-bold text-primary-500 mb-4">404</p>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Sayfa bulunamadı</h1>
        <p className="text-gray-600 mb-8">
          Aradığınız sayfa mevcut değil veya taşınmış olabilir.
        </p>
        <Link
          href="/"
          className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-primary-500 text-white font-semibold hover:bg-primary-600 transition-colors"
        >
          <HomeIcon className="w-5 h-5" />
          Ana Sayfaya Dön
        </Link>
      </div>
    </div>
  );
}
