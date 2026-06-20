'use client';

import { useRouter } from 'next/navigation';
import { ClockIcon, EnvelopeIcon, ArrowRightStartOnRectangleIcon } from '@heroicons/react/24/outline';
import { useAuthStore } from '@/stores/authStore';

export default function BusinessPendingPage() {
  const router = useRouter();
  const { user, logout } = useAuthStore();

  const handleLogout = async () => {
    await logout();
    router.replace('/login');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-50 via-surface-elevated to-warning-50 flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-md bg-surface-elevated rounded-3xl shadow-xl shadow-warning-500/10 p-8 md:p-10 border border-border-subtle text-center">
        <div className="w-20 h-20 mx-auto mb-6 bg-gradient-to-br from-warning-100 to-warning-100 rounded-full flex items-center justify-center">
          <ClockIcon className="w-10 h-10 text-warning-600" />
        </div>
        <h1 className="text-2xl font-bold mb-3 text-heading">Başvurunuz İnceleniyor</h1>
        <p className="text-muted mb-1">
          <span className="font-semibold text-heading">{user?.companyName}</span> adına yaptığınız başvuru onay sürecindedir.
        </p>
        <p className="text-sm text-muted mb-6">
          Ekibimiz incelemeyi tamamladığında <span className="font-medium text-heading">{user?.email}</span> adresinize bilgi gönderilecektir. Bu işlem genellikle 1–2 iş günü sürer.
        </p>

        <div className="bg-warning-50 border border-warning-200 rounded-xl p-4 mb-6 text-left">
          <p className="text-sm font-semibold text-warning-700 mb-2">Onay sürecinde neler olur?</p>
          <ul className="space-y-1.5 text-sm text-warning-700">
            <li>1. Ekibimiz şirket bilgileri ve vergi kimlik numaranızı doğrular.</li>
            <li>2. Onaylandığında hesabınız aktif olur ve e-posta ile bilgilendirilirsiniz.</li>
            <li>3. Reddedilmesi durumunda red gerekçesiyle birlikte e-posta alırsınız.</li>
          </ul>
        </div>

        <div className="flex flex-col gap-3">
          <a
            href="/contact"
            className="w-full py-3 rounded-xl border border-border text-heading font-medium hover:bg-surface transition-colors flex items-center justify-center gap-2"
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
