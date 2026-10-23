import { getTranslations } from "next-intl/server";
import type { HomeRailSeed } from "../lib/rails";
import HomeRailSection from "./HomeRailSection";

/**
 * Like its sibling rails and the mobile on-sale rail, this rail has no empty
 * state: an empty catalog stacked two near-identical empty cards ("nothing on
 * sale" + "no listings"), and PopularRail already invites the first listing.
 */
export default async function OnSaleRail({ items }: { items: HomeRailSeed }) {
  const t = await getTranslations();
  return (
    <HomeRailSection
      rail="discounted"
      items={items}
      title={t("product.onSale")}
      viewAllHref="/listings?discountOnly=true"
    />
  );
}
