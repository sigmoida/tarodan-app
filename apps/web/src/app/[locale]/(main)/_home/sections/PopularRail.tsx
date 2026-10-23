import { getTranslations } from "next-intl/server";
import { TagIcon } from "@heroicons/react/24/outline";
import { EmptyState } from "@tarodan/ui";
import { ButtonLink } from "@/components/ui/ButtonLink";
import type { Product } from "@/types/product";
import HomeSection from "./HomeSection";
import ProductRail from "./ProductRail";

export default async function PopularRail({ items }: { items: Product[] }) {
  const t = await getTranslations();

  return (
    <HomeSection
      title={t("home.popularListings")}
      viewAllHref="/listings?sortBy=view_count_desc"
      viewAllLabel={t("home.viewAll")}
    >
      <ProductRail
        items={items}
        isLoading={false}
        emptyState={
          <EmptyState
            size="compact"
            icon={<TagIcon className="h-6 w-6" />}
            title={t("product.noListings")}
            description={t("home.beTheFirst")}
            action={
              <ButtonLink href="/listings/new" variant="outline">
                {t("product.createListing")}
              </ButtonLink>
            }
          />
        }
      />
    </HomeSection>
  );
}
