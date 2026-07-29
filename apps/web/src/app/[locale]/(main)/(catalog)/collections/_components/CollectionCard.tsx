/** @format */

"use client";

import type { ReactNode } from "react";
import { Link } from "@/i18n/navigation";
import { EyeIcon } from "@heroicons/react/24/outline";
import { HeartIcon } from "@heroicons/react/24/solid";
import { useTranslations } from "next-intl";
import OptimizedImage from "@/components/OptimizedImage";
import CollectionVisibilityBadge from "./CollectionVisibilityBadge";

/** The fields the collection card needs — a superset of the public list, the
 *  liked-collections and the my-collections shapes, so any can be passed in. */
export interface CollectionCardData {
  id: string;
  name: string;
  description?: string;
  coverImageUrl?: string;
  isPublic: boolean;
  itemCount?: number;
  viewCount?: number;
  likeCount?: number;
  userId?: string;
  userName?: string;
  user?: { id?: string; displayName?: string } | null;
}

/**
 * The single collection card for every collection grid (public collections,
 * liked collections, my collections). Mirrors the marketplace `ProductCard`
 * design language (square cover, same frame/hover, same text scale, colored
 * view/like icons). The owner handle is a click-isolated link to the owner's
 * public profile — a sibling of the card link, never nested. `footer` is a
 * click-isolated slot inside the card frame for actions (e.g. unlike).
 */
export default function CollectionCard({
  collection,
  footer,
}: {
  collection: CollectionCardData;
  footer?: ReactNode;
}) {
  const t = useTranslations();
  const ownerId = collection.user?.id ?? collection.userId;
  const ownerName =
    collection.userName ||
    collection.user?.displayName ||
    t("collection.anonymous");

  return (
    <div className="relative group flex h-full flex-col overflow-hidden rounded border border-border bg-surface-elevated transition-all hover:border-primary-300 hover:shadow-md">
      <Link
        href={`/collections/${collection.id}`}
        className="flex flex-1 flex-col"
      >
        <div className="relative aspect-square overflow-hidden bg-surface-alt">
          {collection.coverImageUrl ? (
            <OptimizedImage
              src={collection.coverImageUrl}
              alt={collection.name}
              fill
              className="object-cover transition-transform duration-300 group-hover:scale-[1.03]"
              fallbackSrc="https://placehold.co/400x400/f3f4f6/9ca3af?text=Koleksiyon"
              logContext={{ collectionId: collection.id, page: "collections" }}
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-primary-50 to-primary-100 text-4xl">
              🚗
            </div>
          )}
          <div className="absolute right-1.5 top-1.5">
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

        <div className="flex flex-1 flex-col p-2.5">
          <h3 className="line-clamp-2 text-sm font-medium leading-tight text-heading transition-colors group-hover:text-primary-600 sm:text-md">
            {collection.name}
          </h3>
          {collection.description && (
            <p className="mt-0.5 line-clamp-1 text-xs text-subtle">
              {collection.description}
            </p>
          )}
          <div className="mt-auto flex items-center justify-between pt-2 text-xs text-subtle sm:text-sm">
            <span className="font-medium">
              {collection.itemCount ?? 0} {t("collection.items")}
            </span>
            <div className="flex items-center gap-3">
              {collection.viewCount !== undefined && (
                <span className="flex items-center gap-1">
                  <EyeIcon className="h-4 w-4 text-primary-500" />
                  {collection.viewCount}
                </span>
              )}
              {collection.likeCount !== undefined && (
                <span className="flex items-center gap-1">
                  <HeartIcon className="h-4 w-4 text-danger-500" />
                  {collection.likeCount}
                </span>
              )}
            </div>
          </div>
        </div>
      </Link>

      <div className="border-t border-border-subtle px-2.5 py-1.5">
        {ownerId ? (
          <Link
            href={`/seller/${ownerId}`}
            className="text-xs text-subtle transition-colors hover:text-primary-600"
          >
            @{ownerName}
          </Link>
        ) : (
          <span className="text-xs text-subtle">@{ownerName}</span>
        )}
      </div>

      {footer && <div className="px-2.5 pb-2.5">{footer}</div>}
    </div>
  );
}
