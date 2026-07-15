/** @format */

"use client";

import { Link } from "@/i18n/navigation";
import { motion } from "framer-motion";
import {
  FolderPlusIcon,
  EyeIcon,
  HeartIcon,
} from "@heroicons/react/24/outline";
import OptimizedImage from "@/components/OptimizedImage";
import { useTranslations } from "next-intl";
import { Button } from "@tarodan/ui";
import { useCollections } from "../_context/CollectionsContext";
import CollectionVisibilityBadge from "./CollectionVisibilityBadge";

export default function CollectionsGrid() {
  const t = useTranslations();
  const {
    loading,
    displayedCollections,
    searchQuery,
    setSearchQuery,
    activeTab,
    setShowCreateModal,
  } = useCollections();

  if (loading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
        {[...Array(12)].map((_, i) => (
          <div
            key={i}
            className="bg-surface-elevated rounded-lg border border-border-subtle overflow-hidden animate-pulse"
          >
            <div className="aspect-[4/3] bg-border-subtle" />
            <div className="p-3 space-y-2">
              <div className="h-3 bg-border-subtle rounded w-3/4" />
              <div className="h-3 bg-border-subtle rounded w-1/2" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (displayedCollections.length === 0) {
    return (
      <div className="text-center py-20 bg-surface-elevated rounded-lg border border-border">
        <div className="inline-flex items-center justify-center w-16 h-16 bg-surface rounded-lg mb-4">
          <FolderPlusIcon className="w-7 h-7 text-subtle" />
        </div>
        <p className="text-muted text-lg font-medium mb-1">
          {searchQuery
            ? `"${searchQuery}" ${t("common.noResults")}`
            : t("collection.noCollections")}
        </p>
        <p className="text-subtle text-sm mb-4">
          {t("collection.startBuildingToday")}
        </p>
        {searchQuery && (
          <Button
            variant="secondary"
            size="md"
            onClick={() => setSearchQuery("")}
          >
            {t("common.clear")}
          </Button>
        )}
        {activeTab === "mine" && !searchQuery && (
          <Button
            variant="primary"
            size="md"
            onClick={() => setShowCreateModal(true)}
          >
            {t("collection.createCollection")}
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
      {displayedCollections.map((collection, index) => (
        <div key={collection.id}>
          <Link
            href={`/collections/${collection.id}`}
            className="block bg-surface-elevated rounded-lg border border-border overflow-hidden hover:border-primary-300 hover:shadow-md transition-all group h-full"
          >
            <div className="aspect-[4/3] bg-surface-alt relative overflow-hidden">
              {collection.coverImageUrl ? (
                <OptimizedImage
                  src={collection.coverImageUrl}
                  alt={collection.name}
                  fill
                  className="object-cover group-hover:scale-[1.03] transition-transform duration-300"
                  fallbackSrc="https://placehold.co/400x300/f3f4f6/9ca3af?text=Koleksiyon"
                  logContext={{
                    collectionId: collection.id,
                    page: "collections",
                  }}
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
            <div className="p-2.5">
              <h3 className="font-medium text-heading text-sm line-clamp-1 group-hover:text-primary-600 transition-colors">
                {collection.name}
              </h3>
              {collection.description && (
                <p className="text-subtle text-2xs mt-0.5 line-clamp-1">
                  {collection.description}
                </p>
              )}
              <div className="flex items-center justify-between mt-2 text-2xs text-subtle">
                <span className="font-medium">
                  {collection.itemCount} {t("collection.items")}
                </span>
                <div className="flex items-center gap-2">
                  {collection.viewCount !== undefined && (
                    <span className="flex items-center gap-0.5">
                      <EyeIcon className="w-3 h-3" />
                      {collection.viewCount}
                    </span>
                  )}
                  {collection.likeCount !== undefined && (
                    <span className="flex items-center gap-0.5">
                      <HeartIcon className="w-3 h-3" />
                      {collection.likeCount}
                    </span>
                  )}
                </div>
              </div>
              <div className="mt-1.5 pt-1.5 border-t border-border-subtle">
                <span className="text-2xs text-subtle">
                  @
                  {collection.userName ||
                    collection.user?.displayName ||
                    "Kullanıcı"}
                </span>
              </div>
            </div>
          </Link>
        </div>
      ))}
    </div>
  );
}
