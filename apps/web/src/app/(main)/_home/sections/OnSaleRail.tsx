"use client";

import { ButtonLink, EmptyState, ProductBadge } from "@/components/ui";
import { useTranslations } from "next-intl";
import { useHome } from "../context/HomeDataContext";
import HomeSection from "./HomeSection";
import ProductRail from "./ProductRail";

export default function OnSaleRail() {
  const t = useTranslations();
  const { discounted, isLoadingDiscounted } = useHome();
  const viewAllLabel = t("home.viewAll");

  return (
    <HomeSection
      title={t("product.onSale")}
      viewAllHref="/listings?discountOnly=true"
      viewAllLabel={viewAllLabel}
      badge={<ProductBadge variant="sale">{t("home.deals")}</ProductBadge>}
    >
      <ProductRail
        items={discounted}
        isLoading={isLoadingDiscounted}
        emptyState={
          <EmptyState
            title={t("home.noProductsOnSale")}
            description={t("home.checkBackLater")}
            action={
              <ButtonLink variant="secondary" size="sm" href="/listings">
                {viewAllLabel}
              </ButtonLink>
            }
          />
        }
      />
    </HomeSection>
  );
}
