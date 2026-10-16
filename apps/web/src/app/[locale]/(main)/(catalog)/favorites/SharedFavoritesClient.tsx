/** @format */

"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import FavoritesGrid from "@/components/favorites/FavoritesGrid";
import FavoritesSkeleton from "@/components/favorites/FavoritesSkeleton";
import { useFavorites } from "@/hooks/useFavorites";

/**
 * Paylaşılan favori listesi: `/profile/favorites` ile aynı hook + grid'in
 * salt-okunur (`?ids=`) kolu; giriş gerektirmez. `ids` yoksa kişisel
 * favorilere (giriş kapılı) yönlenir.
 */
export default function SharedFavoritesClient() {
  const t = useTranslations();
  const router = useRouter();
  const { items, isLoading, isSharedView, handleCartToggle, isInCart } =
    useFavorites();

  useEffect(() => {
    if (!isSharedView) router.replace("/profile/favorites");
  }, [isSharedView, router]);

  if (!isSharedView) return null;

  return (
    <PageShell>
      <PageHeader
        title={t("favorites.sharedList")}
        description={`${items.length} ${t("favorites.itemsInFavorites")}`}
      />
      {isLoading ? (
        <FavoritesSkeleton />
      ) : (
        <FavoritesGrid
          items={items}
          isSharedView
          onRemove={() => undefined}
          onCartToggle={handleCartToggle}
          isInCart={isInCart}
        />
      )}
    </PageShell>
  );
}
