'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuthStore } from '@/stores/authStore';

export default function BusinessMembershipGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { isAuthenticated, user } = useAuthStore();

  useEffect(() => {
    if (!isAuthenticated || !user) return;

    const isBusinessAccount = !!(user.companyName && user.taxId);
    if (!isBusinessAccount) return;

    // Pending: sadece /business-pending ve /contact'a izin ver
    if (user.businessStatus === 'pending') {
      const allowedPaths = ['/business-pending', '/contact'];
      if (!allowedPaths.some((p) => pathname.startsWith(p))) {
        router.replace('/business-pending');
      }
      return;
    }

    // Rejected: sadece /business-rejected ve /contact'a izin ver
    if (user.businessStatus === 'rejected') {
      const allowedPaths = ['/business-rejected', '/contact', '/login'];
      if (!allowedPaths.some((p) => pathname.startsWith(p))) {
        router.replace('/business-rejected');
      }
      return;
    }

    // Approved ama business üyeliği yoksa üyelik sayfasına yönlendir
    const isBusinessTier = user.membershipTier === 'business';
    const allowedPaths = ['/profile/membership', '/membership'];
    if (!isBusinessTier && !allowedPaths.some((p) => pathname.startsWith(p))) {
      router.push('/profile/membership?required=true');
    }
  }, [isAuthenticated, user, pathname, router]);

  return <>{children}</>;
}
