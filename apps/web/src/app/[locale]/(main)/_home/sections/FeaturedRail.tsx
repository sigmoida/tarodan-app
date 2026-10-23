import { getTranslations } from "next-intl/server";
import { productBadgeLabels } from "@/lib/productCardBadges";
import type { HomeRailSeed } from "../lib/rails";
import FeaturedRailClient from "./FeaturedRailClient";
import HomeRailSection from "./HomeRailSection";

export default async function FeaturedRail({ items }: { items: HomeRailSeed }) {
  const t = await getTranslations();

  return (
    <HomeRailSection
      rail="featured"
      items={items}
      title={t("home.featuredRailTitle")}
      viewAllHref="/listings"
      body={
        <FeaturedRailClient
          initialItems={items}
          badgeLabels={productBadgeLabels(t)}
          outOfStockLabel={t("product.stockFinished")}
        />
      }
    />
  );
}
