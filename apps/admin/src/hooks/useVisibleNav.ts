'use client';

import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { getNavGroups, getTopLevelNav } from '@/lib/navigation';
import { usePermissions } from '@/context/PermissionsContext';

/**
 * Nav items visible to the current admin, filtered by the server-resolved
 * permission set. Empty groups are dropped.
 */
export function useVisibleNav() {
  const t = useTranslations();
  const { canSee } = usePermissions();

  const topNav = useMemo(() => getTopLevelNav(t).filter(canSee), [t, canSee]);
  const groups = useMemo(
    () =>
      getNavGroups(t)
        .map((g) => ({ ...g, items: g.items.filter(canSee) }))
        .filter((g) => g.items.length > 0),
    [t, canSee],
  );

  return { topNav, groups };
}
