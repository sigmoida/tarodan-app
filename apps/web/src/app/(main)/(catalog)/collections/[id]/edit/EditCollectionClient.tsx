'use client';

import { Button, Spinner } from '@tarodan/ui';
import { useAuthStore } from '@/stores/authStore';
import AuthLoadingScreen from '@/components/AuthLoadingScreen';
import { useLocale, useTranslations } from "next-intl";
import { useEditCollection } from './_hooks/useEditCollection';
import { useCategoryOptions } from './_hooks/useCategoryOptions';
import EditPageHeader from './_sections/EditPageHeader';
import CollectionForm from './_sections/CollectionForm';
import DeleteCollectionModal from './_sections/DeleteCollectionModal';

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
    isSaving,
    isDeleting,
    showDeleteModal,
    setShowDeleteModal,
    name,
    setName,
    description,
    setDescription,
    categoryId,
    setCategoryId,
    coverImagePreview,
    isUploadingCover,
    isPublic,
    setIsPublic,
    handleCoverImageChange,
    handleSubmit,
    handleDelete,
  } = useEditCollection();

  if (authLoading) return <AuthLoadingScreen />;
  if (!authLoading && (!isAuthenticated || !user)) return null;
  if (isLoading) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center">
        <div className="text-center">
          <Spinner size="lg" color="border-primary-500 border-t-transparent" className="mx-auto mb-4" />
          <p className="text-muted">{t('collection.loading')}</p>
        </div>
      </div>
    );
  }

  if (error || !collection) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center">
        <div className="text-center">
          <p className="text-danger-600 mb-4">{error || t('collection.collectionNotFound')}</p>
          <Button
            variant="primary"
            size="md"
            onClick={() => router.push('/collections')}
          >
            {t('collection.backToCollections')}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface">
      <EditPageHeader onBack={() => router.back()} />
      <div className="max-w-3xl mx-auto px-6 sm:px-8 py-6">
        <CollectionForm
          name={name}
          setName={setName}
          description={description}
          setDescription={setDescription}
          categoryId={categoryId}
          setCategoryId={setCategoryId}
          flatCategories={flatCategories}
          coverImagePreview={coverImagePreview}
          onCoverImageChange={handleCoverImageChange}
          isUploadingCover={isUploadingCover}
          isPublic={isPublic}
          setIsPublic={setIsPublic}
          isSaving={isSaving}
          onSubmit={handleSubmit}
          onCancel={() => router.back()}
          onDelete={() => setShowDeleteModal(true)}
        />
      </div>

      <DeleteCollectionModal
        show={showDeleteModal}
        isDeleting={isDeleting}
        onCancel={() => setShowDeleteModal(false)}
        onConfirm={handleDelete}
      />
    </div>
  );
}
