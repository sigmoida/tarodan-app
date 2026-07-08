'use client';

import type { NavGroup as NavGroupType, NavItem } from '@/lib/navigation';
import { NavLink } from './NavLink';
import { NavGroup } from './NavGroup';

/**
 * The scrollable nav list. When searching, it shows a flat result list;
 * otherwise the top-level items followed by the collapsible groups.
 */
export function SidebarNav({
  topNav,
  groups,
  isSearching,
  searchResults,
  openGroups,
  onToggleGroup,
  onNavigate,
}: {
  topNav: NavItem[];
  groups: NavGroupType[];
  isSearching: boolean;
  searchResults: NavItem[];
  openGroups: Set<string>;
  onToggleGroup: (id: string) => void;
  onNavigate?: () => void;
}) {
  return (
    <nav className="flex-1 p-3 pt-2 space-y-1 overflow-y-auto min-h-0">
      {isSearching ? (
        searchResults.length === 0 ? (
          <p className="px-3 py-4 text-sm text-muted text-center">Eşleşen menü öğesi yok</p>
        ) : (
          searchResults.map((item) => (
            <NavLink key={item.href} item={item} onNavigate={onNavigate} />
          ))
        )
      ) : (
        <>
          {topNav.map((item) => (
            <NavLink key={item.href} item={item} onNavigate={onNavigate} />
          ))}

          {groups.map((group) => (
            <NavGroup
              key={group.id}
              group={group}
              isOpen={openGroups.has(group.id)}
              onToggle={() => onToggleGroup(group.id)}
              onNavigate={onNavigate}
            />
          ))}
        </>
      )}
    </nav>
  );
}
