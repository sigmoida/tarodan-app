"use client";

import { ButtonLink, EmptyState } from "@/components/ui";
import { useTranslations } from "next-intl";
import { useHome } from "../context/HomeDataContext";
import HomeSection from "./HomeSection";
import ProductRail from "./ProductRail";

export default function PopularRail() {
  const t = useTranslations();
  const { bestSellers, isLoadingBestSellers } = useHome();

  return (
    <HomeSection
      title={t("home.popularListings")}
      viewAllHref="/listings?sortBy=view_count_desc"
      viewAllLabel={t("home.viewAll")}
    >
      <ProductRail
        items={bestSellers}
        isLoading={isLoadingBestSellers}
        emptyState={
          <EmptyState
            title={t("product.noListings")}
            description={t("home.beTheFirst")}
            action={
              <ButtonLink variant="secondary" size="sm" href="/listings/new">
                {t("product.createListing")}
              </ButtonLink>
            }
          />
        }
      />
    </HomeSection>
  );
}
