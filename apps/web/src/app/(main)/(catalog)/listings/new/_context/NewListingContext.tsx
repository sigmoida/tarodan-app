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
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { listingsApi, mediaApi, bankAccountApi } from "@/lib/api";
import { useAuthStore } from "@/stores/authStore";
import { useTranslation } from "@/i18n/LanguageContext";
import { newListingSchema } from "../_lib/schema";
import {
  useCategories,
  useListingFilters,
  useCarModels,
  useManufacturerAttributes,
  useListingLimits,
  useCommissionPreview,
} from "../_hooks/useListingFormQueries";

const getConditions = (locale: string) => [
  { value: "new", label: locale === "en" ? "New" : "Yeni" },
  { value: "like_new", label: locale === "en" ? "Like New" : "Sıfır Gibi" },
  { value: "very_good", label: locale === "en" ? "Very Good" : "Mükemmel" },
  { value: "good", label: locale === "en" ? "Good" : "İyi" },
  { value: "fair", label: locale === "en" ? "Fair" : "Orta" },
];

function useNewListingValue() {
  const router = useRouter();
  const { isAuthenticated, isLoading: authLoading, user, limits, refreshUser } =
    useAuthStore();
  const { locale } = useTranslation();
  const CONDITIONS = getConditions(locale);

  const bankAccountQuery = useQuery({
    queryKey: ["bank-account"],
    queryFn: async () => (await bankAccountApi.get()).data || null,
    enabled: isAuthenticated,
  });
  const hasBankAccount = !!bankAccountQuery.data;
  const bankAccountLoading = bankAccountQuery.isLoading;

  const [isLoading, setIsLoading] = useState(false);
  const currentYear = new Date().getFullYear();
  const yearOptions = Array.from(
    { length: currentYear - 1950 + 1 },
    (_, i) => currentYear - i,
  );

  const [formData, setFormData] = useState({
    title: "",
    description: "",
    price: "",
    categoryId: "",
    condition: "very_good" as string,
    brandId: "",
    carModelId: "",
    scale: "1:64",
    material: "" as string,
    manufacturerId: "" as string,
    year: "" as string | number,
    isTradeEnabled: false,
    isSet: false,
    bundleSize: undefined as number | undefined,
    quantity: 1 as string | number,
    images: [] as Array<{ cardKey: string; detailKey: string }>,
    customAttributes: {} as Record<string, string[]>,
  });
  const [uploadingImages, setUploadingImages] = useState(false);
  const [imagePreviewUrls, setImagePreviewUrls] = useState<string[]>([]);

  // ---- Server data (TanStack Query — _hooks/useListingFormQueries) ----
  const queryEnabled = !authLoading && isAuthenticated;
  const { flatCategories } = useCategories(queryEnabled);
  const {
    scales: scaleList,
    materials: materialList,
    brands,
    manufacturers: manufacturerList,
    isLoading: brandsLoading,
  } = useListingFilters();
  const selectedBrandSlug = brands.find((b) => b.id === formData.brandId)?.slug;
  const { models, isLoading: modelsLoading } = useCarModels(selectedBrandSlug);
  const selectedManufacturerSlug = manufacturerList.find(
    (m) => m.id === formData.manufacturerId,
  )?.slug;
  const { manufacturerAttrGroups } = useManufacturerAttributes(
    selectedManufacturerSlug,
  );
  const { listingLimits, limitsLoading, refetchLimits } = useListingLimits(
    queryEnabled,
    user?.membershipTier || "free",
  );
  const { commissionPreview, commissionPreviewLoading } = useCommissionPreview(
    formData.price,
    formData.categoryId,
  );

  // Restore the draft from localStorage on mount.
  useEffect(() => {
    const savedFormData = localStorage.getItem("newListingFormData");
    if (!savedFormData) return;
    try {
      const parsed = JSON.parse(savedFormData);
      if (
        parsed.title ||
        parsed.description ||
        parsed.price ||
        parsed.quantity !== undefined ||
        parsed.images?.length > 0 ||
        parsed.imageUrls?.length > 0
      ) {
        const images =
          parsed.images ??
          parsed.imageUrls?.map((k: string) =>
            typeof k === "string" ? { cardKey: k, detailKey: k } : k,
          ) ??
          [];
        setFormData((prev) => ({
          ...prev,
          ...parsed,
          images: Array.isArray(images) ? images : [],
          quantity:
            parsed.quantity !== undefined &&
            parsed.quantity !== null &&
            parsed.quantity !== ""
              ? Number(parsed.quantity)
              : "",
        }));

        if (images?.length > 0) {
          const restorePreviewUrls = async () => {
            const previewUrls: string[] = [];
            for (const img of images) {
              const key =
                img?.cardKey ??
                img?.detailKey ??
                (typeof img === "string" ? img : null);
              if (key && (key.includes("dev/") || key.includes("prod/"))) {
                try {
                  const response = await mediaApi.getPublicUrl(key);
                  previewUrls.push(response.data.url);
                } catch {
                  previewUrls.push(
                    "https://placehold.co/200x200/f3f4f6/9ca3af?text=Resim",
                  );
                }
              } else if (typeof img === "object" && (img as any).cardUrl) {
                previewUrls.push((img as any).cardUrl);
              } else {
                previewUrls.push(
                  "https://placehold.co/200x200/f3f4f6/9ca3af?text=Resim",
                );
              }
            }
            setImagePreviewUrls(previewUrls);
          };
          restorePreviewUrls();
        }
      }
    } catch (e) {
      if (process.env.NODE_ENV === "development")
        console.error("Failed to parse saved form data:", e);
    }
  }, []);

  // Persist the draft (debounced).
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      const dataToSave = {
        ...formData,
        quantity:
          formData.quantity !== undefined &&
          formData.quantity !== null &&
          formData.quantity !== ""
            ? String(formData.quantity)
            : "",
      };
      localStorage.setItem("newListingFormData", JSON.stringify(dataToSave));
    }, 300);
    return () => clearTimeout(timeoutId);
  }, [formData]);

  // Auth gate: redirect out if signed out, else refresh the user once.
  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated) {
      toast.error(
        locale === "en"
          ? "Please login to create a listing"
          : "İlan oluşturmak için giriş yapmalısınız",
      );
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
      manufacturerList.find((m) => m.id === formData.manufacturerId)?.id ?? "";
    if (activeAttrManufacturer.current === newKey) return;
    if (
      activeAttrManufacturer.current !== "" &&
      Object.keys(formData.customAttributes).length > 0
    ) {
      setFormData((prev) => ({ ...prev, customAttributes: {} }));
    }
    activeAttrManufacturer.current = newKey;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData.manufacturerId, manufacturerList]);

  const handleFileUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const maxImages = limits?.maxImagesPerListing || 3;
    const remainingSlots = maxImages - formData.images.length;
    if (remainingSlots <= 0) return;
    const filesToUpload = Array.from(files).slice(0, remainingSlots);
    if (filesToUpload.length === 0) return;

    setUploadingImages(true);
    try {
      const response = await mediaApi.uploadProductImages(filesToUpload);
      const uploadedImages = response.data.map(
        (r: { cardKey: string; detailKey: string }) => ({
          cardKey: r.cardKey,
          detailKey: r.detailKey,
        }),
      );
      const previewUrls = response.data
        .map(
          (r: { cardUrl?: string; cardKey?: string }) =>
            r.cardUrl || r.cardKey || "",
        )
        .filter(Boolean);
      setFormData((prev) => ({
        ...prev,
        images: [...prev.images, ...uploadedImages],
      }));
      setImagePreviewUrls((prev) => [...prev, ...previewUrls]);
      toast.success(`${uploadedImages.length} resim başarıyla yüklendi`);
    } catch (error: any) {
      if (process.env.NODE_ENV === "development")
        console.error("Failed to upload images:", error);
      toast.error(error.response?.data?.message || "Resim yükleme başarısız");
    } finally {
      setUploadingImages(false);
    }
  };

  const removeImage = (index: number) => {
    setFormData((prev) => ({
      ...prev,
      images: prev.images.filter((_, i) => i !== index),
    }));
    setImagePreviewUrls((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const parsed = newListingSchema(locale).safeParse({
      title: formData.title,
      categoryId: formData.categoryId,
      price: String(formData.price ?? ""),
      images: formData.images,
    });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0].message);
      return;
    }

    if (listingLimits && !listingLimits.canCreateListing) {
      toast.error(
        `İlan limitinize ulaştınız (${listingLimits.currentCount}/${listingLimits.maxListings}). Üyeliğinizi yükselterek daha fazla ilan oluşturabilirsiniz.`,
      );
      return;
    }

    setIsLoading(true);
    try {
      const customAttributeSlugs = Object.values(formData.customAttributes)
        .flat()
        .filter(Boolean);

      const payload = {
        title: formData.title,
        description: formData.description || undefined,
        price: Number(formData.price),
        categoryId: formData.categoryId,
        condition: formData.condition,
        brandId: formData.brandId || undefined,
        carModelId: formData.carModelId || undefined,
        scale: formData.scale || undefined,
        material: formData.material || undefined,
        manufacturerId: formData.manufacturerId || undefined,
        year: formData.year ? Number(formData.year) : undefined,
        isTradeEnabled: formData.isTradeEnabled,
        isPreorder: false,
        isSet: formData.isSet,
        bundleSize:
          formData.isSet && Number(formData.bundleSize) >= 2
            ? Number(formData.bundleSize)
            : undefined,
        quantity:
          formData.quantity !== "" &&
          formData.quantity !== null &&
          formData.quantity !== undefined
            ? Number(formData.quantity)
            : 1,
        images: formData.images.length > 0 ? formData.images : undefined,
        attributes:
          customAttributeSlugs.length > 0 ? customAttributeSlugs : undefined,
      };

      await listingsApi.create(payload as any);
      toast.success(
        locale === "en"
          ? "Your listing has been created! Pending approval."
          : "İlanınız oluşturuldu! Onay bekliyor.",
      );
      localStorage.removeItem("newListingFormData");
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
      const fallback =
        locale === "en" ? "Failed to create listing" : "İlan oluşturulamadı";
      toast.error(typeof msg === "string" && msg ? msg : fallback);
    } finally {
      setIsLoading(false);
    }
  };

  return {
    locale,
    router,
    isAuthenticated,
    authLoading,
    limits,
    // form state
    formData,
    setFormData,
    isLoading,
    uploadingImages,
    imagePreviewUrls,
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
    listingLimits,
    limitsLoading,
    commissionPreview,
    commissionPreviewLoading,
    hasBankAccount,
    bankAccountLoading,
    // actions
    handleFileUpload,
    removeImage,
    handleSubmit,
  };
}

type NewListingValue = ReturnType<typeof useNewListingValue>;

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
