/** @format */

"use client";

import {
  TrashIcon,
  ShoppingCartIcon,
} from "@heroicons/react/24/outline";
import { Button, IconButton } from "@tarodan/ui";
import { ButtonLink } from "@/components/ui/ButtonLink";
import { EmptyStateCard } from "@/components/feedback/EmptyStateCard";
import { ProductCard } from "@/components/ui";
import { useTranslation } from "@/i18n";
import { wishlistItemToProduct, type WishlistItem } from "../_lib/types";

export default function FavoritesGrid({
  items,
  isSharedView,
  onRemove,
  onAddToCart,
}: {
  items: WishlistItem[];
  isSharedView: boolean;
  onRemove: (productId: string) => void;
  onAddToCart: (item: WishlistItem) => void;
}) {
  const { t, locale } = useTranslation();

  if (items.length === 0) {
    return (
      <EmptyStateCard
        title={t("favorites.empty")}
        description={
          locale === "en"
            ? "Add the products you like to your favorites and keep track of them from here."
            : "Beğendiğin ürünleri favorilerine ekle, buradan kolayca takip et."
        }
        action={
          <ButtonLink href="/listings">{t("favorites.browseProducts")}</ButtonLink>
        }
      />
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
      {items.map((item, index) => (
        <ProductCard
          key={item.id || index}
          product={wishlistItemToProduct(item)}
          index={index}
          showMeta={false}
          overlay={
            !isSharedView ? (
              <IconButton
                variant="secondary"
                onClick={() => onRemove(item.productId)}
                className="rounded-full bg-surface-elevated shadow-md hover:bg-danger-50"
                title={t("favorites.removeFromFavorites")}
                aria-label={t("favorites.removeFromFavorites")}
              >
                <TrashIcon className="h-4 w-4 text-danger-500 sm:h-5 sm:w-5" />
              </IconButton>
            ) : undefined
          }
          footer={
            <Button
              onClick={() => onAddToCart(item)}
              className="flex w-full gap-1.5 py-1.5 text-xs sm:gap-2 sm:py-2 sm:text-sm"
            >
              <ShoppingCartIcon className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              {t("product.addToCart")}
            </Button>
          }
        />
      ))}
    </div>
  );
}
