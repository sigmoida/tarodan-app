'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuthStore } from '@/stores/authStore';
import { api } from '@/lib/api';

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
    // But allow checkout page so user can complete payment
    if (isBusinessAccount && !isBusinessTier && !isAllowedPath) {
      // Check if user has payment methods (if no cards, definitely need membership)
      const checkMembership = async () => {
        try {
          const paymentMethodsResponse = await api.get('/payments/methods');
          const methods = paymentMethodsResponse.data?.methods || paymentMethodsResponse.data || [];
          
          if (methods.length === 0) {
            // No cards, force redirect to membership
            router.push('/profile/membership?required=true');
          }
        } catch (error) {
          // If check fails, assume no cards and redirect
          router.push('/profile/membership?required=true');
        }
      };

      checkMembership();
    }
  }, [isAuthenticated, user, pathname, router]);

  return <>{children}</>;
}
