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
} from "@/components/listings/form";
import {
  NewListingProvider,
  useNewListing,
} from "./_context/NewListingContext";
import ManufacturerAttributesSection from "./_sections/ManufacturerAttributesSection";
import SubmitBar from "./_sections/SubmitBar";
import { LimitBanner, BankGate } from "./_sections/ListingBanners";

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

      {hasBankAccount && (
        <Form form={form} onSubmit={onSubmit} className="space-y-4">
          <TitleDescriptionCard />
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
          <ManufacturerAttributesSection />
          <OptionsCard locale={locale} canTrade={!!limits?.canTrade} />
          <PricingCard
            locale={locale}
            commissionPreview={commissionPreview}
            commissionPreviewLoading={commissionPreviewLoading}
            quantityPlaceholder="1"
            quantityHelper={t("product.quantityDefaultHint")}
          />
          <ImagesCard
            locale={locale}
            maxImages={limits?.maxImagesPerListing || 3}
            imagePreviewUrls={imagePreviewUrls}
            uploadingImages={uploadingImages}
            handleFileUpload={handleFileUpload}
            removeImage={removeImage}
          />
          <SubmitBar />
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
