/** @format */

"use client";

import { useTranslations } from "next-intl";
import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { useRequireAuth } from "../../_hooks/useRequireAuth";
import { useFavorites } from "./_hooks/useFavorites";
import FavoritesGrid from "./_components/FavoritesGrid";
import FavoriteTileSkeleton from "./_components/FavoriteTileSkeleton";
import ShareFavoritesButton from "./_components/ShareFavoritesButton";

function FavoritesSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
      {[...Array(8)].map((_, i) => (
        <FavoriteTileSkeleton key={i} />
      ))}
    </div>
  );
}

export default function FavoritesPage() {
  const t = useTranslations();
  const { ready } = useRequireAuth();

  const {
    items,
    pendingCount,
    isLoading,
    isSharedView,
    handleRemove,
    handleCartToggle,
    isInCart,
    isPending,
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
        // Yükleniyor kartları da sayılır: header rozetiyle aynı sayı.
        description={`${items.length + pendingCount} ${t("favorites.itemsInFavorites")}`}
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
          pendingCount={pendingCount}
          isSharedView={isSharedView}
          onRemove={handleRemove}
          onCartToggle={handleCartToggle}
          isInCart={isInCart}
          isPending={isPending}
        />
      )}
    </PageShell>
  );
}
