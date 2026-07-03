'use client';

import { useMemo, useState } from 'react';
import { matchesQuery, type NavGroup, type NavItem } from '@/lib/navigation';

/**
 * Sidebar search: owns the query and, when searching, flattens the visible nav
 * (groups ignored) into a single filtered result list.
 */
export function useNavSearch(topNav: NavItem[], groups: NavGroup[]) {
  const [query, setQuery] = useState('');
  const q = query.trim().toLocaleLowerCase('tr-TR');
  const isSearching = q.length > 0;

  const results = useMemo(() => {
    if (!isSearching) return [] as NavItem[];
    const all = [...topNav, ...groups.flatMap((g) => g.items)];
    return all.filter((item) => matchesQuery(item, q));
  }, [isSearching, q, topNav, groups]);

  return { query, setQuery, isSearching, results };
}
