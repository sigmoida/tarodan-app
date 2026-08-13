/** @format */

"use client";

import { Link } from "@/i18n/navigation";
import { HeartIcon, EyeIcon, ShareIcon } from "@heroicons/react/24/outline";
import { HeartIcon as HeartIconSolid } from "@heroicons/react/24/solid";
import { Button, IconButton } from "@tarodan/ui";
import { ButtonLink } from "@/components/ui/ButtonLink";
import OptimizedImage from "@/components/OptimizedImage";
import UserAvatar from "@/components/UserAvatar";
import { useCollectionDetail } from "../_context/CollectionDetailContext";
import CollectionVisibilityBadge from "../../_components/CollectionVisibilityBadge";

/**
 * Koleksiyon başlığı — kapak, ad, sahip ve sayaçlar.
 *
 * Paylaş/beğen düğmeleri AKIŞTA durur (eskiden `absolute` idi): mutlak konumda
 * dar ekranda kapağın üstüne biniyor, geniş ekranda da başlıktan kopuk bir
 * köşede kalıyorlardı. Başlık satırının sağ ucunda durunca her genişlikte
 * başlıkla aynı hizada kalıyorlar.
 */
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
    <div className="rounded-lg border border-border bg-surface-elevated p-4 sm:p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:gap-5">
        {/* Kapak: mobilde küçük kare, geniş ekranda sabit sütun */}
        <div className="relative h-32 w-32 shrink-0 overflow-hidden rounded-lg bg-surface-alt sm:h-44 sm:w-44 md:h-48 md:w-48">
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

        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-2xl font-bold tracking-tight text-heading md:text-3xl">
                {collection.name}
              </h1>
              {collection.description && (
                <p className="mt-1.5 text-sm leading-relaxed text-muted">
                  {collection.description}
                </p>
              )}
            </div>

            <div className="flex shrink-0 items-center gap-1">
              <IconButton
                variant="ghost"
                onClick={handleShare}
                aria-label={t("collection.share")}
                title={t("collection.share")}
              >
                <ShareIcon className="h-5 w-5" />
              </IconButton>
              {!isOwner && (
                <IconButton
                  variant={isLiked ? "danger" : "ghost"}
                  onClick={handleLike}
                  aria-label={t("collection.likes")}
                  title={t("collection.likes")}
                >
                  {isLiked ? (
                    <HeartIconSolid className="h-5 w-5" />
                  ) : (
                    <HeartIcon className="h-5 w-5" />
                  )}
                </IconButton>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <Link
              href={`/seller/${collection.userId}`}
              className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-2.5 py-1 transition-colors hover:border-primary-300 hover:bg-surface-alt"
            >
              <UserAvatar
                displayName={collection.userName}
                size="xs"
                className="!h-6 !w-6"
              />
              <span className="text-sm font-medium text-body">
                {collection.userName}
              </span>
            </Link>

            <div className="flex flex-wrap items-center gap-4 text-sm text-subtle">
              <span className="flex items-center gap-1">
                <EyeIcon className="h-4 w-4 text-primary-500" />
                {collection.viewCount} {t("collection.views")}
              </span>
              <span className="flex items-center gap-1">
                <HeartIconSolid className="h-4 w-4 text-danger-500" />
                {collection.likeCount} {t("collection.likes")}
              </span>
            </div>
          </div>

          {isOwner && (
            <div className="mt-auto flex flex-wrap items-center gap-2 pt-1">
              <ButtonLink
                href={`/collections/${collection.id ?? collectionIdOrSlug}/edit`}
                variant="secondary"
                size="md"
              >
                {t("collection.edit")}
              </ButtonLink>
              {/* Empty-state CTA already offers "Add product"; only show here
                  when the collection has items to avoid a duplicate button. */}
              {sortedItems.length > 0 && (
                <Button
                  variant="primary"
                  size="md"
                  onClick={() => setShowAddModal(true)}
                >
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
