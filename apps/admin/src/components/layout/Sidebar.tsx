"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import { useTranslations } from "next-intl";
import { IconButton, Logo } from "@tarodan/ui";
import { XMarkIcon } from "@heroicons/react/24/outline";
import { useVisibleNav } from "@/hooks/useVisibleNav";
import { useNavSearch } from "@/hooks/useNavSearch";
import { useNavGroups } from "@/hooks/useNavGroups";
import { NavSearch } from "./NavSearch";
import { SidebarNav } from "./SidebarNav";

/**
 * The left navigation drawer: brand + menu search + nav list. Fixed on lg+,
 * slides in over a backdrop on smaller screens. `onClose` collapses the mobile
 * drawer (called on every navigation and the close button).
 */
export function Sidebar({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const t = useTranslations();
  const pathname = usePathname();
  const { topNav, groups } = useVisibleNav();
  const { query, setQuery, isSearching, results } = useNavSearch(
    topNav,
    groups,
  );
  const { openGroups, toggleGroup } = useNavGroups(pathname);

  return (
    <aside
      className={clsx(
        "fixed inset-y-0 left-0 z-navigation w-64 bg-surface-elevated transform transition-transform duration-300 lg:translate-x-0 flex flex-col shadow-soft",
        open ? "translate-x-0" : "-translate-x-full",
      )}
    >
      <div className="h-16 flex items-center justify-between px-4 bg-primary-500">
        <Link
          href="/dashboard"
          scroll={false}
          onClick={onClose}
          className="flex items-center"
        >
          <Logo
            alt="Tarodan Logo"
            style={{ maxHeight: "40px", width: "auto" }}
          />
        </Link>
        <IconButton
          aria-label={t("admin.shared.sidebar.closeMenu")}
          className="text-inverted hover:bg-inverted/10 lg:hidden"
          onClick={onClose}
        >
          <XMarkIcon className="h-6 w-6" />
        </IconButton>
      </div>

      <NavSearch value={query} onChange={setQuery} />

      <SidebarNav
        topNav={topNav}
        groups={groups}
        isSearching={isSearching}
        searchResults={results}
        openGroups={openGroups}
        onToggleGroup={toggleGroup}
        onNavigate={onClose}
      />
    </aside>
  );
}
