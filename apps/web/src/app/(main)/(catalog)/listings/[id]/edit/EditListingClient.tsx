'use client';

import { useParams, useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { ArrowLeftIcon } from '@heroicons/react/24/outline';
import Link from 'next/link';
import { Button, Spinner } from '@tarodan/ui';
import { useAuthStore } from '@/stores/authStore';
import AuthLoadingScreen from '@/components/AuthLoadingScreen';
import { getYearOptions } from './_lib/constants';
import { useEditListingForm } from './_hooks/useEditListingForm';
import { useListingFilters } from './_hooks/useListingFilters';
import { useCarModels } from './_hooks/useCarModels';
import { useCommissionPreview } from './_hooks/useCommissionPreview';
import { useProductDiscounts } from './_hooks/useProductDiscounts';
import { useListingImages } from './_hooks/useListingImages';
import { useListingLifecycle } from './_hooks/useListingLifecycle';
import StatusBanners from './_sections/StatusBanners';
import BasicInfoSection from './_sections/BasicInfoSection';
import OptionsSection from './_sections/OptionsSection';
import PriceStockSection from './_sections/PriceStockSection';
import DiscountSection from './_sections/DiscountSection';
import ImagesSection from './_sections/ImagesSection';
import StatusSection from './_sections/StatusSection';
import DeleteListingModal from './_modals/DeleteListingModal';

export default function EditListingClient() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const { isAuthenticated, isLoading: authLoading, limits } = useAuthStore();

  const {
    formData,
    setFormData,
    saleData,
    setSaleData,
    imagePreviewUrls,
    setImagePreviewUrls,
    showDiscountSection,
    setShowDiscountSection,
    isLoading,
    setIsLoading,
    isFetching,
    handleSubmit,
  } = useEditListingForm({ id, authLoading, isAuthenticated });

  const { brands, brandsLoading, scaleList, materialList, manufacturerList, flatCategories } =
    useListingFilters({ id, authLoading, isAuthenticated });
  const { models, modelsLoading } = useCarModels(formData.brandId, brands);
  const { commissionPreview, commissionPreviewLoading } = useCommissionPreview(formData.price, formData.categoryId);
  const { productDiscounts } = useProductDiscounts({ id, authLoading, isAuthenticated });
  const { uploadingImages, handleFileUpload, removeImage } = useListingImages({
    formData,
    setFormData,
    imagePreviewUrls,
    setImagePreviewUrls,
    limits,
  });
  const {
    reactivateQuantity,
    setReactivateQuantity,
    reactivating,
    showDeleteModal,
    setShowDeleteModal,
    handleReactivate,
    handleDeactivate,
    handleActivate,
    handleDelete,
  } = useListingLifecycle({ id, formData, setFormData, setIsLoading });

  const yearOptions = getYearOptions();

  if (authLoading) return <AuthLoadingScreen />;
  if (!authLoading && !isAuthenticated) return null;
  if (isFetching) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center">
        <div className="text-center">
          <Spinner size="xl" className="mx-auto mb-4" />
          <p className="text-muted">Yükleniyor...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface">
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Link
          href={`/listings/${id}`}
          className="inline-flex items-center gap-2 text-muted hover:text-heading mb-6"
        >
          <ArrowLeftIcon className="w-5 h-5" />
          İlana Dön
        </Link>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-surface-elevated rounded-2xl shadow-sm p-6 md:p-8"
        >
          <h1 className="text-3xl font-bold mb-2">İlanı Düzenle</h1>
          <p className="text-muted mb-6">
            İlan bilgilerinizi güncelleyin.
          </p>

          <StatusBanners
            status={formData.status}
            reactivateQuantity={reactivateQuantity}
            setReactivateQuantity={setReactivateQuantity}
            reactivating={reactivating}
            handleReactivate={handleReactivate}
          />

          <form onSubmit={handleSubmit} className="space-y-6" style={{ display: ['sold', 'reserved', 'inactive', 'deleted'].includes(formData.status) ? 'none' : undefined }}>
            <BasicInfoSection
              formData={formData}
              setFormData={setFormData}
              flatCategories={flatCategories}
              brands={brands}
              brandsLoading={brandsLoading}
              models={models}
              modelsLoading={modelsLoading}
              scaleList={scaleList}
              materialList={materialList}
              manufacturerList={manufacturerList}
              yearOptions={yearOptions}
            />

            <OptionsSection
              formData={formData}
              setFormData={setFormData}
              limits={limits}
            />

            <PriceStockSection
              formData={formData}
              setFormData={setFormData}
              commissionPreview={commissionPreview}
              commissionPreviewLoading={commissionPreviewLoading}
            />

            <DiscountSection
              formData={formData}
              saleData={saleData}
              setSaleData={setSaleData}
              showDiscountSection={showDiscountSection}
              setShowDiscountSection={setShowDiscountSection}
              productDiscounts={productDiscounts}
            />

            <ImagesSection
              formData={formData}
              imagePreviewUrls={imagePreviewUrls}
              uploadingImages={uploadingImages}
              handleFileUpload={handleFileUpload}
              removeImage={removeImage}
              limits={limits}
            />

            {/* Submit */}
            <div className="flex gap-4 pt-4">
              <Button
                type="button"
                variant="secondary"
                size="lg"
                className="flex-1"
                onClick={() => router.back()}
              >
                İptal
              </Button>
              <Button
                type="submit"
                variant="primary"
                size="lg"
                className="flex-1"
                disabled={isLoading}
              >
                {isLoading ? 'Güncelleniyor...' : 'Değişiklikleri Kaydet'}
              </Button>
            </div>

            <StatusSection
              status={formData.status}
              isLoading={isLoading}
              handleDeactivate={handleDeactivate}
              handleActivate={handleActivate}
              setShowDeleteModal={setShowDeleteModal}
            />
          </form>
        </motion.div>

        {/* Delete Confirmation Modal */}
        {showDeleteModal && (
          <DeleteListingModal
            onClose={() => setShowDeleteModal(false)}
            handleDelete={handleDelete}
            isLoading={isLoading}
          />
        )}
      </main>
    </div>
  );
}
