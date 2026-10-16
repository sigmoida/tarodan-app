/** @format */

"use client";

import { TrashIcon, ShoppingCartIcon } from "@heroicons/react/24/outline";
import { Button, IconButton } from "@tarodan/ui";
import { ButtonLink } from "@/components/ui/ButtonLink";
import { EmptyStateCard } from "@/components/ui";
import { ProductCard } from "@/components/ui";
import { useTranslations } from "next-intl";
import { FAVORITE_BUSY_CLASS, favoriteBusyProps } from "@/lib/favorite-busy";
import { wishlistItemToProduct, type WishlistItem } from "../_lib/types";
import FavoriteTileSkeleton from "./FavoriteTileSkeleton";

export default function FavoritesGrid({
  items,
  pendingCount,
  isSharedView,
  onRemove,
  onCartToggle,
  isInCart,
  isPending,
}: {
  items: WishlistItem[];
  /** Gerçek satırı henüz gelmemiş iyimser eklemeler — yükleniyor kartı. */
  pendingCount: number;
  isSharedView: boolean;
  onRemove: (productId: string) => void;
  onCartToggle: (item: WishlistItem) => void;
  isInCart: (productId: string) => boolean;
  /** Bu ürün için favori isteği sürüyor mu? (kaldır düğmesi meşgul) */
  isPending: (productId: string) => boolean;
}) {
  const t = useTranslations();

  if (items.length === 0 && pendingCount === 0) {
    return (
      <EmptyStateCard
        title={t("favorites.empty")}
        description={t("favorites.emptyDesc")}
        action={
          <ButtonLink href="/listings">
            {t("favorites.browseProducts")}
          </ButtonLink>
        }
      />
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
      {/* İyimser satırlar listenin başına eklenir; kartları da başta durur. */}
      {Array.from({ length: pendingCount }, (_, i) => (
        <FavoriteTileSkeleton key={`pending-${i}`} />
      ))}
      {items.map((item, index) => {
        const inCart = isInCart(item.productId);
        return (
          <ProductCard
            key={item.id || index}
            product={wishlistItemToProduct(item)}
            index={index}
            showMeta={false}
            // Kartın kendi "kaldır" düğmesi var — ikinci bir kalp çizilmez.
            showFavorite={false}
            overlay={
              !isSharedView ? (
                <IconButton
                  variant="secondary"
                  onClick={() => onRemove(item.productId)}
                  {...favoriteBusyProps(isPending(item.productId))}
                  className={`rounded-full bg-surface-elevated shadow-md hover:bg-danger-50 ${FAVORITE_BUSY_CLASS}`}
                  title={t("favorites.removeFromFavorites")}
                  aria-label={t("favorites.removeFromFavorites")}
                >
                  <TrashIcon className="h-4 w-4 text-danger-500 sm:h-5 sm:w-5" />
                </IconButton>
              ) : undefined
            }
            footer={
              <Button
                variant={inCart ? "danger" : "primary"}
                onClick={() => onCartToggle(item)}
                className="flex w-full gap-1.5 py-1.5 text-xs sm:gap-2 sm:py-2 sm:text-sm"
              >
                <ShoppingCartIcon className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                {inCart ? t("product.removeFromCart") : t("product.addToCart")}
              </Button>
            }
          />
        );
      })}
    </div>
  );
}
