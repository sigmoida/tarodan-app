/** @format */

"use client";

import { Link } from "@/i18n/navigation";
import { FolderPlusIcon } from "@heroicons/react/24/outline";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@tarodan/ui";
import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { Container } from "@/components/layout/Container";
import CreateCollectionModal from "@/components/CreateCollectionModal";
import PremiumRequiredModal from "@/components/PremiumRequiredModal";
import {
  CollectionsProvider,
  useCollections,
} from "./_context/CollectionsContext";
import CollectionsToolbar from "./_components/CollectionsToolbar";
import CollectionsGrid from "./_components/CollectionsGrid";

function CollectionsLayout() {
  const t = useTranslations();
  const {
    mounted,
    isAuthenticated,
    limits,
    flatCategories,
    showCreateModal,
    setShowCreateModal,
    showPremiumModal,
    setShowPremiumModal,
    handleCreateClick,
    handleCreated,
  } = useCollections();

  const canCreate = mounted && isAuthenticated && limits?.canCreateCollections;
  const needsUpgrade =
    mounted && isAuthenticated && !limits?.canCreateCollections;

  return (
    <PageShell>
      <PageHeader
        title={t("collection.collections")}
        description={t("footer.description")}
        actions={
          <>
            {canCreate && (
              <Button
                variant="primary"
                size="md"
                onClick={handleCreateClick}
                className="flex items-center gap-1.5"
              >
                <FolderPlusIcon className="w-4 h-4" />
                {t("collection.createCollection")}
              </Button>
            )}
            {needsUpgrade && (
              <Link
                href="/membership"
                className="px-4 py-2 bg-surface-alt text-body hover:bg-border-subtle rounded text-sm font-medium transition-colors"
              >
                {t("membership.upgrade")}
              </Link>
            )}
          </>
        }
      />

      <CollectionsToolbar />
      <CollectionsGrid />

      {/* Create Collection Modal */}
      {showCreateModal && (
        <CreateCollectionModal
          flatCategories={flatCategories}
          onClose={() => setShowCreateModal(false)}
          onCreated={handleCreated}
        />
      )}

      {/* Premium Required Modal */}
      <PremiumRequiredModal
        isOpen={showPremiumModal}
        onClose={() => setShowPremiumModal(false)}
      />
    </PageShell>
  );
}

export default function CollectionsClient() {
  return (
    <CollectionsProvider>
      <CollectionsLayout />
    </CollectionsProvider>
  );
}
