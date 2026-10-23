/** @format */

"use client";

import { FolderPlusIcon } from "@heroicons/react/24/outline";
import { useTranslations } from "next-intl";
import { Button } from "@tarodan/ui";
import { EmptyState } from "@/components/ui";
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
      <EmptyState
        icon={<FolderPlusIcon className="h-7 w-7" />}
        title={
          searchQuery
            ? `"${searchQuery}" ${t("common.noResults")}`
            : t("collection.noCollections")
        }
        description={t("collection.startBuildingToday")}
        action={
          searchQuery ? (
            <Button variant="secondary" onClick={() => setSearchQuery("")}>
              {t("common.clear")}
            </Button>
          ) : activeTab === "mine" ? (
            <Button variant="primary" onClick={() => setShowCreateModal(true)}>
              {t("collection.createCollection")}
            </Button>
          ) : undefined
        }
      />
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
