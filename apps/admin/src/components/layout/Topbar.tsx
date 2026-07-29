"use client";

import { useTranslations } from "next-intl";
import { IconButton } from "@tarodan/ui";
import { Bars3Icon } from "@heroicons/react/24/outline";
import { Breadcrumbs } from "./Breadcrumbs";
import { AdminProfileMenu } from "./AdminProfileMenu";
import { LocaleSwitcher } from "./LocaleSwitcher";

/** Fixed top bar: mobile menu trigger + breadcrumb trail + account menu. */
export function Topbar({ onOpenSidebar }: { onOpenSidebar: () => void }) {
  const t = useTranslations();
  return (
    <header className="fixed inset-x-0 top-0 z-30 h-16 gap-3 border-b border-primary-600 bg-primary-500 px-4 shadow-sm lg:left-64 flex items-center justify-between">
      <div className="flex items-center gap-3 min-w-0">
        <IconButton
          aria-label={t('admin.shared.topbar.openMenu')}
          className="text-inverted hover:bg-inverted/10 lg:hidden"
          onClick={onOpenSidebar}
        >
          <Bars3Icon className="h-6 w-6" />
        </IconButton>
        <div className="hidden sm:flex min-w-0">
          <Breadcrumbs />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <LocaleSwitcher />
        <AdminProfileMenu />
      </div>
    </header>
  );
}
