'use client';

import { useMemo } from 'react';
import { navGroups, topLevelNav } from '@/lib/navigation';
import { usePermissions } from '@/context/PermissionsContext';

/**
 * Nav items visible to the current admin, filtered by the server-resolved
 * permission set. Empty groups are dropped.
 */
export function useVisibleNav() {
  const { canSee } = usePermissions();

  const topNav = useMemo(() => topLevelNav.filter(canSee), [canSee]);
  const groups = useMemo(
    () =>
      navGroups
        .map((g) => ({ ...g, items: g.items.filter(canSee) }))
        .filter((g) => g.items.length > 0),
    [canSee],
  );

  return { topNav, groups };
}
