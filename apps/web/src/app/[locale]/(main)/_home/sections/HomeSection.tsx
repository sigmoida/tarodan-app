/** @format */

import type { ReactNode } from "react";
import { Link } from "@/i18n/navigation";
import { ChevronRightIcon } from "@heroicons/react/24/outline";
import SectionCard from "@/components/ui/SectionCard";
import { getTranslations } from "next-intl/server";

/**
 * The home-page section wrapper: the standard `py-4 px-4` rhythm around a shared
 * `SectionCard`. Sections supply their header text and content; the optional
 * "view all" link is mapped onto SectionCard's generic `action` slot.
 */
export default async function HomeSection({
  title,
  viewAllHref,
  viewAllLabel,
  badge,
  children,
}: {
  title: string;
  viewAllHref?: string;
  viewAllLabel?: string;
  badge?: ReactNode;
  children: ReactNode;
}) {
  const t = await getTranslations();
  return (
    <section>
      <SectionCard
        title={title}
        badge={badge}
        action={
          viewAllHref ? (
            <Link
              href={viewAllHref}
              className="inline-flex items-center gap-1 rounded-md border border-border bg-surface-elevated px-3 py-1.5 text-sm font-medium text-body transition-colors hover:bg-surface"
            >
              {viewAllLabel ?? t("page.sections.homesection.tumunuGor")}
              <ChevronRightIcon className="w-4 h-4" />
            </Link>
          ) : undefined
        }
      >
        {children}
      </SectionCard>
    </section>
  );
}
