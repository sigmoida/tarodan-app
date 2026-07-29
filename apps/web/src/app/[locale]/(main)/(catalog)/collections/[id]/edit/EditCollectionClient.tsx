/** @format */

"use client";

import { Button, Spinner } from "@tarodan/ui";
import { useTranslations } from "next-intl";
import { useAuthStore } from "@/stores/authStore";
import AuthLoadingScreen from "@/components/AuthLoadingScreen";
import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { useEditCollection } from "./_hooks/useEditCollection";
import { useCategoryOptions } from "./_hooks/useCategoryOptions";
import CollectionForm from "./_sections/CollectionForm";
import DeleteCollectionModal from "./_sections/DeleteCollectionModal";

export default function EditCollectionClient() {
  const t = useTranslations();
  const { isAuthenticated, user } = useAuthStore();
  const flatCategories = useCategoryOptions();
  const {
    router,
    authLoading,
    collection,
    isLoading,
    error,
    form,
    onSubmit,
    isSaving,
    uploadCover,
    isDeleting,
    showDeleteModal,
    setShowDeleteModal,
    handleDelete,
  } = useEditCollection();

  if (authLoading) return <AuthLoadingScreen />;
  if (!authLoading && (!isAuthenticated || !user)) return null;

  if (isLoading) {
    return (
      <PageShell className="flex items-center justify-center">
        <Spinner size="lg" color="border-primary-500 border-t-transparent" />
      </PageShell>
    );
  }

  if (error || !collection) {
    return (
      <PageShell className="flex items-center justify-center">
        <div className="text-center">
          <p className="mb-4 text-danger-600">
            {error || t("collection.collectionNotFound")}
          </p>
          <Button
            variant="primary"
            size="md"
            onClick={() => router.push("/collections")}
          >
            {t("collection.backToCollections")}
          </Button>
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <PageHeader
        title={t("collection.editCollectionTitle")}
        onBack={() => router.back()}
      />
      <CollectionForm
        form={form}
        onSubmit={onSubmit}
        isSaving={isSaving}
        uploadCover={uploadCover}
        flatCategories={flatCategories}
        onCancel={() => router.back()}
        onDelete={() => setShowDeleteModal(true)}
      />

      <DeleteCollectionModal
        show={showDeleteModal}
        isDeleting={isDeleting}
        onCancel={() => setShowDeleteModal(false)}
        onConfirm={handleDelete}
      />
    </PageShell>
  );
}
