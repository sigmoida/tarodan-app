"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { ChevronRightIcon } from "@heroicons/react/24/outline";
import { breadcrumbsFor } from "@/lib/navigation";

/**
 * Parent → child trail for the current route, built from the nav config.
 * Rendered locally (not the shared @tarodan/ui Breadcrumb, which is also used by
 * the web app with dark-on-light colors) so it can use light text on the primary
 * top bar. Non-current crumbs are clickable; the last is the current page.
 */
export function Breadcrumbs() {
  const pathname = usePathname();
  const t = useTranslations();
  const crumbs = breadcrumbsFor(pathname, t);
  if (crumbs.length === 0) return null;

  const current = crumbs[crumbs.length - 1];

  return (
    <nav
      aria-label="Breadcrumb"
      className="flex min-w-0 items-center text-sm text-inverted"
    >
      {/* 640px altında tam patika yerine yalnızca güncel sayfa adı — konum
          bilgisi kaybolmasın diye, ama tam patikayı sığdıracak yer yok. */}
      <span className="truncate font-semibold sm:hidden">{current.label}</span>
      <ol className="hidden flex-wrap items-center gap-1 sm:flex">
        {crumbs.map((crumb, i) => {
          const isLast = i === crumbs.length - 1;
          return (
            <li key={i} className="flex items-center gap-1">
              {isLast || !crumb.href ? (
                <span
                  aria-current={isLast ? "page" : undefined}
                  className={isLast ? "font-semibold" : "text-inverted/80"}
                >
                  {crumb.label}
                </span>
              ) : (
                <Link
                  href={crumb.href}
                  scroll={false}
                  className="text-inverted/80 transition-colors hover:text-inverted"
                >
                  {crumb.label}
                </Link>
              )}
              {!isLast && (
                <ChevronRightIcon
                  className="h-3.5 w-3.5 text-inverted/50"
                  aria-hidden
                />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
