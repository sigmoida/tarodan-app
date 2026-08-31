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
} from "@tarodan/listing-form";
import {
  NewListingProvider,
  useNewListing,
} from "./_context/NewListingContext";
import SubmitBar from "./_sections/SubmitBar";
import { LimitBanner, BankGate, AddressGate } from "./_sections/ListingBanners";
import NewListingTour from "./_components/NewListingTour";

function NewListingLayout() {
  const t = useTranslations();
  const {
    authLoading,
    isAuthenticated,
    hasBankAccount,
    hasDispatchAddress,
    form,
    onSubmit,
    locale,
    CONDITIONS,
    flatCategories,
    brands,
    brandsLoading,
    optionsStatus,
    models,
    modelsLoading,
    scaleList,
    materialList,
    colorList,
    manufacturerList,
    yearOptions,
    commissionPreview,
    commissionPreviewLoading,
    commissionPreviewError,
    commissionPreviewEnabled,
    limits,
    imageItems,
    uploadingImages,
    handleFileUpload,
    removeImage,
    retryImage,
    rotateImage,
    moveImage,
    makeCover,
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

  // İlan formu ancak satıcı hem ödeme alabilecek hem de koliyi teslim
  // edebilecek durumdayken açılır.
  const canCreateListing = hasBankAccount && hasDispatchAddress;

  return (
    <PageShell>
      <PageHeader
        title={t("page.new.newlistingclient.yeniIlanOlustur")}
        description={t(
          "page.new.newlistingclient.urununuzuKoleksiyoncularlaBulusturun",
        )}
      />

      <LimitBanner />
      <BankGate />
      <AddressGate />

      {/* Tur yalnız form gerçekten render edildiğinde çalışabilir: kapılardan
          biri kapalıysa hedefler DOM'da yok. */}
      <NewListingTour ready={canCreateListing} />

      {canCreateListing && (
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
              optionsStatus={optionsStatus}
              models={models}
              modelsLoading={modelsLoading}
              scaleList={scaleList}
              materialList={materialList}
              colorList={colorList}
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
              commissionPreviewError={commissionPreviewError}
              commissionPreviewEnabled={commissionPreviewEnabled}
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
              items={imageItems}
              uploadingImages={uploadingImages}
              handleFileUpload={handleFileUpload}
              removeImage={removeImage}
              retryImage={retryImage}
              rotateImage={rotateImage}
              moveImage={moveImage}
              makeCover={makeCover}
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
