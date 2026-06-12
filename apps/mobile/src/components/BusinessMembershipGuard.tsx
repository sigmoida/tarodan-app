import { useEffect } from 'react';
import { usePathname, router } from 'expo-router';
import { useAuthStore } from '../stores/authStore';

/**
 * Web BusinessMembershipGuard karşılığı (apps/web/src/components/BusinessMembershipGuard.tsx).
 *
 * Kurumsal hesap (companyName + taxId var) ama business üyelik tier'ı yoksa,
 * kullanıcı izin verilen yollar dışında bir yerdeyse üyelik sayfasına yönlendirir.
 *
 * Render etmez (null) — _layout.tsx içinde mount edilir.
 */
export default function BusinessMembershipGuard() {
  const { isAuthenticated, user } = useAuthStore();
  const pathname = usePathname();

  useEffect(() => {
    if (!isAuthenticated || !user) return;

    const isBusinessAccount = !!(user.companyName && user.taxId);
    const isBusinessTier = user.membershipTier === 'business';
    if (!isBusinessAccount || isBusinessTier) return;

    // expo-router pathname grup segmentlerini ((auth), (tabs)) içermez.
    // Ödeme/akış tamamlanabilsin diye üyelik ve auth yollarına izin ver.
    const allowedPrefixes = [
      '/membership',
      '/login',
      '/register',
      '/verify-email',
      '/forgot-password',
      '/reset-password',
    ];
    const isAllowedPath = allowedPrefixes.some((p) => pathname.startsWith(p));
    if (isAllowedPath) return;

    router.replace('/membership');
  }, [isAuthenticated, user, pathname]);

  return null;
}
