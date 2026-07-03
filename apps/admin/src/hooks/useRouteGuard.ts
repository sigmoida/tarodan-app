'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { routePermission } from '@/lib/navigation';
import { usePermissions } from '@/lib/permissions-context';

/**
 * UX route guard: redirect to /dashboard when the current route requires a
 * permission the admin doesn't hold. Permissions come from the server-resolved
 * context, so this is instant and race-free. It is NOT the security boundary —
 * the NestJS API authorizes every endpoint regardless.
 */
export function useRouteGuard() {
  const pathname = usePathname();
  const router = useRouter();
  const { can } = usePermissions();

  useEffect(() => {
    const required = routePermission(pathname);
    if (required && !can(required)) {
      router.replace('/dashboard');
    }
  }, [pathname, can, router]);
}
