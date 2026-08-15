/** @format */

"use client";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "@/i18n/navigation";
import { useQuery } from "@tanstack/react-query";
import type { UseFormReturn } from "react-hook-form";
import { useZodForm } from "@tarodan/ui/form";
import toast from "react-hot-toast";
import { listingsApi, bankAccountApi } from "@/lib/api";
import { queryKeys } from "@/lib/query/keys";
import { useAuthStore } from "@/stores/authStore";
import { useLocale, useTranslations } from "next-intl";
import {
  newListingSchema,
  emptyListingValues,
  type NewListingValues,
} from "../_lib/schema";
import { getConditions } from "@/components/listings/form/constants";
import {
  useListingCategories,
  useListingFilters,
  useCarModels,
  useManufacturerAttributes,
  useListingLimits,
  useCommissionPreview,
} from "@/components/listings/form/queries";
import { useListingImageUpload } from "@/components/listings/form/useListingImageUpload";
import { IMAGE_SUBMIT_BLOCKER_KEY } from "@/components/listings/form/listing-image-item";
import {
  createEmptySaleData,
  saleDataToPayload,
  type SaleData,
} from "@/components/listings/form";

function useNewListingValue() {
  const router = useRouter();
  const {
    isAuthenticated,
    isLoading: authLoading,
    user,
    limits,
    refreshUser,
  } = useAuthStore();
  const locale = useLocale();
  const t = useTranslations();
  const CONDITIONS = getConditions(locale);

  const form = useZodForm(newListingSchema(locale), {
    defaultValues: emptyListingValues,
  });
  const { watch, setValue, getValues } = form;

  // Watched values that drive dependent queries / conditional UI.
  const brandId = watch("brandId");
  const manufacturerId = watch("manufacturerId");
  const price = watch("price");
  const categoryId = watch("categoryId");
  const shippingPackageTier = watch("shippingPackageTier");

  const bankAccountQuery = useQuery({
    queryKey: queryKeys.bankAccount.detail(),
    queryFn: async () => (await bankAccountApi.get()).data || null,
    enabled: isAuthenticated,
  });
  const hasBankAccount = !!bankAccountQuery.data;
  const bankAccountLoading = bankAccountQuery.isLoading;

  const currentYear = new Date().getFullYear();
  const yearOptions = Array.from(
    { length: currentYear - 1950 + 1 },
    (_, i) => currentYear - i,
  );

  // İndirimli açılış: komisyon önizlemesi o anda geçerli satış fiyatını
  // kullanır; API kapısı ayrıca normal ve indirimli fiyatın ikisini de denetler.
  const [saleData, setSaleData] = useState<SaleData>(createEmptySaleData);
  const [showDiscountSection, setShowDiscountSection] = useState(false);
  const formPrice = Number(price);
  const salePayload = saleDataToPayload(saleData, formPrice);
  const now = Date.now();
  const saleStartsAt = salePayload.saleStartDate
    ? new Date(salePayload.saleStartDate).getTime()
    : null;
  const saleEndsAt = salePayload.saleEndDate
    ? new Date(salePayload.saleEndDate).getTime()
    : null;
  const saleIsActive =
    salePayload.salePrice != null &&
    (saleStartsAt == null || now >= saleStartsAt) &&
    (saleEndsAt == null || now <= saleEndsAt);
  const commissionPreviewPrice = saleIsActive ? salePayload.salePrice! : price;

  // ---- Server data (shared catalog queries) ----
  const queryEnabled = !authLoading && isAuthenticated;
  const { flatCategories } = useListingCategories(queryEnabled, true);
  const {
    scales: scaleList,
    materials: materialList,
    brands,
    manufacturers: manufacturerList,
    brandsLoading,
  } = useListingFilters();
  const selectedBrandSlug = brands.find((b) => b.id === brandId)?.slug;
  const { models, modelsLoading } = useCarModels(selectedBrandSlug);
  const selectedManufacturerSlug = manufacturerList.find(
    (m) => m.id === manufacturerId,
  )?.slug;
  const { manufacturerAttrGroups } = useManufacturerAttributes(
    selectedManufacturerSlug,
  );
  const { listingLimits, limitsLoading, refetchLimits } =
    useListingLimits(queryEnabled);
  const {
    commissionPreview,
    commissionPreviewLoading,
    commissionPreviewError,
  } = useCommissionPreview(
    commissionPreviewPrice,
    categoryId,
    shippingPackageTier,
  );

  // Auth gate: redirect out if signed out, else refresh the user once.
  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated) {
      toast.error(t("product.loginRequiredToCreate"));
      router.push("/login?redirect=/listings/new");
      return;
    }
    refreshUser();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, authLoading]);

  // Drop the previous manufacturer's attribute selections when it genuinely changes.
  const activeAttrManufacturer = useRef<string>("");
  useEffect(() => {
    if (manufacturerList.length === 0) return;
    const newKey =
      manufacturerList.find((m) => m.id === manufacturerId)?.id ?? "";
    if (activeAttrManufacturer.current === newKey) return;
    if (
      activeAttrManufacturer.current !== "" &&
      Object.keys(getValues("customAttributes")).length > 0
    ) {
      setValue("customAttributes", {});
    }
    activeAttrManufacturer.current = newKey;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [manufacturerId, manufacturerList]);

  const {
    items: imageItems,
    uploadingImages,
    submitBlocker: imageSubmitBlocker,
    handleFileUpload,
    removeImage,
    retryImage,
    moveImage,
    makeCover,
  } = useListingImageUpload({
    form,
    maxImages: limits?.maxImagesPerListing || 3,
  });

  const onSubmit = async (values: NewListingValues) => {
    // Butonu kapatmak yetmez: Enter ile gönderim ve programatik çağrı da bu
    // kapıdan geçer. Çözümlenmemiş görselle kaydedilen ilan, kullanıcının
    // ekranda gördüğünden eksik görselle yayınlanıyordu.
    if (imageSubmitBlocker) {
      toast.error(t(IMAGE_SUBMIT_BLOCKER_KEY[imageSubmitBlocker.reason]));
      return;
    }
    if (listingLimits && !listingLimits.canCreateListing) {
      toast.error(
        t("product.listingLimitReached", {
          current: listingLimits.currentCount,
          max: listingLimits.maxListings,
        }),
      );
      return;
    }
    if (commissionPreviewLoading) {
      toast.error(t("product.commissionStillCalculating"));
      return;
    }
    if (!commissionPreview || commissionPreviewError) {
      toast.error(t("product.commissionRuleUnavailable"));
      return;
    }

    try {
      const customAttributeSlugs = Object.values(values.customAttributes)
        .flat()
        .filter(Boolean);

      const payload = {
        title: values.title,
        description: values.description || undefined,
        price: Number(values.price),
        categoryId: values.categoryId,
        condition: values.condition,
        brandId: values.brandId || undefined,
        carModelId: values.carModelId || undefined,
        modelCode: values.modelCode.trim() || undefined,
        color: values.color,
        scale: values.scale || undefined,
        material: values.material || undefined,
        manufacturerId: values.manufacturerId || undefined,
        isBoxed: values.isBoxed === "boxed",
        year: values.year ? Number(values.year) : undefined,
        isTradeEnabled: values.isTradeEnabled,
        isPreorder: false,
        isSet: values.isSet,
        bundleSize:
          values.isSet && Number(values.bundleSize) >= 2
            ? Number(values.bundleSize)
            : undefined,
        quantity: values.quantity !== "" ? Number(values.quantity) : 1,
        ...saleDataToPayload(saleData, Number(values.price)),
        shippingPackageTier: values.shippingPackageTier,
        images: values.images.length > 0 ? values.images : undefined,
        attributes:
          customAttributeSlugs.length > 0 ? customAttributeSlugs : undefined,
      };

      await listingsApi.create(payload as any);
      toast.success(t("product.listingCreated"));
      await refreshUser();
      await refetchLimits();
      router.push("/profile/listings?status=pending");
    } catch (error: any) {
      if (process.env.NODE_ENV === "development")
        console.error("Failed to create listing:", error);
      const raw =
        error.response?.data?.message ??
        error.response?.data?.error ??
        error.message;
      const msg = Array.isArray(raw) ? raw.join(" • ") : raw;
      const fallback = t("product.failedToCreateListing");
      toast.error(typeof msg === "string" && msg ? msg : fallback);
    }
  };

  return {
    locale,
    router,
    isAuthenticated,
    authLoading,
    limits,
    // form
    form,
    onSubmit,
    uploadingImages,
    imageSubmitBlocker,
    imageItems,
    retryImage,
    moveImage,
    makeCover,
    CONDITIONS,
    yearOptions,
    // catalog data
    flatCategories,
    scaleList,
    materialList,
    brands,
    brandsLoading,
    models,
    modelsLoading,
    manufacturerList,
    manufacturerAttrGroups,
    saleData,
    setSaleData,
    showDiscountSection,
    setShowDiscountSection,
    listingLimits,
    limitsLoading,
    commissionPreview,
    commissionPreviewLoading,
    commissionPreviewError,
    hasBankAccount,
    bankAccountLoading,
    // actions
    handleFileUpload,
    removeImage,
  };
}

type NewListingValue = ReturnType<typeof useNewListingValue> & {
  form: UseFormReturn<NewListingValues>;
};

const NewListingContext = createContext<NewListingValue | null>(null);

export function NewListingProvider({ children }: { children: ReactNode }) {
  const value = useNewListingValue();
  return (
    <NewListingContext.Provider value={value}>
      {children}
    </NewListingContext.Provider>
  );
}

export function useNewListing() {
  const ctx = useContext(NewListingContext);
  if (!ctx)
    throw new Error("useNewListing must be used within a NewListingProvider");
  return ctx;
}
