import { getTranslations } from "next-intl/server";
import { TagIcon } from "@heroicons/react/24/outline";
import { EmptyState } from "@tarodan/ui";
import { ButtonLink } from "@/components/ui/ButtonLink";
import type { Product } from "@/types/product";
import HomeSection from "./HomeSection";
import ProductRail from "./ProductRail";

export default async function OnSaleRail({ items }: { items: Product[] }) {
  // Kardeş raylarla (FeaturedRail, TradeRail, Spotlights) aynı davranış: gösterecek
  // bir şey yoksa bölüm hiç çizilmez. Boş katalogda anasayfa üst üste iki
  // neredeyse aynı boş kart gösteriyordu ("indirimde ürün yok" + "ilan yok");
  // ilan davetini PopularRail zaten yapıyor.
  if (items.length === 0) return null;

  const t = await getTranslations();
  const viewAllLabel = t("home.viewAll");

  return (
    <HomeSection
      title={t("product.onSale")}
      viewAllHref="/listings?discountOnly=true"
      viewAllLabel={viewAllLabel}
    >
      <ProductRail
        items={items}
        isLoading={false}
        emptyState={
          <EmptyState
            size="compact"
            icon={<TagIcon className="h-6 w-6" />}
            title={t("home.noProductsOnSale")}
            description={t("home.checkBackLater")}
            action={
              <ButtonLink href="/listings" variant="outline">
                {viewAllLabel}
              </ButtonLink>
            }
          />
        }
      />
    </HomeSection>
  );
}
