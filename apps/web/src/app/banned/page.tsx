'use client';

import { Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { NoSymbolIcon } from '@heroicons/react/24/solid';
import { useAuthStore } from '@/stores/authStore';

function BannedContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const reason = searchParams.get('reason');
  const logout = useAuthStore((s) => s.logout);

  const handleLogout = async () => {
    await logout();
    router.replace('/login');
  };

  return (
    <div className="min-h-screen bg-surface flex flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="bg-surface-elevated border border-border rounded-2xl p-8 shadow-sm text-center">
          <div className="w-16 h-16 rounded-full bg-danger-100 flex items-center justify-center mx-auto mb-5">
            <NoSymbolIcon className="w-8 h-8 text-danger-600" />
          </div>

          <h1 className="text-2xl font-bold text-heading mb-2">Hesabınız Askıya Alındı</h1>
          <p className="text-muted text-sm mb-6">
            Hesabınız kural ihlali nedeniyle banlanmıştır. Bunun bir hata
            olduğunu düşünüyorsanız destek ekibiyle iletişime geçebilirsiniz.
          </p>

          {reason && (
            <div className="bg-danger-50 border border-danger-200 rounded-xl p-4 mb-6 text-left">
              <p className="text-xs font-semibold text-danger-600 uppercase tracking-wide mb-1">
                Ban sebebi
              </p>
              <p className="text-sm text-heading">{reason}</p>
            </div>
          )}

          <div className="flex flex-col gap-3">
            <a
              href="/contact"
              className="w-full py-3 rounded-xl bg-primary-500 text-white font-semibold hover:bg-primary-600 transition-colors text-sm"
            >
              Destek Ekibiyle İletişime Geç
            </a>
            <button
              onClick={handleLogout}
              className="w-full py-3 rounded-xl border border-border text-body font-medium hover:bg-surface transition-colors text-sm"
            >
              Çıkış Yap
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function BannedPage() {
  return (
    <Suspense>
      <BannedContent />
    </Suspense>
  );
}
