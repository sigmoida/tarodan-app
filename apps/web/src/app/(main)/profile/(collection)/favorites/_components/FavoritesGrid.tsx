/** @format */

"use client";

import Link from "next/link";
import {
  HeartIcon,
  TrashIcon,
  ShoppingCartIcon,
} from "@heroicons/react/24/outline";
import { Button, IconButton } from "@tarodan/ui";
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
  const { t } = useTranslation();

  if (items.length === 0) {
    return (
      <div className="rounded-xl bg-surface-elevated py-16 text-center">
        <HeartIcon className="mx-auto mb-4 h-16 w-16 text-border-strong" />
        <p className="mb-4 text-lg text-muted">{t("favorites.empty")}</p>
        <Link
          href="/listings"
          className="inline-block rounded-xl bg-primary-500 px-6 py-3 text-inverted hover:bg-primary-600"
        >
          {t("favorites.browseProducts")}
        </Link>
      </div>
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
