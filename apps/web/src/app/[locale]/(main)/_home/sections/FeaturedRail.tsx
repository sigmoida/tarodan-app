import { getTranslations } from "next-intl/server";
import type { Product } from "@/types/product";
import HomeSection from "./HomeSection";
import ProductRail from "./ProductRail";

export default async function FeaturedRail({ items }: { items: Product[] }) {
  const t = await getTranslations();
  if (items.length === 0) return null;

  return (
    <HomeSection title={t("home.featuredRailTitle")}>
      <ProductRail items={items} isLoading={false} />
    </HomeSection>
  );
}
