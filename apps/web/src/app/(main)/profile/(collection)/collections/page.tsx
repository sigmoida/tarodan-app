"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { FolderPlusIcon } from "@heroicons/react/24/outline";
import { Button } from "@tarodan/ui";
import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { useAuthStore } from "@/stores/authStore";
import { queryKeys } from "@/lib/query/keys";
import { useTranslation } from "@/i18n";
import CreateCollectionModal from "@/components/CreateCollectionModal";
import { EmptyStateCard } from "@/components/ui";
import { useMyCollections } from "./_hooks/useMyCollections";
import CollectionCard from "./_components/CollectionCard";
import CollectionsToolbar from "./_components/CollectionsToolbar";
import PremiumRequiredModal from "./_modals/PremiumRequiredModal";

export default function MyCollectionsPage() {
  const { t, locale } = useTranslation();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { isAuthenticated, user, limits } = useAuthStore();
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showPremiumModal, setShowPremiumModal] = useState(false);

  const {
    flatCategories,
    myCollections,
    displayedCollections,
    loading,
    searchQuery,
    setSearchQuery,
    sortBy,
    setSortBy,
  } = useMyCollections(isAuthenticated);

  const canCreateCollection =
    user?.membershipTier !== "free" || limits?.canCreateCollections;

  const handleCreateClick = () => {
    if (!canCreateCollection) {
      setShowPremiumModal(true);
      return;
    }
    setShowCreateModal(true);
  };

  return (
    <PageShell className="pb-16">
      <PageHeader
        title={t("collection.myCollections")}
        description={`${myCollections.length} ${locale === "en" ? "collections" : "koleksiyon"}`}
        actions={
          mounted && isAuthenticated ? (
            <Button
              variant="primary"
              onClick={handleCreateClick}
              className="gap-1.5"
            >
              <FolderPlusIcon className="h-4 w-4" />
              {t("collection.createCollection")}
            </Button>
          ) : undefined
        }
      />

      <CollectionsToolbar
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        sortBy={sortBy}
        onSortChange={setSortBy}
      />

      {loading ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {[...Array(10)].map((_, i) => (
            <div
              key={i}
              className="overflow-hidden rounded-lg border border-border-subtle bg-surface-elevated"
            >
              <div className="aspect-[4/3] animate-pulse bg-border-subtle" />
              <div className="space-y-2 p-3">
                <div className="h-3 w-3/4 rounded bg-border-subtle" />
                <div className="h-3 w-1/2 rounded bg-border-subtle" />
              </div>
            </div>
          ))}
        </div>
      ) : displayedCollections.length === 0 ? (
        <EmptyStateCard
          title={
            searchQuery
              ? `"${searchQuery}" ${t("common.noResults")}`
              : t("collection.noCollections")
          }
          description={
            locale === "en"
              ? "Start building your collection today"
              : "Koleksiyonunuzu bugün oluşturmaya başlayın"
          }
          action={
            searchQuery ? (
              <Button variant="secondary" onClick={() => setSearchQuery("")}>
                {t("common.clear")}
              </Button>
            ) : (
              <Button variant="primary" onClick={handleCreateClick}>
                {t("collection.createCollection")}
              </Button>
            )
          }
        />
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {displayedCollections.map((collection) => (
            <CollectionCard key={collection.id} collection={collection} />
          ))}
        </div>
      )}

      {showCreateModal && (
        <CreateCollectionModal
          flatCategories={flatCategories}
          onClose={() => setShowCreateModal(false)}
          onCreated={(collectionId) => {
            setShowCreateModal(false);
            queryClient.invalidateQueries({
              queryKey: queryKeys.collections.mine(),
            });
            if (collectionId) router.push(`/collections/${collectionId}`);
          }}
        />
      )}

      <PremiumRequiredModal
        isOpen={showPremiumModal}
        onClose={() => setShowPremiumModal(false)}
      />
    </PageShell>
  );
}
