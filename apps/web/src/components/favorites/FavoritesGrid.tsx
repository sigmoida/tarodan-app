/** @format */

"use client";

import { TrashIcon, HeartIcon } from "@heroicons/react/24/outline";
import { IconButton } from "@tarodan/ui";
import { ButtonLink } from "@/components/ui/ButtonLink";
import { EmptyState } from "@/components/ui";
import { ProductCard } from "@/components/ui";
import ProductCardCartButton from "@/components/ui/ProductCardCartButton";
import { useProductCardAction } from "@/components/ui/ProductCardAction";
import { toProductCardListing } from "@/lib/productCardListing";
import { useTranslations } from "next-intl";
import { FAVORITE_BUSY_CLASS, favoriteBusyProps } from "@/lib/favorite-busy";
import { wishlistItemToProduct, type WishlistItem } from "./types";
import FavoriteTileSkeleton from "./FavoriteTileSkeleton";

/**
 * The footer follows the same card rule as every grid (`productCardAction`):
 * the cart toggle only for an active, in-stock listing that is not the
 * viewer's own; otherwise nothing (no boost action in Favorites).
 */
function FavoriteFooter({ item }: { item: WishlistItem }) {
  const { action } = useProductCardAction(
    toProductCardListing(wishlistItemToProduct(item)),
  );
  if (action.kind !== "add_to_cart") return null;
  return (
    <ProductCardCartButton
      productId={item.productId}
      title={item.productTitle}
      presentation="full"
    />
  );
}

export default function FavoritesGrid({
  items,
  pendingCount,
  isSharedView,
  onRemove,
  isPending,
}: {
  items: WishlistItem[];
  /** Optimistic adds whose real row has not arrived yet: loading tiles. */
  pendingCount: number;
  isSharedView: boolean;
  onRemove: (productId: string) => void;
  /** A favorite request for this product is in flight (remove button busy). */
  isPending: (productId: string) => boolean;
}) {
  const t = useTranslations();

  if (items.length === 0 && pendingCount === 0) {
    return (
      <EmptyState
        icon={<HeartIcon className="h-7 w-7" />}
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
      {/* Optimistic rows are prepended, so their tiles come first too. */}
      {Array.from({ length: pendingCount }, (_, i) => (
        <FavoriteTileSkeleton key={`pending-${i}`} />
      ))}
      {items.map((item, index) => (
        <ProductCard
          key={item.id || index}
          product={wishlistItemToProduct(item)}
          index={index}
          showMeta={false}
          // The card has its own remove control: no second heart.
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
          // The shared cart toggle, full width with its text (the footer
          // replaces the card's own price-row action).
          footer={<FavoriteFooter item={item} />}
        />
      ))}
    </div>
  );
}
