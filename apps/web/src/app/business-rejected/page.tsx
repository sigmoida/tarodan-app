'use client';

import { useRouter } from 'next/navigation';
import { XCircleIcon, EnvelopeIcon, ArrowRightStartOnRectangleIcon } from '@heroicons/react/24/outline';
import { useAuthStore } from '@/stores/authStore';

export default function BusinessRejectedPage() {
  const router = useRouter();
  const { user, logout } = useAuthStore();

  const handleLogout = async () => {
    await logout();
    router.replace('/login');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-error-50 via-surface-elevated to-primary-50 flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-md bg-surface-elevated rounded-3xl shadow-xl shadow-error-500/10 p-8 md:p-10 border border-border-subtle text-center">
        <div className="w-20 h-20 mx-auto mb-6 bg-gradient-to-br from-error-100 to-error-100 rounded-full flex items-center justify-center">
          <XCircleIcon className="w-10 h-10 text-error-600" />
        </div>
        <h1 className="text-2xl font-bold mb-3 text-heading">Başvurunuz Reddedildi</h1>
        <p className="text-muted mb-1">
          <span className="font-semibold text-heading">{user?.companyName}</span> adına yaptığınız şirket hesabı başvurusu onaylanmadı.
        </p>
        <p className="text-sm text-muted mb-6">
          Red gerekçesi <span className="font-medium text-heading">{user?.email}</span> adresinize e-posta ile gönderilmiştir.
        </p>

        <div className="bg-error-50 border border-error-200 rounded-xl p-4 mb-6 text-left">
          <p className="text-sm text-error-700">
            Başvurunuzun reddedildiğini düşünüyorsanız veya eksik bilgi olduğuna inanıyorsanız destek ekibiyle iletişime geçebilirsiniz.
          </p>
        </div>

        <div className="flex flex-col gap-3">
          <a
            href="/contact"
            className="w-full py-3 rounded-xl bg-primary-500 text-inverted font-medium hover:bg-primary-600 transition-colors flex items-center justify-center gap-2"
          >
            <EnvelopeIcon className="w-4 h-4" />
            Destek Ekibiyle İletişime Geç
          </a>
          <button
            onClick={handleLogout}
            className="w-full py-2.5 rounded-xl text-muted text-sm font-medium hover:text-heading transition-colors flex items-center justify-center gap-2"
          >
            <ArrowRightStartOnRectangleIcon className="w-4 h-4" />
            Çıkış Yap
          </button>
        </div>
      </div>
    </div>
  );
}
