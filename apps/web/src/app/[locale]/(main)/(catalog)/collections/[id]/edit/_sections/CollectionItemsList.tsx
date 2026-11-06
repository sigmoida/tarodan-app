/** @format */

"use client";

import { CubeIcon, TrashIcon } from "@heroicons/react/24/outline";
import { IconButton } from "@tarodan/ui";
import { useTranslations } from "next-intl";
import OptimizedImage, { isValidImageSrc } from "@/components/OptimizedImage";
import { SectionCard } from "@/components/ui";
import { itemDisplayTitle, type CollectionItem } from "../../_lib/types";

interface CollectionItemsListProps {
  /** Every item the API returned, hidden and deleted listings included. */
  items: CollectionItem[];
  onRemove: (itemId: string) => void;
  /** The item being removed, for its control's busy state. */
  removingId?: string;
}

/**
 * The owner's item list on the edit page: unlike the public detail it shows
 * every item, so a hidden or deleted listing can still be taken out of the
 * collection. No price is shown, only image and title.
 */
export default function CollectionItemsList({
  items,
  onRemove,
  removingId,
}: CollectionItemsListProps) {
  const t = useTranslations();
  if (items.length === 0) return null;

  return (
    <SectionCard title={`${t("collection.products")} (${items.length})`}>
      <ul className="divide-y divide-border">
        {items.map((item) => {
          const title = itemDisplayTitle(item, t("collection.untitledItem"));
          const image = item.customImageUrl || item.productImage;
          return (
            <li key={item.id} className="flex items-center gap-3 py-3">
              <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-md bg-surface-alt">
                {isValidImageSrc(image) ? (
                  <OptimizedImage
                    src={image as string}
                    alt={title}
                    fill
                    sizes="56px"
                    className="object-cover"
                  />
                ) : (
                  <CubeIcon className="m-4 h-6 w-6 text-muted" aria-hidden />
                )}
              </div>
              <p className="min-w-0 flex-1 truncate text-sm text-text">
                {title}
              </p>
              <IconButton
                variant="secondary"
                disabled={removingId === item.id}
                onClick={() => onRemove(item.id)}
                aria-label={`${t("collection.removeItem")}: ${title}`}
                title={t("collection.removeItem")}
              >
                <TrashIcon className="h-5 w-5 text-danger-500" />
              </IconButton>
            </li>
          );
        })}
      </ul>
    </SectionCard>
  );
}
