/** @format */

"use client";

import { useTranslations } from "next-intl";
import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { useRequireAuth } from "../../_hooks/useRequireAuth";
import { useFavorites } from "@/hooks/useFavorites";
import FavoritesGrid from "@/components/favorites/FavoritesGrid";
import FavoritesSkeleton from "@/components/favorites/FavoritesSkeleton";
import ShareFavoritesButton from "./_components/ShareFavoritesButton";

export default function FavoritesPage() {
  const t = useTranslations();
  const { ready } = useRequireAuth();

  const {
    items,
    isLoading,
    isSharedView,
    handleRemove,
    handleCartToggle,
    isInCart,
  } = useFavorites();

  // Private favorites require auth; a shared (?ids=) view is public.
  if (!isSharedView && !ready) {
    return (
      <PageShell className="flex items-center justify-center">
        <p className="animate-pulse text-sm text-muted">
          {t("common.loading")}
        </p>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <PageHeader
        title={
          isSharedView ? t("favorites.sharedList") : t("favorites.myFavorites")
        }
        description={`${items.length} ${t("favorites.itemsInFavorites")}`}
        actions={
          !isSharedView && items.length > 0 ? (
            <ShareFavoritesButton productIds={items.map((i) => i.productId)} />
          ) : undefined
        }
      />

      {isLoading ? (
        <FavoritesSkeleton />
      ) : (
        <FavoritesGrid
          items={items}
          isSharedView={isSharedView}
          onRemove={handleRemove}
          onCartToggle={handleCartToggle}
          isInCart={isInCart}
        />
      )}
    </PageShell>
  );
}
