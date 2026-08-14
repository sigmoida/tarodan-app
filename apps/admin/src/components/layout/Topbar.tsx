"use client";

import Image from "next/image";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button } from "@tarodan/ui";
import { Bars3Icon } from "@heroicons/react/24/outline";
import { Breadcrumbs } from "./Breadcrumbs";
import { AdminProfileMenu } from "./AdminProfileMenu";

/**
 * Fixed top bar: mobile menu trigger + brand + breadcrumb trail + account menu.
 *
 * Marka `lg` altında BURADA görünür: kenar çubuğu o boyutta çekmeceye indiği
 * için logo da onunla birlikte kayboluyordu ve mobil başlıkta hiçbir marka
 * kalmıyordu. Mağaza başlığıyla aynı düzen: hamburger, hemen sağında logo.
 */
export function Topbar({ onOpenSidebar }: { onOpenSidebar: () => void }) {
  const t = useTranslations();
  return (
    <header className="fixed inset-x-0 top-0 z-navigation h-[var(--admin-topbar-h)] gap-3 border-b border-primary-600 bg-primary-500 px-4 shadow-sm lg:left-[var(--admin-sidebar-w)] flex items-center justify-between">
      <div className="flex min-w-0 items-center gap-2 sm:gap-3">
        <Button
          variant="nav"
          size="icon"
          onClick={onOpenSidebar}
          aria-label={t("admin.shared.topbar.openMenu")}
          className="h-9 w-9 rounded-md lg:hidden"
        >
          <Bars3Icon className="h-6 w-6" />
        </Button>

        <Link
          href="/dashboard"
          scroll={false}
          className="flex h-8 flex-shrink-0 items-center transition-opacity hover:opacity-90 lg:hidden"
        >
          <Image
            src="/tarodan-logo-transparent.png"
            alt="Tarodan Logo"
            width={120}
            height={38}
            className="object-contain max-h-8 w-auto"
            priority
          />
        </Link>

        <div className="min-w-0">
          <Breadcrumbs />
        </div>
      </div>

      <div className="flex min-w-0 shrink-0 items-center gap-3">
        <AdminProfileMenu />
      </div>
    </header>
  );
}
