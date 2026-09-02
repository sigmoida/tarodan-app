"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@tarodan/ui";
import { Form, useZodForm } from "@tarodan/ui/form";
import {
  DiscountCard,
  GlobalAttributesCard,
  ImagesCard,
  ManufacturerAttributesCard,
  OptionsCard,
  PricingCard,
  ProductDetailsCard,
  TitleDescriptionCard,
  buildListingFormData,
  toEditListingValues,
  buildListingUpdatePayload,
  buildSaleDataFromListing,
  createEmptySaleData,
  buildEditListingSchema,
  emptyEditValues,
  getConditions,
  getYearOptions,
  useCarModels,
  useListingCategories,
  useListingFilters,
  useListingImageUpload,
  useAttributeGroups,
  withSelectedReference,
  type EditListingValues,
  type ListingEditPayload,
  type SaleData,
} from "@tarodan/listing-form";
import { adminApi } from "@/lib/api";
import { useQuery } from "@tanstack/react-query";
import { adminKeys } from "@/lib/query/keys";
import { PageLoading } from "@/components/PageLoading";
import { useAdminMutation } from "@/hooks/useAdminMutation";

/**
 * Yönetici ilan düzenleme formu — satıcı formuyla AYNI kartlar.
 *
 * Bu bileşen kart RENDER ETMEZ, yalnızca bağlar: veriyi çeker, paylaşılan
 * mapper ile forma doldurur, paylaşılan payload üreticisiyle kaydeder.
 * Alan kuralları, doğrulama ve görsel kuyruğu paketin işidir; burada
 * tekrarlanan bir kural yoktur.
 *
 * Statü bu ekranda YOK: yönetici düzenlemesi ilanın durumunu değiştirmez
 * (sunucu da yok sayar). Onaylama/reddetme/kaldırma detay ekranının işidir.
 */
