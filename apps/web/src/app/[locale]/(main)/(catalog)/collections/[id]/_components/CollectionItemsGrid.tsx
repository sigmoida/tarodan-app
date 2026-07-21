/** @format */

"use client";

import { TrashIcon } from "@heroicons/react/24/outline";
import { Badge, Button } from "@tarodan/ui";
import { ProductCard } from "@/components/ui";
import { useCollectionDetail } from "../_context/CollectionDetailContext";
import { itemToProduct, type CollectionItem } from "../_lib/types";

/** Badges + owner remove control layered over each card (click-isolated slot). */
function ItemOverlay({ item }: { item: CollectionItem }) {
  const { t, isOwner, handleRemoveItem } = useCollectionDetail();
  return (
    <div className="flex flex-col items-end gap-1">
      {item.isCustom && (
        <Badge variant="info" appearance="solid" size="sm">
          {t("collection.collection")}
        </Badge>
      )}
      {item.productStatus === "sold" && (
        <Badge variant="danger" appearance="solid" size="sm">
          {t("product.statusSold")}
        </Badge>
      )}
      {isOwner && (
        <Button
          variant="danger"
          size="sm"
          onClick={() => handleRemoveItem(item.id)}
          aria-label={t("collection.removeItem")}
          className="opacity-0 transition-opacity group-hover:opacity-100"
        >
          <TrashIcon className="h-3.5 w-3.5" />
        </Button>
      )}
    </div>
  );
}

export default function CollectionItemsGrid() {
  const { t, isOwner, sortedItems, setShowAddModal } = useCollectionDetail();

  if (sortedItems.length === 0) {
    return (
      <div className="rounded border border-border bg-surface-elevated py-20 text-center">
        <p className="mb-4 text-base text-muted">
          {t("collection.noProductsYet")}
        </p>
        {isOwner && (
          <Button
            variant="primary"
            size="md"
            onClick={() => setShowAddModal(true)}
          >
            {t("collection.addProduct")}
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
      {sortedItems.map((item, index) => (
        <ProductCard
          key={item.id}
          product={itemToProduct(item)}
          index={index}
          showMeta={false}
          href={item.productId ? undefined : null}
          overlay={<ItemOverlay item={item} />}
        />
      ))}
    </div>
  );
}
