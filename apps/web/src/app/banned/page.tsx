'use client';

import { Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { NoSymbolIcon } from '@heroicons/react/24/outline';
import { useAuthStore } from '@/stores/authStore';

/**
 * Banlı kullanıcı sayfası. API interceptor'ı USER_BANNED (403) yakalayınca
 * buraya yönlendirir. Banlı kullanıcı yalnızca destek ekibiyle iletişime
 * geçebilir veya çıkış yapabilir (backend BannedUserGuard ile aynı izinler).
 */
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
    <div className="min-h-screen bg-body flex flex-col items-center justify-center px-4">
      <div className="text-center max-w-md">
        <NoSymbolIcon className="w-20 h-20 mx-auto text-danger-600 mb-6" />
        <h1 className="text-3xl font-bold mb-2 text-heading">Hesabınız Askıya Alındı</h1>
        <p className="text-muted mb-6">
          Hesabınız kural ihlali nedeniyle banlanmıştır. Bunun bir hata olduğunu
          düşünüyorsanız destek ekibiyle iletişime geçebilirsiniz.
        </p>
        {reason && (
          <div className="bg-danger-50 rounded-lg p-4 mb-6 text-left">
            <p className="text-sm font-semibold text-danger-600">Ban sebebi</p>
            <p className="text-sm text-heading mt-1">{reason}</p>
          </div>
        )}
        <div className="flex flex-col gap-3">
          <a
            href="/contact"
            className="w-full py-3 rounded-lg bg-primary-600 text-white font-medium hover:bg-primary-700 transition-colors"
          >
            Destek Ekibiyle İletişime Geç
          </a>
          <button
            onClick={handleLogout}
            className="w-full py-3 rounded-lg border border-border-strong text-heading font-medium hover:bg-surface transition-colors"
          >
            Çıkış Yap
          </button>
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
