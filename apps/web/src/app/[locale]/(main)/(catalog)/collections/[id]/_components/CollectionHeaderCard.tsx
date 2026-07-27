/** @format */

"use client";

import { Link } from "@/i18n/navigation";
import {
  HeartIcon,
  EyeIcon,
  PlusIcon,
  ShareIcon,
} from "@heroicons/react/24/outline";
import { HeartIcon as HeartIconSolid } from "@heroicons/react/24/solid";
import { Button } from "@tarodan/ui";
import OptimizedImage from "@/components/OptimizedImage";
import { useCollectionDetail } from "../_context/CollectionDetailContext";
import CollectionVisibilityBadge from "../../_components/CollectionVisibilityBadge";

export default function CollectionHeaderCard() {
  const {
    t,
    collection,
    collectionIdOrSlug,
    isOwner,
    isLiked,
    sortedItems,
    handleShare,
    handleLike,
    setShowAddModal,
  } = useCollectionDetail();

  if (!collection) return null;

  return (
    <div className="relative rounded border border-border bg-surface-elevated p-5">
      <div className="absolute right-4 top-4 flex items-center gap-2">
        <Button
          variant="secondary"
          onClick={handleShare}
          title={t("collection.share")}
          className="rounded bg-surface p-2 text-muted transition-colors hover:bg-surface-alt"
        >
          <ShareIcon className="h-5 w-5" />
        </Button>
        {!isOwner && (
          <Button
            variant="secondary"
            onClick={handleLike}
            className={`rounded p-2 transition-colors ${
              isLiked
                ? "bg-danger-50 text-danger-500 hover:bg-danger-100"
                : "bg-surface text-muted hover:bg-surface-alt"
            }`}
          >
            {isLiked ? (
              <HeartIconSolid className="h-5 w-5" />
            ) : (
              <HeartIcon className="h-5 w-5" />
            )}
          </Button>
        )}
      </div>

      <div className="flex flex-col gap-5 md:flex-row">
        <div className="flex-shrink-0">
          <div className="relative h-40 w-40 overflow-hidden rounded bg-surface-alt md:h-48 md:w-48">
            {collection.coverImageUrl ? (
              <OptimizedImage
                src={collection.coverImageUrl}
                alt={collection.name}
                fill
                className="object-cover"
                fallbackSrc="https://placehold.co/400x400/f3f4f6/9ca3af?text=Koleksiyon"
                logContext={{
                  collectionId: collection.id,
                  page: "collection-detail-cover",
                }}
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
        </div>

        <div className="flex flex-1 flex-col justify-between">
          <div>
            <h1 className="mb-2 flex items-center gap-2 text-2xl font-bold text-heading md:text-3xl">
              <span className="h-7 w-1 flex-shrink-0 rounded-sm bg-primary-500" />
              {collection.name}
            </h1>
            {collection.description && (
              <p className="mb-3 text-sm leading-relaxed text-muted">
                {collection.description}
              </p>
            )}
            <div className="flex flex-wrap items-center gap-4 text-sm text-subtle">
              <span className="font-medium text-muted">
                @{collection.userName}
              </span>
              <span className="flex items-center gap-1">
                <EyeIcon className="h-4 w-4 text-primary-500" />
                {collection.viewCount} {t("collection.views")}
              </span>
              <span className="flex items-center gap-1">
                <HeartIconSolid className="h-4 w-4 text-danger-500" />
                {collection.likeCount} {t("collection.likes")}
              </span>
              <span className="font-medium">
                {collection.itemCount} {t("collection.products")}
              </span>
            </div>
          </div>

          {isOwner && (
            <div className="mt-4 flex items-center gap-2">
              <Link
                href={`/collections/${collection.id ?? collectionIdOrSlug}/edit`}
                className="rounded bg-surface-alt px-4 py-2 text-sm font-medium text-body transition-colors hover:bg-border-subtle"
              >
                {t("collection.edit")}
              </Link>
              {/* Empty-state CTA already offers "Add product"; only show here
							    when the collection has items to avoid a duplicate button. */}
              {sortedItems.length > 0 && (
                <Button
                  variant="primary"
                  size="md"
                  onClick={() => setShowAddModal(true)}
                  className="flex items-center gap-1.5"
                >
                  <PlusIcon className="h-4 w-4" />
                  {t("collection.addProduct")}
                </Button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
