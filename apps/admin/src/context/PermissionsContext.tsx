'use client';

import { createContext, useContext, useMemo } from 'react';
import type { NavItem } from '@/lib/navigation';
import type { Permissions } from '@/lib/server/permissions';

/**
 * Client-side view of the server-resolved permission set. Hydrated once by the
 * (admin) layout — the client never fetches or infers permissions itself.
 *
 * This is a UX layer only (decide what nav/routes to show). The authoritative
 * authorization boundary is the NestJS API, which gates every endpoint.
 */
interface PermissionsValue extends Permissions {
  /** Does the current admin hold this permission key? */
  can: (permission: string | null | undefined) => boolean;
  /** Should this nav item be visible? */
  canSee: (item: NavItem) => boolean;
}

const PermissionsContext = createContext<PermissionsValue | null>(null);

export function PermissionsProvider({
  permissions,
  children,
}: {
  permissions: Permissions;
  children: React.ReactNode;
}) {
  const value = useMemo<PermissionsValue>(() => {
    const keySet = new Set(permissions.keys);
    const can = (permission: string | null | undefined) =>
      permissions.isSuperAdmin || (!!permission && keySet.has(permission));
    const canSee = (item: NavItem) =>
      permissions.isSuperAdmin || (!!item.permission && keySet.has(item.permission));
    return { ...permissions, can, canSee };
  }, [permissions]);

  return (
    <PermissionsContext.Provider value={value}>{children}</PermissionsContext.Provider>
  );
}

export function usePermissions(): PermissionsValue {
  const ctx = useContext(PermissionsContext);
  if (!ctx) throw new Error('usePermissions must be used within PermissionsProvider');
  return ctx;
}
