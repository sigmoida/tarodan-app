/** @format */

"use client";

import { FolderPlusIcon } from "@heroicons/react/24/outline";
import { useTranslations } from "next-intl";
import { Button } from "@tarodan/ui";
import { useCollections } from "../_context/CollectionsContext";
import CollectionCard from "./CollectionCard";

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
            className="bg-surface-elevated rounded border border-border-subtle overflow-hidden animate-pulse"
          >
            <div className="aspect-square bg-border-subtle" />
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
      {displayedCollections.map((collection) => (
        <CollectionCard key={collection.id} collection={collection} />
      ))}
    </div>
  );
}
