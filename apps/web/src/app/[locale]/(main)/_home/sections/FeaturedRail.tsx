import { getTranslations } from "next-intl/server";
import type { Product } from "@/types/product";
import HomeSection from "./HomeSection";
import FeaturedRailClient from "./FeaturedRailClient";

export default async function FeaturedRail({ items }: { items: Product[] }) {
  const t = await getTranslations();
  if (items.length === 0) return null;

  return (
    <HomeSection
      title={t("home.featuredRailTitle")}
      viewAllHref="/listings"
      viewAllLabel={t("home.viewAll")}
    >
      <FeaturedRailClient
        initialItems={items}
        sponsoredLabel={t("product.sponsored")}
        tradeLabel={t("faq.trade")}
        outOfStockLabel={t("product.stockFinished")}
      />
    </HomeSection>
  );
}
