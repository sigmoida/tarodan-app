"use client";

import { useTranslations } from "next-intl";
import { useHome } from "../context/HomeDataContext";
import HomeSection from "./HomeSection";
import ProductRail from "./ProductRail";

export default function FeaturedRail() {
  const t = useTranslations();
  const { featured, isLoadingFeatured } = useHome();

  if (!(isLoadingFeatured || featured.length > 0)) return null;

  return (
    <HomeSection title={t("home.featuredRailTitle")}>
      <ProductRail items={featured} isLoading={isLoadingFeatured} />
    </HomeSection>
  );
}
