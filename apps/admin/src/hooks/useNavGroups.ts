'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { navGroups } from '@/lib/navigation';

const OPEN_GROUPS_STORAGE_KEY = 'admin-nav-open-groups';

/**
 * Collapsible nav-group state: which groups are expanded. The active route's
 * group auto-opens, and the user's open/closed choice persists in localStorage.
 */
export function useNavGroups(pathname: string) {
  // The group containing the active route auto-opens.
  const activeGroupId = useMemo(() => {
    for (const g of navGroups) {
      if (g.items.some((item) => pathname.startsWith(item.href))) return g.id;
    }
    return null;
  }, [pathname]);

  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set());
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(OPEN_GROUPS_STORAGE_KEY);
      if (raw) setOpenGroups(new Set(JSON.parse(raw) as string[]));
    } catch {}
    setHydrated(true);
  }, []);

  // Auto-open the active group only on a REAL group change. Clicking route-redirect
  // parents (e.g. /operations → /operations/orders) makes activeGroupId flicker
  // "operations → null → operations"; we keep the last (non-null) active group in a
  // ref and do NOT re-open on returning to the same group — so the user's manual
  // collapse of that group is preserved. A transient null is also ignored.
  const lastActiveRef = useRef<string | null>(null);
  useEffect(() => {
    if (!activeGroupId || activeGroupId === lastActiveRef.current) return;
    lastActiveRef.current = activeGroupId;
    setOpenGroups((prev) =>
      prev.has(activeGroupId) ? prev : new Set(prev).add(activeGroupId),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeGroupId]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(OPEN_GROUPS_STORAGE_KEY, JSON.stringify(Array.from(openGroups)));
    } catch {}
  }, [openGroups, hydrated]);

  const toggleGroup = (id: string) =>
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return { openGroups, toggleGroup };
}
