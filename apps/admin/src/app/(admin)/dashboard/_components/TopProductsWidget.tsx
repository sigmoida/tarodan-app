import Link from "next/link";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { SectionCard } from "@/components/detail/SectionCard";
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
        <Link
          href="/catalog/products"
          className="text-sm text-primary-600 hover:underline"
        >
          {t("common.seeAll")} →
        </Link>
      }
    >
      <div className="divide-y divide-border">
        {products.length > 0 ? (
          products.map((p) => (
            <Link
              key={p.id}
              href={`/catalog/products/${p.id}`}
              className="flex items-center gap-3 py-3 first:pt-0 last:pb-0 hover:bg-surface-alt/60"
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
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-heading">
                  {p.title}
                </p>
                <p className="truncate text-xs text-muted">{p.sellerName}</p>
              </div>
              <span className="whitespace-nowrap text-sm font-semibold text-heading tabular-nums">
                ₺{p.price.toLocaleString("tr-TR")}
              </span>
              <span className="whitespace-nowrap text-xs text-muted tabular-nums">
                {p.viewCount.toLocaleString("tr-TR")}{" "}
                {t("admin.dashboard.topProducts.columns.views").toLowerCase()}
              </span>
            </Link>
          ))
        ) : (
          <div className="py-8 text-center text-muted">
            {t("admin.dashboard.topProducts.empty")}
          </div>
        )}
      </div>
    </SectionCard>
  );
}
