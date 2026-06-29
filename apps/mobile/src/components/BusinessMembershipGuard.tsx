import { useEffect } from 'react';
import { usePathname, router } from 'expo-router';
import { useAuthStore } from '../stores/authStore';

/**
 * Web BusinessMembershipGuard karşılığı (apps/web/src/components/BusinessMembershipGuard.tsx).
 *
 * Kurumsal hesap (companyName + taxId var) için başvuru durumuna göre yönlendirir
 * (web ile birebir aynı sıra):
 *   - businessStatus === 'pending'  → /business-pending (sadece pending + contact serbest)
 *   - businessStatus === 'rejected' → /business-rejected (sadece rejected + contact + login serbest)
 *   - onaylı ama business üyelik tier'ı yoksa → /membership
 *
 * Render etmez (null) — _layout.tsx içinde mount edilir.
 */
export default function BusinessMembershipGuard() {
  const { isAuthenticated, user } = useAuthStore();
  const pathname = usePathname();

  useEffect(() => {
    if (!isAuthenticated || !user) return;

    const isBusinessAccount = !!(user.companyName && user.taxId);
    if (!isBusinessAccount) return;

    // expo-router pathname grup segmentlerini ((auth), (tabs)) içermez.

    // Pending: sadece /business-pending ve /contact'a izin ver
    if (user.businessStatus === 'pending') {
      const allowedPaths = ['/business-pending', '/contact'];
      if (!allowedPaths.some((p) => pathname.startsWith(p))) {
        router.replace('/business-pending');
      }
      return;
    }

    // Rejected: sadece /business-rejected, /contact ve /login'e izin ver
    if (user.businessStatus === 'rejected') {
      const allowedPaths = ['/business-rejected', '/contact', '/login'];
      if (!allowedPaths.some((p) => pathname.startsWith(p))) {
        router.replace('/business-rejected');
      }
      return;
    }

    // Onaylı ama business üyelik tier'ı yoksa üyelik sayfasına yönlendir.
    const isBusinessTier = user.membershipTier === 'business';
    if (isBusinessTier) return;

    // Ödeme/akış tamamlanabilsin diye üyelik ve auth yollarına izin ver.
    const allowedPrefixes = [
      '/membership',
      '/login',
      '/register',
      '/verify-email',
      '/forgot-password',
      '/reset-password',
    ];
    if (allowedPrefixes.some((p) => pathname.startsWith(p))) return;

    router.replace('/membership');
  }, [isAuthenticated, user, pathname]);

  return null;
}