export default function ProductEditClient({ id }: { id: string }) {
  const t = useTranslations();
  const router = useRouter();

  /**
   * BİLEREK `useAdminItem` DEĞİL: o hook `useSuspenseQuery` kullanıyor ve her
   * askıya alışta bu ağacın durumu — dolayısıyla forma yazdığımız değerler —
   * atılıyordu. Form kaydı yüklenir yüklenmez dolduruluyor, o yüzden burada
   * askı değil düz bir sorgu + yükleme kapısı gerekiyor (satıcı formu da aynı
   * deseni kullanır).
   */
  const productQuery = useQuery({
    queryKey: adminKeys.detail("products", id),
    queryFn: async () =>
      (await adminApi.getProduct(id)).data as {
        edit?: ListingEditPayload;
        color?: string | null;
        /** Görsel kotası ilanın SAHİBİNE aittir, düzenleyen yöneticiye değil. */
        maxImagesPerListing?: number | null;
      },
  });
  const item = productQuery.data;

  // Zorunlu genel özel gruplar sorgudan gelir; şema onları doğrulama anında
  // ref üzerinden okur (form, grup sorgusundan önce kurulur).
  const requiredGroupSlugsRef = useRef<readonly string[]>([]);
  const schema = useMemo(
    () => buildEditListingSchema(() => requiredGroupSlugsRef.current),
    [],
  );
  const form = useZodForm(schema, {
    defaultValues: emptyEditValues,
  });
  const [saleData, setSaleData] = useState<SaleData>(createEmptySaleData());
  const [showDiscountSection, setShowDiscountSection] = useState(false);

  const seedExistingImagesRef = useRef<
    ((images: any[], sessionId?: string) => void) | null
  >(null);
  const populatedForRef = useRef<string | null>(null);

  const record = item?.edit ?? null;
  const maxImages = item?.maxImagesPerListing || 3;

  const {
    items: imageItems,
    uploadingImages,
    submitBlocker,
    seedExistingImages,
    handleFileUpload,
    removeImage,
    retryImage,
    rotateImage,
    moveImage,
    makeCover,
  } = useListingImageUpload({ form, maxImages });
  seedExistingImagesRef.current = seedExistingImages;

  // Kaydı forma yerleştir. İşaret hangi İLANIN doldurulduğunu tutar; kullanıcı
  // forma dokunduysa taze veri YAZILMAZ, yoksa bir refetch yazılanları silerdi.
  useEffect(() => {
    if (!record) return;
    if (populatedForRef.current === id && form.formState.isDirty) return;
    populatedForRef.current = id;

    const { newFormData } = buildListingFormData(record);
    form.reset(toEditListingValues(newFormData));
    // eslint-disable-next-line no-console
    seedExistingImagesRef.current?.(record.images ?? [], id);

    const { saleData: nextSale, saleActive } = buildSaleDataFromListing(record);
    setSaleData(nextSale);
    setShowDiscountSection(saleActive);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [record, id]);

  const save = useAdminMutation(
    (values: EditListingValues) =>
      adminApi.updateProduct(id, buildListingUpdatePayload(values, saleData)),
    {
      invalidates: ["products"],
      successMessage: t("admin.catalog.products.updated"),
      onSuccess: () => router.push(`/catalog/products/${id}`),
    },
  );

  // Katalog seçenekleri — satıcı formuyla AYNI uçlar, aynı hook'lar.
  const { flatCategories } = useListingCategories(true);
  const {
    scales: scaleList,
    materials: materialList,
    colors: colorList,
    brands,
    manufacturers,
    brandsLoading,
    optionsStatus,
  } = useListingFilters(true);
  const brandId = form.watch("brandId");
  const manufacturerId = form.watch("manufacturerId");
  const brandSlug = brands.find((b) => b.id === brandId)?.slug;
  const { models, modelsLoading } = useCarModels(brandSlug);
  const manufacturerSlug = manufacturers.find(
    (m) => m.id === manufacturerId,
  )?.slug;
  const {
    globalAttrGroups,
    manufacturerAttrGroups,
    requiredGroupSlugs,
    attrGroupsStatus,
  } = useAttributeGroups(manufacturerSlug);
  requiredGroupSlugsRef.current = requiredGroupSlugs;

  /**
   * Kaydın KENDİ seçimini listeye geri koy.
   *
   * Seçenek uçları yalnız AKTİF kayıtları döner; yönetici bir markayı pasife
   * aldığında o markayı taşıyan ilanın formu boş açılır ve ilk kayıtta seçim
   * kalıcı silinirdi. Satıcı formu da aynı korumayı kullanır.
   */
  const categoryOptions = withSelectedReference(flatCategories, {
    id: record?.categoryId,
    name: record?.categoryName,
  });
  const brandOptions = withSelectedReference(brands, {
    id: record?.brandId,
    name: record?.brandName,
    slug: record?.brandSlug,
  });
  const manufacturerOptions = withSelectedReference(manufacturers, {
    id: record?.manufacturerId,
    name: record?.manufacturerName,
    slug: record?.manufacturerSlug,
  });
  /**
   * Model listesi markaya bağlı AYRI bir istekle gelir. Liste gelene kadar
   * ürünün KENDİ modeli tek seçenek olarak konur — alan boş görünüp sonra
   * dolmak yerine doğru etiketle açılır (satıcı formu da böyle yapar).
   */
  const modelOptions = useMemo(
    () =>
      models.length > 0
        ? models
        : record?.carModelId && record.carModelName
          ? [
              {
                id: record.carModelId,
                name: record.carModelName,
                slug: "",
                brand: { slug: brandSlug ?? "" },
              },
            ]
          : [],
    [models, record],
  );

  // Kartlar kayıt forma YAZILDIKTAN sonra monte olmalı; erken monte olurlarsa
  // seçim alanları bir an boş görünür.
  if (productQuery.isPending || (record && populatedForRef.current !== id)) {
    return <PageLoading />;
  }
  if (productQuery.isError || !record) {
    return <p className="text-danger-600">{t("product.loadFailed")}</p>;
  }

  return (
    <div className="space-y-4">
      <Form
        form={form}
        onSubmit={(values: EditListingValues) => {
          if (submitBlocker) return;
          save.mutate(values);
        }}
        className="space-y-4"
      >
        <TitleDescriptionCard />
        <ProductDetailsCard
          locale="tr"
          conditions={getConditions("tr")}
          flatCategories={categoryOptions}
          brands={brandOptions}
          brandsLoading={brandsLoading}
          optionsStatus={optionsStatus}
          models={modelOptions}
          modelsLoading={modelsLoading && modelOptions.length === 0}
          scaleList={scaleList}
          materialList={materialList}
          colorList={colorList}
          legacyColor={record?.color ?? null}
          manufacturerList={manufacturerOptions}
          yearOptions={getYearOptions()}
        />
        <GlobalAttributesCard
          attrGroups={globalAttrGroups}
          attrGroupsStatus={attrGroupsStatus}
        />
        <ManufacturerAttributesCard
          manufacturerList={manufacturerOptions}
          manufacturerAttrGroups={manufacturerAttrGroups}
        />
        {/* Takas hakkı ilanın SAHİBİNİN üyeliğinden gelir; yönetici onu
            yükseltemez, bu yüzden yükseltme bağlantısı da geçilmez. */}
        <OptionsCard locale="tr" canTrade />
        {/* Komisyon/net kazanç önizlemesi YOK: `/orders/commission-preview`
            isteği yapan kullanıcıyı SATICI sayar, yani yönetici oturumunda
            başka birinin ilanı için yanlış rakam üretirdi (uç zaten yönetici
            token'ını tanımıyor). Kart bu durumu destekler; paket boyutu
            seçilebilir kalır, yalnız tutarlar gösterilmez. */}
        <PricingCard
          locale="tr"
          commissionPreview={null}
          commissionPreviewLoading={false}
          commissionPreviewEnabled={false}
          quantityPlaceholder={t("membership.unlimited")}
          quantityHelper={t("product.leaveEmptyUnlimitedStock")}
        />
        <DiscountCard
          saleData={saleData}
          setSaleData={setSaleData}
          showDiscountSection={showDiscountSection}
          setShowDiscountSection={setShowDiscountSection}
        />
        <ImagesCard
          maxImages={maxImages}
          guidelinesDefaultOpen={false}
          items={imageItems}
          uploadingImages={uploadingImages}
          handleFileUpload={handleFileUpload}
          removeImage={removeImage}
          retryImage={retryImage}
          rotateImage={rotateImage}
          moveImage={moveImage}
          makeCover={makeCover}
        />

        {submitBlocker && (
          <p className="text-sm text-danger-600">{submitBlocker.message}</p>
        )}

        <div className="flex gap-3 pt-2">
          <Button
            type="button"
            variant="secondary"
            onClick={() => router.push(`/catalog/products/${id}`)}
          >
            {t("common.cancel")}
          </Button>
          <Button
            type="submit"
            isLoading={save.isPending}
            disabled={uploadingImages}
          >
            {t("common.save")}
          </Button>
        </div>
      </Form>
    </div>
  );
}
