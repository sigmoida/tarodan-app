import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import type { Product } from "@/types/product";
import HomeSection from "./HomeSection";
import ProductRail from "./ProductRail";

export default async function OnSaleRail({ items }: { items: Product[] }) {
  const t = await getTranslations();
  const viewAllLabel = t("home.viewAll");

  return (
    <HomeSection
      title={t("product.onSale")}
      viewAllHref="/listings?discountOnly=true"
      viewAllLabel={viewAllLabel}
      badge={
        <span className="rounded-full bg-danger-100 px-2 py-0.5 text-xs font-semibold text-danger-700">
          {t("home.deals")}
        </span>
      }
    >
      <ProductRail
        items={items}
        isLoading={false}
        emptyState={
          <div className="py-10 text-center">
            <h3 className="font-semibold text-heading">
              {t("home.noProductsOnSale")}
            </h3>
            <p className="mt-1 text-sm text-muted">
              {t("home.checkBackLater")}
            </p>
            <Link
              href="/listings"
              className="mt-4 inline-flex rounded-md border border-border px-3 py-1.5 text-sm font-medium text-body"
            >
              {viewAllLabel}
            </Link>
          </div>
        }
      />
    </HomeSection>
  );
}
