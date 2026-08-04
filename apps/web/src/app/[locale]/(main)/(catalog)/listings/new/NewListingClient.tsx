/** @format */

"use client";

import { useTranslations } from "next-intl";
import { Spinner } from "@tarodan/ui";
import { Form } from "@tarodan/ui/form";
import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import {
  TitleDescriptionCard,
  ProductDetailsCard,
  OptionsCard,
  PricingCard,
  ImagesCard,
  DiscountCard,
  ManufacturerAttributesCard,
} from "@/components/listings/form";
import {
  NewListingProvider,
  useNewListing,
} from "./_context/NewListingContext";
import SubmitBar from "./_sections/SubmitBar";
import { LimitBanner, BankGate } from "./_sections/ListingBanners";
import NewListingTour from "./_components/NewListingTour";

function NewListingLayout() {
  const t = useTranslations();
  const {
    authLoading,
    isAuthenticated,
    hasBankAccount,
    form,
    onSubmit,
    locale,
    CONDITIONS,
    flatCategories,
    brands,
    brandsLoading,
    models,
    modelsLoading,
    scaleList,
    materialList,
    manufacturerList,
    yearOptions,
    commissionPreview,
    commissionPreviewLoading,
    limits,
    imagePreviewUrls,
    uploadingImages,
    handleFileUpload,
    removeImage,
    manufacturerAttrGroups,
    saleData,
    setSaleData,
    showDiscountSection,
    setShowDiscountSection,
  } = useNewListing();

  if (authLoading) {
    return (
      <PageShell className="flex items-center justify-center">
        <Spinner size="xl" />
      </PageShell>
    );
  }
  if (!isAuthenticated) return null; // the context effect handles the redirect

  return (
    <PageShell>
      <PageHeader
        title="Yeni İlan Oluştur"
        description="Ürününüzü koleksiyoncularla buluşturun"
      />

      <LimitBanner />
      <BankGate />

      {/* Tur yalnız form gerçekten render edildiğinde çalışabilir: IBAN kapısı
          kapalıysa hedefler DOM'da yok. */}
      <NewListingTour ready={hasBankAccount} />

      {hasBankAccount && (
        <Form form={form} onSubmit={onSubmit} className="space-y-4">
          <div data-tour="listing-basics">
            <TitleDescriptionCard />
          </div>
          <div data-tour="listing-details">
            <ProductDetailsCard
              locale={locale}
              conditions={CONDITIONS}
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
          </div>
          <ManufacturerAttributesCard
            manufacturerList={manufacturerList}
            manufacturerAttrGroups={manufacturerAttrGroups}
          />
          <OptionsCard locale={locale} canTrade={!!limits?.canTrade} />
          <div data-tour="listing-pricing">
            <PricingCard
              locale={locale}
              commissionPreview={commissionPreview}
              commissionPreviewLoading={commissionPreviewLoading}
              quantityPlaceholder="1"
              quantityHelper={t("product.quantityDefaultHint")}
            />
          </div>
          {/* İndirim: düzenleme ekranıyla AYNI bölüm — satıcı ilanı indirimli
              açabilsin (eskiden önce yayınlayıp sonra düzenlemeye girmesi
              gerekiyordu). */}
          <DiscountCard
            saleData={saleData}
            setSaleData={setSaleData}
            showDiscountSection={showDiscountSection}
            setShowDiscountSection={setShowDiscountSection}
          />
          <div data-tour="listing-images">
            <ImagesCard
              maxImages={limits?.maxImagesPerListing || 3}
              imagePreviewUrls={imagePreviewUrls}
              uploadingImages={uploadingImages}
              handleFileUpload={handleFileUpload}
              removeImage={removeImage}
            />
          </div>
          <div data-tour="listing-submit">
            <SubmitBar />
          </div>
        </Form>
      )}
    </PageShell>
  );
}

export default function NewListingClient() {
  return (
    <NewListingProvider>
      <NewListingLayout />
    </NewListingProvider>
  );
}
