import Link from "next/link";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { ChevronRightIcon } from "@heroicons/react/24/outline";
import { Button, EmptyState } from "@tarodan/ui";
import { SectionCard } from "@/components/detail/SectionCard";
import { fmtTry } from "@/lib/format";
import { type TopProduct } from "../_lib/types";

/**
 * Compact leaderboard of the top-viewed products (#297). Renders as a list of
 * rows (thumbnail + title/seller · price · view count) rather than a
 * `DataTable`, so it sits well next to the sellers widget in the split layout.
 */
export function TopProductsWidget({ products }: { products: TopProduct[] }) {
  const t = useTranslations();
  return (
    <SectionCard
      title={t("admin.dashboard.topProducts.title")}
      actions={
        <Button asChild variant="ghost" size="sm">
          <Link href="/catalog/products">
            {t("common.seeAll")}
            <ChevronRightIcon className="ml-1 h-4 w-4" />
          </Link>
        </Button>
      }
    >
      <div className="space-y-0.5">
        {products.length > 0 ? (
          products.map((p) => (
            <Link
              key={p.id}
              href={`/catalog/products/${p.id}`}
              className="-mx-2 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg px-2 py-2.5 hover:bg-surface-alt"
            >
              <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-md bg-surface-alt">
                {p.thumbnail ? (
                  <Image
                    src={p.thumbnail}
                    alt=""
                    fill
                    sizes="40px"
                    unoptimized
                    className="object-cover"
                  />
                ) : null}
              </div>
              {/* min-w floor (not min-w-0) so this block stops shrinking once
                  it's cramped, forcing price/views to wrap to their own line
                  instead of squeezing the title to nothing. */}
              <div className="min-w-[110px] flex-1">
                <p className="truncate text-sm font-medium text-heading">
                  {p.title}
                </p>
                <p className="truncate text-xs text-muted">{p.sellerName}</p>
              </div>
              <span className="whitespace-nowrap text-sm font-semibold text-heading tabular-nums">
                {fmtTry(p.price)}
              </span>
              <span className="whitespace-nowrap text-xs text-muted tabular-nums">
                {p.viewCount.toLocaleString("tr-TR")}{" "}
                {t("admin.dashboard.topProducts.columns.views").toLowerCase()}
              </span>
            </Link>
          ))
        ) : (
          <EmptyState
            size="compact"
            title={t("admin.dashboard.topProducts.empty")}
          />
        )}
      </div>
    </SectionCard>
  );
}
