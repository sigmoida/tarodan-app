import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import type { Product } from "@/types/product";
import HomeSection from "./HomeSection";
import ProductRail from "./ProductRail";

export default async function PopularRail({ items }: { items: Product[] }) {
  const t = await getTranslations();

  return (
    <HomeSection
      title={t("home.popularListings")}
      viewAllHref="/listings?sortBy=view_count_desc"
      viewAllLabel={t("home.viewAll")}
    >
      <ProductRail
        items={items}
        isLoading={false}
        emptyState={
          <div className="py-10 text-center">
            <h3 className="font-semibold text-heading">
              {t("product.noListings")}
            </h3>
            <p className="mt-1 text-sm text-muted">{t("home.beTheFirst")}</p>
            <Link
              href="/listings/new"
              className="mt-4 inline-flex rounded-md border border-border px-3 py-1.5 text-sm font-medium text-body"
            >
              {t("product.createListing")}
            </Link>
          </div>
        }
      />
    </HomeSection>
  );
}
