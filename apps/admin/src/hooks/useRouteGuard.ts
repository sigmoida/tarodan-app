'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { routePermission } from '@/lib/navigation';
import { usePermissions } from '@/context/PermissionsContext';

/**
 * UX route guard: hide unauthorized page content immediately and redirect to the
 * scoped forbidden route. Permissions come from the server-resolved context, so
 * soft navigation matches the server layout's hard-navigation behavior. It is
 * NOT the security boundary — the NestJS API authorizes every endpoint.
 */
export function useRouteGuard() {
  const pathname = usePathname();
  const router = useRouter();
  const { can } = usePermissions();
  const required = routePermission(pathname);
  const isAllowed = !required || can(required);

  useEffect(() => {
    if (!isAllowed) {
      router.replace('/forbidden');
    }
  }, [isAllowed, router]);

  return isAllowed;
}
