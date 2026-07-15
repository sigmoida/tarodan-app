"use client";

import { useParams, useRouter } from "next/navigation";
import { Button, Spinner } from "@tarodan/ui";
import { Form } from "@tarodan/ui/form";
import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { useLocale, useTranslations } from "next-intl";
import { useAuthStore } from "@/stores/authStore";
import AuthLoadingScreen from "@/components/AuthLoadingScreen";
import {
  getConditions,
  getYearOptions,
  TitleDescriptionCard,
  ProductDetailsCard,
  OptionsCard,
  PricingCard,
  ImagesCard,
  useListingCategories,
  useListingFilters,
  useCarModels,
  useCommissionPreview,
  useListingImageUpload,
} from "@/components/listings/form";
import { useEditListingForm } from "./_hooks/useEditListingForm";
import { useProductDiscounts } from "./_hooks/useProductDiscounts";
import { useListingLifecycle } from "./_hooks/useListingLifecycle";
import StatusBanners from "./_sections/StatusBanners";
import DiscountSection from "./_sections/DiscountSection";
import DeleteListingModal from "./_modals/DeleteListingModal";

const TERMINAL_STATUSES = ["sold", "reserved", "inactive", "deleted"];

export default function EditListingClient() {
  const params = useParams();
  const router = useRouter();
  const locale = useLocale();
  const t = useTranslations();
  const id = params.id as string;
  const { isAuthenticated, isLoading: authLoading, limits } = useAuthStore();

  const {
    form,
    onSubmit,
    saleData,
    setSaleData,
    imagePreviewUrls,
    setImagePreviewUrls,
    showDiscountSection,
    setShowDiscountSection,
    isLoading,
    setIsLoading,
    isFetching,
  } = useEditListingForm({ id, authLoading, isAuthenticated });

  const status = form.watch("status");
  const brandId = form.watch("brandId");
  const price = form.watch("price");
  const categoryId = form.watch("categoryId");

  const catalogEnabled = !authLoading && isAuthenticated;
  const { flatCategories } = useListingCategories(catalogEnabled);
  const {
    brands,
    brandsLoading,
    scales: scaleList,
    materials: materialList,
    manufacturers: manufacturerList,
  } = useListingFilters(catalogEnabled);
  const selectedBrandSlug = brands.find((b) => b.id === brandId)?.slug;
  const { models, modelsLoading } = useCarModels(selectedBrandSlug);
  const { commissionPreview, commissionPreviewLoading } = useCommissionPreview(
    price,
    categoryId,
  );
  const { productDiscounts } = useProductDiscounts({
    id,
    authLoading,
    isAuthenticated,
  });
  const { uploadingImages, handleFileUpload, removeImage } =
    useListingImageUpload({
      form,
      maxImages: limits?.maxImagesPerListing || 3,
      imagePreviewUrls,
      setImagePreviewUrls,
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
  } = useListingLifecycle({ id, form, setIsLoading });

  if (authLoading) return <AuthLoadingScreen />;
  if (!authLoading && !isAuthenticated) return null;
  if (isFetching) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="text-center">
          <Spinner size="xl" className="mx-auto mb-4" />
          <p className="text-muted">Yükleniyor...</p>
        </div>
      </div>
    );
  }

  const isTerminal = TERMINAL_STATUSES.includes(status);

  const statusActions = isTerminal ? null : (
    <>
      {status === "active" ? (
        <Button
          type="button"
          variant="secondary"
          onClick={handleDeactivate}
          disabled={isLoading}
        >
          İlanı Pasife Al
        </Button>
      ) : status === "pending" ? (
        <Button type="button" variant="secondary" disabled>
          İnceleme Bekleniyor
        </Button>
      ) : (
        <Button
          type="button"
          variant="success"
          onClick={handleActivate}
          disabled={isLoading}
        >
          İncelemeye Gönder
        </Button>
      )}
      <Button
        type="button"
        variant="danger"
        onClick={() => setShowDeleteModal(true)}
        disabled={isLoading}
      >
        İlanı Sil
      </Button>
    </>
  );

  return (
    <PageShell>
      <PageHeader
        backHref={`/listings/${id}`}
        backLabel="İlana Dön"
        title="İlanı Düzenle"
        description="İlan bilgilerinizi güncelleyin."
        actions={statusActions}
      />

      <StatusBanners
        status={status}
        reactivateQuantity={reactivateQuantity}
        setReactivateQuantity={setReactivateQuantity}
        reactivating={reactivating}
        handleReactivate={handleReactivate}
      />

      <Form
        form={form}
        onSubmit={onSubmit}
        className={`space-y-4 ${isTerminal ? "hidden" : ""}`}
      >
        <TitleDescriptionCard />
        <ProductDetailsCard
          locale={locale}
          conditions={getConditions(locale)}
          flatCategories={flatCategories}
          brands={brands}
          brandsLoading={brandsLoading}
          models={models}
          modelsLoading={modelsLoading}
          scaleList={scaleList}
          materialList={materialList}
          manufacturerList={manufacturerList}
          yearOptions={getYearOptions()}
        />
        <OptionsCard
          locale={locale}
          canTrade={!!limits?.canTrade}
          showPreorder
        />
        <PricingCard
          locale={locale}
          commissionPreview={commissionPreview}
          commissionPreviewLoading={commissionPreviewLoading}
          quantityPlaceholder={t("membership.unlimited")}
          quantityHelper={t("product.leaveEmptyUnlimitedStock")}
        />
        <DiscountSection
          saleData={saleData}
          setSaleData={setSaleData}
          showDiscountSection={showDiscountSection}
          setShowDiscountSection={setShowDiscountSection}
          productDiscounts={productDiscounts}
        />
        <ImagesCard
          maxImages={limits?.maxImagesPerListing || 3}
          imagePreviewUrls={imagePreviewUrls}
          uploadingImages={uploadingImages}
          handleFileUpload={handleFileUpload}
          removeImage={removeImage}
        />

        <div className="flex gap-4 pt-2">
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
            {isLoading ? "Güncelleniyor..." : "Değişiklikleri Kaydet"}
          </Button>
        </div>
      </Form>

      {showDeleteModal && (
        <DeleteListingModal
          onClose={() => setShowDeleteModal(false)}
          handleDelete={handleDelete}
          isLoading={isLoading}
        />
      )}
    </PageShell>
  );
}
