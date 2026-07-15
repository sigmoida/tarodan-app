"use client";

import { useTranslations } from "next-intl";
import { useHome } from "../context/HomeDataContext";
import HomeSection from "./HomeSection";
import ProductRail from "./ProductRail";

export default function TradeRail() {
  const t = useTranslations();
  const { trade, isLoadingTrade } = useHome();

  if (!(isLoadingTrade || trade.length > 0)) return null;

  return (
    <HomeSection
      title={t("nav.tradeShowcase")}
      viewAllHref="/takas"
      viewAllLabel={t("home.viewAll")}
    >
      <ProductRail items={trade} isLoading={isLoadingTrade} />
    </HomeSection>
  );
}
