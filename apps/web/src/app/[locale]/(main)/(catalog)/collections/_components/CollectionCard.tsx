/** @format */

"use client";

import type { ReactNode } from "react";
import { Link } from "@/i18n/navigation";
import { EyeIcon } from "@heroicons/react/24/outline";
import { HeartIcon } from "@heroicons/react/24/solid";
import { useTranslations } from "next-intl";
import OptimizedImage from "@/components/OptimizedImage";
import CollectionVisibilityBadge from "./CollectionVisibilityBadge";

/** The fields the collection card needs — a superset of both the public list and
 *  the liked-collections shapes, so either can be passed straight in. */
export interface CollectionCardData {
  id: string;
  name: string;
  description?: string;
  coverImageUrl?: string;
  isPublic: boolean;
  itemCount?: number;
  viewCount?: number;
  likeCount?: number;
  userName?: string;
  user?: { displayName?: string } | null;
}

/**
 * The single collection card for the collections grid + the liked-collections
 * grid. Mirrors the marketplace `ProductCard` design language (square cover,
 * same frame/hover, same text scale and colored view/like icons) so both grids
 * read consistently. `footer` is a click-isolated slot below the card for
 * actions (e.g. unlike), exactly like ProductCard.
 */
export default function CollectionCard({
  collection,
  footer,
}: {
  collection: CollectionCardData;
  footer?: ReactNode;
}) {
  const t = useTranslations();
  const owner =
    collection.userName ||
    collection.user?.displayName ||
    t("collection.anonymous");

  return (
    <div className="relative group h-full flex flex-col">
      <Link
        href={`/collections/${collection.id}`}
        className="block h-full bg-surface-elevated rounded border border-border overflow-hidden hover:border-primary-300 hover:shadow-md transition-all"
      >
        <div className="relative aspect-square bg-surface-alt overflow-hidden">
          {collection.coverImageUrl ? (
            <OptimizedImage
              src={collection.coverImageUrl}
              alt={collection.name}
              fill
              className="object-cover group-hover:scale-[1.03] transition-transform duration-300"
              fallbackSrc="https://placehold.co/400x400/f3f4f6/9ca3af?text=Koleksiyon"
              logContext={{ collectionId: collection.id, page: "collections" }}
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-primary-50 to-primary-100 text-4xl">
              🚗
            </div>
          )}
          <div className="absolute top-1.5 right-1.5">
            <CollectionVisibilityBadge
              isPublic={collection.isPublic}
              label={
                collection.isPublic
                  ? t("collection.isPublic")
                  : t("collection.isPrivate")
              }
            />
          </div>
        </div>

        <div className="p-2.5 flex-1 flex flex-col">
          <h3 className="font-medium text-heading line-clamp-2 text-sm sm:text-md leading-tight group-hover:text-primary-600 transition-colors">
            {collection.name}
          </h3>
          {collection.description && (
            <p className="text-subtle text-xs mt-0.5 line-clamp-1">
              {collection.description}
            </p>
          )}

          <div className="mt-auto">
            <div className="pt-2 flex items-center justify-between text-xs sm:text-sm text-subtle">
              <span className="font-medium">
                {collection.itemCount ?? 0} {t("collection.items")}
              </span>
              <div className="flex items-center gap-3">
                {collection.viewCount !== undefined && (
                  <span className="flex items-center gap-1">
                    <EyeIcon className="w-4 h-4 text-primary-500" />
                    {collection.viewCount}
                  </span>
                )}
                {collection.likeCount !== undefined && (
                  <span className="flex items-center gap-1">
                    <HeartIcon className="w-4 h-4 text-danger-500" />
                    {collection.likeCount}
                  </span>
                )}
              </div>
            </div>
            <div className="mt-1.5 pt-1.5 border-t border-border-subtle">
              <span className="text-xs text-subtle">@{owner}</span>
            </div>
          </div>
        </div>
      </Link>
      {footer && <div className="mt-2">{footer}</div>}
    </div>
  );
}
