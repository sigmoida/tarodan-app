import { getTranslations } from "next-intl/server";
import { TagIcon } from "@heroicons/react/24/outline";
import { EmptyState } from "@tarodan/ui/empty-state";
import { ButtonLink } from "@/components/ui/ButtonLink";
import type { HomeRailSeed } from "../lib/rails";
import HomeRailSection from "./HomeRailSection";

export default async function PopularRail({ items }: { items: HomeRailSeed }) {
  const t = await getTranslations();

  return (
    <HomeRailSection
      rail="popular"
      items={items}
      title={t("home.popularListings")}
      viewAllHref="/listings?sortBy=view_count_desc"
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
  );
}
