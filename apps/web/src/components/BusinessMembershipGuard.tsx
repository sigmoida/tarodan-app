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

    // Check if user is business account without business membership
    const isBusinessAccount = user.companyName && user.taxId;
    const isBusinessTier = user.membershipTier === 'business';

    // Allow navigation to membership and checkout pages
    const allowedPaths = ['/profile/membership', '/membership/checkout'];
    const isAllowedPath = allowedPaths.some(path => pathname.startsWith(path));

    // If business account without business membership, redirect to membership page
    // (allow checkout so user can complete payment)
    if (isBusinessAccount && !isBusinessTier && !isAllowedPath) {
      router.push('/profile/membership?required=true');
    }
  }, [isAuthenticated, user, pathname, router]);

  return <>{children}</>;
}
