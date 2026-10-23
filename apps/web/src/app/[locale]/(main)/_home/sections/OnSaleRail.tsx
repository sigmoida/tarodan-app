import { getTranslations } from "next-intl/server";
import type { Product } from "@/types/product";
import HomeSection from "./HomeSection";
import ProductRail from "./ProductRail";

export default async function OnSaleRail({ items }: { items: Product[] }) {
  // Like its sibling rails (FeaturedRail, TradeRail, Spotlights) and the
  // mobile on-sale rail, the section is not drawn when there is nothing to
  // show, so it has no empty state: an empty catalog stacked two near-identical
  // empty cards ("nothing on sale" + "no listings"), and PopularRail already
  // invites the first listing.
  if (items.length === 0) return null;

  const t = await getTranslations();

  return (
    <HomeSection
      title={t("product.onSale")}
      viewAllHref="/listings?discountOnly=true"
      viewAllLabel={t("home.viewAll")}
    >
      <ProductRail items={items} isLoading={false} />
    </HomeSection>
  );
}
