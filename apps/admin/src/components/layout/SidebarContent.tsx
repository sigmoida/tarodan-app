"use client";

import { usePathname } from "next/navigation";
import { useVisibleNav } from "@/hooks/useVisibleNav";
import { useNavSearch } from "@/hooks/useNavSearch";
import { useNavGroups } from "@/hooks/useNavGroups";
import { LocaleSwitcher } from "./LocaleSwitcher";
import { NavSearch } from "./NavSearch";
import { SidebarNav } from "./SidebarNav";

/**
 * The navigation body — menu search + nav list + locale switcher.
 *
 * Masaüstü kenar çubuğu ve mobil çekmece bunu PAYLAŞIR; iki ayrı menü listesi
 * tutmak, birinde eklenen bir bölümün diğerinde eksik kalması demekti.
 */
export function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { topNav, groups } = useVisibleNav();
  const { query, setQuery, isSearching, results } = useNavSearch(
    topNav,
    groups,
  );
  const { openGroups, toggleGroup } = useNavGroups(pathname);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <NavSearch value={query} onChange={setQuery} />

      <SidebarNav
        topNav={topNav}
        groups={groups}
        isSearching={isSearching}
        searchResults={results}
        openGroups={openGroups}
        onToggleGroup={toggleGroup}
        onNavigate={onNavigate}
      />

      <div className="shrink-0 border-t border-border p-3">
        <LocaleSwitcher />
      </div>
    </div>
  );
}
