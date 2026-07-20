import Link from "next/link";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { SectionCard } from "@/components/detail/SectionCard";
import { type TopSeller } from "../_lib/types";

/**
 * Compact leaderboard of the top-viewed sellers (#300). Ranks by tracked
 * storefront views (`User.storeViewCount`); the row surfaces avatar + name,
 * product count, and active listings for a quick health check.
 */
export function TopSellersWidget({ sellers }: { sellers: TopSeller[] }) {
  const t = useTranslations();
  return (
    <SectionCard
      title={t("admin.dashboard.topSellers.title")}
      actions={
        <Link
          href="/accounts/users"
          className="text-sm text-primary-600 hover:underline"
        >
          {t("common.seeAll")} →
        </Link>
      }
    >
      <div className="divide-y divide-border">
        {sellers.length > 0 ? (
          sellers.map((s) => (
            <Link
              key={s.id}
              href={`/accounts/users/${s.id}`}
              className="flex items-center gap-3 py-3 first:pt-0 last:pb-0 hover:bg-surface-alt/60"
            >
              <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-full bg-primary-100">
                {s.avatarUrl ? (
                  <Image
                    src={s.avatarUrl}
                    alt=""
                    fill
                    sizes="40px"
                    unoptimized
                    className="object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-sm font-medium text-primary-600">
                    {s.displayName?.charAt(0) || "?"}
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-heading">
                  {s.displayName}
                </p>
                <p className="truncate text-xs text-muted">
                  {s.productCount.toLocaleString("tr-TR")}{" "}
                  {t(
                    "admin.dashboard.topSellers.columns.products",
                  ).toLowerCase()}
                  {" · "}
                  {s.activeListings.toLocaleString("tr-TR")}{" "}
                  {t(
                    "admin.dashboard.topSellers.columns.activeListings",
                  ).toLowerCase()}
                </p>
              </div>
              <span className="whitespace-nowrap text-sm font-semibold text-heading tabular-nums">
                {s.storeViewCount.toLocaleString("tr-TR")}
              </span>
            </Link>
          ))
        ) : (
          <div className="py-8 text-center text-muted">
            {t("admin.dashboard.topSellers.empty")}
          </div>
        )}
      </div>
    </SectionCard>
  );
}
