import { useEffect } from 'react';
import { usePathname, router } from 'expo-router';
import { useAuthStore } from '../stores/authStore';
import { api } from '../services/api';

/**
 * Web BusinessMembershipGuard karşılığı (apps/web/src/components/BusinessMembershipGuard.tsx).
 *
 * Kurumsal hesap (companyName + taxId var) ama business üyelik tier'ı yoksa,
 * kullanıcı izin verilen yollar dışında bir yerdeyse üyelik sayfasına yönlendirir.
 * Web ile aynı şekilde önce kayıtlı ödeme yöntemi var mı kontrol eder; kart yoksa
 * (üyeliği tamamlaması gerektiği kesin) yönlendirir.
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

    let cancelled = false;
    const checkMembership = async () => {
      try {
        const response = await api.get('/payments/methods');
        const methods = response.data?.methods || response.data || [];
        if (!cancelled && Array.isArray(methods) && methods.length === 0) {
          router.replace('/membership');
        }
      } catch {
        // Kontrol başarısızsa kart yok varsay ve yönlendir (web ile aynı davranış).
        if (!cancelled) router.replace('/membership');
      }
    };
    checkMembership();

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, user, pathname]);

  return null;
}
