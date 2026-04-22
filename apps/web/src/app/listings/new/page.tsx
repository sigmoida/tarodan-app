"use client";

import { ButtonLink } from "@/components/ui/ButtonLink";
import { useState, useEffect, useRef } from "react";
import { useRouter, usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { ArrowLeftIcon, PhotoIcon } from "@heroicons/react/24/outline";
import Link from "next/link";
import toast from "react-hot-toast";
import { listingsApi, api, mediaApi, brandsApi } from "@/lib/api";
import { useAuthStore } from "@/stores/authStore";
import { useTranslation } from "@/i18n/LanguageContext";
import { SimpleDropdown } from "@/components/SimpleDropdown";
import { Button, Input, Select, Spinner, Textarea, Toggle } from "@tarodan/ui";

interface Category {
  id: string;
  name: string;
  slug: string;
  children?: Category[];
}

interface Brand {
  id: string;
  name: string;
  slug: string;
}

interface CarModel {
  id: string;
  name: string;
  slug: string;
  brand: {
    slug: string;
  };
}

const getConditions = (locale: string) => [
  { value: "new", label: locale === "en" ? "New" : "Yeni" },
  { value: "like_new", label: locale === "en" ? "Like New" : "Sıfır Gibi" },
  { value: "very_good", label: locale === "en" ? "Very Good" : "Mükemmel" },
  { value: "good", label: locale === "en" ? "Good" : "İyi" },
  { value: "fair", label: locale === "en" ? "Fair" : "Orta" },
];

const getOtherLabel = (locale: string) => (locale === "en" ? "Other" : "Diğer");

interface ListingLimits {
  currentCount: number;
  maxListings: number;
  canCreateListing: boolean;
  isPremium: boolean;
  membershipTier: string;
  remainingListings: number;
}

export default function NewListingPage() {
  const router = useRouter();
  const pathname = usePathname();
  const {
    isAuthenticated,
    isLoading: authLoading,
    user,
    limits,
    canCreateListing,
    getRemainingListings,
    refreshUser,
  } = useAuthStore();
  const { t, locale } = useTranslation();
  const CONDITIONS = getConditions(locale);
  const OTHER_LABEL = getOtherLabel(locale);
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [listingLimits, setListingLimits] = useState<ListingLimits | null>(
    null,
  );
  const [limitsLoading, setLimitsLoading] = useState(true);
  const prevPathnameRef = useRef<string | null>(null);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [brandsLoading, setBrandsLoading] = useState(true);
  const [models, setModels] = useState<CarModel[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [scaleList, setScaleList] = useState<string[]>([]);
  const [materialList, setMaterialList] = useState<
    Array<{ slug: string; label: string }>
  >([]);
  const [manufacturerList, setManufacturerList] = useState<
    Array<{ id: string; name: string; slug: string }>
  >([]);
  const currentYear = new Date().getFullYear();
  const yearOptions = Array.from(
    { length: currentYear - 1950 + 1 },
    (_, i) => currentYear - i,
  ); // 2025..1950

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
    quantity: "" as string | number,
    images: [] as Array<{ cardKey: string; detailKey: string }>,
  });
  const [uploadingImages, setUploadingImages] = useState(false);
  // Store preview URLs (cardUrl from upload response for display)
  const [imagePreviewUrls, setImagePreviewUrls] = useState<string[]>([]);
  const [commissionPreview, setCommissionPreview] = useState<{
    sellerFeeAmount: number;
    sellerNetAmount: number;
  } | null>(null);
  const [commissionPreviewLoading, setCommissionPreviewLoading] =
    useState(false);

  // Load form data from localStorage on mount
  useEffect(() => {
    const savedFormData = localStorage.getItem("newListingFormData");
    if (savedFormData) {
      try {
        const parsed = JSON.parse(savedFormData);
        // Only restore if we have meaningful data
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
            // Ensure quantity is properly handled (empty string for unlimited, number for stock)
            quantity:
              parsed.quantity !== undefined &&
              parsed.quantity !== null &&
              parsed.quantity !== ""
                ? Number(parsed.quantity)
                : "",
          }));

          // Restore preview URLs from images (cardKey -> public URL via API or placeholder)
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
                    const parts = key.split("/");
                    const bucket = parts[1] || "products";
                    const keyPath = parts.slice(2).join("/");
                    const response = await api.get(
                      `/storage/presigned/${bucket}/${keyPath}`,
                    );
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
    }
  }, []);

  // Commission preview when price/category change (for seller: estimated fee and net)
  useEffect(() => {
    const amount = Number(formData.price);
    if (Number.isNaN(amount) || amount < 0) {
      setCommissionPreview(null);
      return;
    }
    let cancelled = false;
    setCommissionPreviewLoading(true);
    api
      .get("/orders/commission-preview", {
        params: {
          amount: formData.price,
          categoryId: formData.categoryId || undefined,
        },
      })
      .then((res) => {
        if (!cancelled && res.data) {
          setCommissionPreview({
            sellerFeeAmount: Number(res.data.sellerFeeAmount ?? 0),
            sellerNetAmount: Number(res.data.sellerNetAmount ?? 0),
          });
        }
      })
      .catch(() => {
        if (!cancelled) setCommissionPreview(null);
      })
      .finally(() => {
        if (!cancelled) setCommissionPreviewLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [formData.price, formData.categoryId]);

  // Save form data to localStorage whenever it changes (debounced)
  useEffect(() => {
    // Always save form data, including quantity (even if empty string for unlimited stock)
    const timeoutId = setTimeout(() => {
      // Ensure quantity is always saved as string (empty string = unlimited)
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
    }, 300); // Debounce to avoid too many writes

    return () => clearTimeout(timeoutId);
  }, [formData]);

  useEffect(() => {
    // Wait for auth to finish loading before checking authentication
    if (authLoading) {
      return;
    }

    if (!isAuthenticated) {
      toast.error(
        locale === "en"
          ? "Please login to create a listing"
          : "İlan oluşturmak için giriş yapmalısınız",
      );
      router.push("/login?redirect=/listings/new");
      return;
    }

    fetchCategories();
    // Refresh user data first, then update limits
    refreshUser().then(() => {
      updateListingLimits();
    });
  }, [isAuthenticated, authLoading]);

  // Update limits whenever user or limits change
  useEffect(() => {
    if (user && limits) {
      updateListingLimits();
    }
  }, [user, limits]);

  // Refresh listing limits when pathname changes (e.g., returning from edit/delete page)
  useEffect(() => {
    if (
      prevPathnameRef.current !== null &&
      prevPathnameRef.current !== pathname &&
      pathname === "/listings/new" &&
      user
    ) {
      // Page was navigated to, refresh user data and limits
      refreshUser().then(() => {
        updateListingLimits();
      });
    }
    prevPathnameRef.current = pathname;
  }, [pathname, user]);

  // Refresh listing limits when page becomes visible (e.g., after returning from deleting a listing)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible" && user) {
        refreshUser().then(() => {
          updateListingLimits();
        });
      }
    };

    const handleFocus = () => {
      if (user) {
        refreshUser().then(() => {
          updateListingLimits();
        });
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("focus", handleFocus);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("focus", handleFocus);
    };
  }, [user]);

  const updateListingLimits = async () => {
    setLimitsLoading(true);
    try {
      // Fetch real listing stats from API with cache busting
      const response = await api.get("/products/my/stats", {
        params: { _t: Date.now() },
      });
      const stats = response.data;

      const tierName = stats.limits?.tierName || "Free";
      const tierType = stats.limits?.tierType || "free";
      const isPremium = tierType === "premium" || tierType === "business";
      const maxListings = stats.summary?.max || 10;
      const currentCount = stats.summary?.used || 0;
      const remaining = stats.summary?.remaining || 0;
      const canCreate = stats.summary?.canCreate ?? true;

      setListingLimits({
        currentCount,
        maxListings,
        canCreateListing: canCreate,
        isPremium,
        membershipTier: tierName,
        remainingListings: remaining,
      });
    } catch (error: any) {
      if (process.env.NODE_ENV === "development")
        console.error("Failed to update listing limits:", error);
      // Fallback to auth store data
      const membershipTier = user?.membershipTier || "free";
      const currentCount = user?.listingCount || 0;
      const maxListings = limits?.maxListings ?? 10;
      const isPremium =
        membershipTier === "premium" || membershipTier === "business";
      const isUnlimited = maxListings === -1;

      setListingLimits({
        currentCount,
        maxListings: isUnlimited ? -1 : maxListings,
        canCreateListing: isUnlimited || currentCount < maxListings,
        isPremium,
        membershipTier,
        remainingListings: isUnlimited ? -1 : maxListings - currentCount,
      });
    } finally {
      setLimitsLoading(false);
    }
  };

  const fetchModels = async (brandSlug: string) => {
    setModelsLoading(true);
    setModels([]);
    try {
      const response = await api.get(`/car-models?brand=${brandSlug}`);
      const data = Array.isArray(response.data)
        ? response.data
        : response.data?.data || [];
      setModels(data);
    } catch (error) {
      console.error("Failed to fetch models:", error);
      toast.error(
        locale === "en" ? "Failed to load models" : "Modeller yüklenemedi",
      );
    } finally {
      setModelsLoading(false);
    }
  };

  useEffect(() => {
    const fetchFilters = async () => {
      setBrandsLoading(true);
      try {
        const response = await listingsApi.getFilters();
        const data = response.data as {
          scales?: string[];
          materials?: Array<{ slug: string; label: string }>;
          brands?: Array<{ id: string; name: string; slug: string }>;
          manufacturers?: Array<{ id: string; name: string; slug: string }>;
        };
        if (data.scales?.length) setScaleList(data.scales);
        if (data.materials?.length) setMaterialList(data.materials);
        if (data.brands?.length) setBrands(data.brands);
        if (data.manufacturers?.length) setManufacturerList(data.manufacturers);
        if (!data.brands?.length) {
          const brandsRes = await brandsApi.findAll();
          const raw = brandsRes.data;
          const list = Array.isArray(raw)
            ? raw
            : (raw as { data?: unknown[] })?.data || [];
          if (list.length)
            setBrands(
              list as Array<{ id: string; name: string; slug: string }>,
            );
        }
      } catch (error) {
        if (process.env.NODE_ENV === "development")
          console.error("Failed to fetch filters:", error);
        try {
          const brandsRes = await brandsApi.findAll();
          const raw = brandsRes.data;
          const list = Array.isArray(raw)
            ? raw
            : (raw as { data?: unknown[] })?.data || [];
          if (list.length)
            setBrands(
              list as Array<{ id: string; name: string; slug: string }>,
            );
        } catch (_) {}
        toast.error(
          locale === "en" ? "Failed to load filters" : "Filtreler yüklenemedi",
        );
      } finally {
        setBrandsLoading(false);
      }
    };
    fetchFilters();
  }, []);

  useEffect(() => {
    if (formData.brandId) {
      const selectedBrand = brands.find((b) => b.id === formData.brandId);
      if (selectedBrand) {
        fetchModels(selectedBrand.slug);
      }
    } else {
      setModels([]);
    }
  }, [formData.brandId, brands]);

  const fetchCategories = async () => {
    try {
      const response = await api.get("/categories");
      const cats = response.data.data || response.data || [];
      setCategories(cats);
    } catch (error) {
      if (process.env.NODE_ENV === "development")
        console.error("Failed to fetch categories:", error);
      toast.error(
        locale === "en"
          ? "Failed to load categories"
          : "Kategoriler yüklenemedi",
      );
    }
  };

  const flattenCategories = (cats: Category[]): Category[] => {
    const result: Category[] = [];
    cats.forEach((cat) => {
      result.push(cat);
      if (cat.children && cat.children.length > 0) {
        result.push(...flattenCategories(cat.children));
      }
    });
    return result;
  };

  // Filter out brand and scale categories since we have separate fields for those
  const filterCategoryDuplicates = (cats: Category[]): Category[] => {
    // Brand names to exclude from categories (these are in the Brand dropdown)
    const brandSlugs = [
      "hot-wheels",
      "hot-wheels-premium",
      "hot-wheels-rlc",
      "matchbox",
      "tomica",
      "tomica-limited-vintage",
      "majorette",
      "m2-machines",
      "greenlight",
      "johnny-lightning",
    ];
    // Scale slugs to exclude (these are in the Scale dropdown)
    const scaleSlugs = ["scale-118", "scale-124", "scale-143", "scale-164"];

    return cats.filter((cat) => {
      const slug = cat.slug.toLowerCase();
      // Keep if not a brand or scale category
      return !brandSlugs.includes(slug) && !scaleSlugs.includes(slug);
    });
  };

  const handleFileUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    const maxImages = limits?.maxImagesPerListing || 3;
    const currentCount = formData.images.length;
    const remainingSlots = maxImages - currentCount;

    // Eğer yer yoksa sessizce çık (input zaten disabled olmalı)
    if (remainingSlots <= 0) return;

    // Sadece kalan slot kadar resim al, fazlasını sessizce yoksay
    const filesToUpload = Array.from(files).slice(0, remainingSlots);

    if (filesToUpload.length === 0) return;

    setUploadingImages(true);
    try {
      const response = await mediaApi.uploadProductImages(filesToUpload);

      const uploadedImages = response.data.map(
        (r: {
          cardKey: string;
          detailKey: string;
          cardUrl?: string;
          detailUrl?: string;
        }) => ({
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

      setFormData({
        ...formData,
        images: [...formData.images, ...uploadedImages],
      });
      setImagePreviewUrls([...imagePreviewUrls, ...previewUrls]);
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
    setFormData({
      ...formData,
      images: formData.images.filter((_, i) => i !== index),
    });
    setImagePreviewUrls(imagePreviewUrls.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.title || !formData.price || !formData.categoryId) {
      toast.error(
        locale === "en"
          ? "Please fill in all required fields"
          : "Lütfen tüm zorunlu alanları doldurun",
      );
      return;
    }

    if (isNaN(Number(formData.price)) || Number(formData.price) < 1) {
      toast.error(
        locale === "en"
          ? "Please enter a valid price"
          : "Geçerli bir fiyat giriniz",
      );
      return;
    }

    // Check listing limit
    if (listingLimits && !listingLimits.canCreateListing) {
      toast.error(
        `İlan limitinize ulaştınız (${listingLimits.currentCount}/${listingLimits.maxListings}). Üyeliğinizi yükselterek daha fazla ilan oluşturabilirsiniz.`,
      );
      return;
    }

    setIsLoading(true);
    try {
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
        quantity:
          formData.quantity !== "" &&
          formData.quantity !== null &&
          formData.quantity !== undefined
            ? Number(formData.quantity)
            : undefined, // undefined = unlimited stock
        images: formData.images.length > 0 ? formData.images : undefined,
      };

      await listingsApi.create(payload as any);
      toast.success(
        locale === "en"
          ? "Your listing has been created! Pending approval."
          : "İlanınız oluşturuldu! Onay bekliyor.",
      );

      // Clear saved form data after successful submission
      localStorage.removeItem("newListingFormData");

      // Refresh user data and listing limits to update the count
      await refreshUser();
      await updateListingLimits();

      router.push("/profile/listings?status=pending");
    } catch (error: any) {
      if (process.env.NODE_ENV === "development")
        console.error("Failed to create listing:", error);
      const msg =
        error.response?.data?.message ??
        error.response?.data?.error ??
        error.message;
      const fallback =
        locale === "en" ? "Failed to create listing" : "İlan oluşturulamadı";
      toast.error(typeof msg === "string" ? msg : fallback);
    } finally {
      setIsLoading(false);
    }
  };

  const flatCategories = filterCategoryDuplicates(
    flattenCategories(categories),
  );

  // Show loading state while auth is being checked
  if (authLoading) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center">
        <Spinner size="xl" />
      </div>
    );
  }

  // Redirect if not authenticated (this should be handled by useEffect, but just in case)
  if (!isAuthenticated) {
    return null; // useEffect will handle redirect
  }

  return (
    <div className="min-h-screen bg-surface">
      <main className="max-w-3xl mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-8">
        <Link
          href="/listings"
          className="inline-flex items-center gap-2 text-muted hover:text-primary-500 transition-colors mb-6 text-sm"
        >
          <ArrowLeftIcon className="w-4 h-4" />
          İlanlara Dön
        </Link>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div className="mb-6">
            <h1 className="text-xl sm:text-2xl font-bold text-heading">
              Yeni İlan Oluştur
            </h1>
            <p className="text-muted text-sm mt-1">
              Ürününüzü koleksiyoncularla buluşturun
            </p>
          </div>

          {/* Listing Limit Info */}
          {limitsLoading ? (
            <div className="mb-5 p-3 bg-surface rounded animate-pulse">
              <div className="h-4 bg-border-subtle rounded w-1/3"></div>
            </div>
          ) : (
            listingLimits && (
              <div
                className={`mb-5 p-3 rounded border text-sm ${
                  listingLimits.isPremium
                    ? "bg-warning-50 border-warning-200"
                    : listingLimits.canCreateListing
                      ? "bg-success-50 border-success-200"
                      : "bg-danger-50 border-danger-200"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p
                      className={`font-medium ${
                        listingLimits.isPremium
                          ? "text-warning-800"
                          : listingLimits.canCreateListing
                            ? "text-success-800"
                            : "text-danger-800"
                      }`}
                    >
                      {listingLimits.maxListings === -1
                        ? `Mevcut İlan: ${listingLimits.currentCount} (Sınırsız)`
                        : `İlan Hakkı: ${listingLimits.currentCount} / ${listingLimits.maxListings}`}
                    </p>
                    {listingLimits.remainingListings !== -1 && (
                      <p className="text-xs text-muted mt-0.5">
                        Kalan: {listingLimits.remainingListings}
                      </p>
                    )}
                  </div>
                  {!listingLimits.canCreateListing && (
                    <ButtonLink href="/pricing">Premium'a Geç</ButtonLink>
                  )}
                </div>
              </div>
            )
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Section: Basic Info */}
            <div className="bg-surface-elevated rounded border border-border-subtle p-5">
              <h2 className="text-sm font-semibold text-heading uppercase tracking-wide mb-4">
                Temel Bilgiler
              </h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-body mb-1.5">
                    Başlık <span className="text-danger-500">*</span>
                  </label>
                  <Input
                    type="text"
                    value={formData.title}
                    onChange={(e) =>
                      setFormData({ ...formData, title: e.target.value })
                    }
                    className="px-4 py-2.5 border-border rounded text-heading placeholder-subtle"
                    placeholder="Örn: Hot Wheels '69 Camaro Z28"
                    required
                    minLength={5}
                    maxLength={200}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-body mb-1.5">
                    Açıklama
                  </label>
                  <Textarea
                    value={formData.description}
                    onChange={(e) =>
                      setFormData({ ...formData, description: e.target.value })
                    }
                    className="px-4 py-2.5 border-border rounded text-heading placeholder-subtle"
                    placeholder="Ürün hakkında detaylı bilgi..."
                    rows={4}
                    maxLength={5000}
                  />
                </div>
              </div>
            </div>

            {/* Section: Product Details */}
            <div className="bg-surface-elevated rounded border border-border-subtle p-5">
              <h2 className="text-sm font-semibold text-heading uppercase tracking-wide mb-4">
                Ürün Detayları
              </h2>
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-body mb-1">
                    Ürün Tipi <span className="text-danger-500">*</span>
                  </label>
                  <Select
                    value={formData.categoryId}
                    onChange={(e) =>
                      setFormData({ ...formData, categoryId: e.target.value })
                    }
                    required
                  >
                    <option value="">Kategori Seçin</option>
                    {flatCategories.map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.name}
                      </option>
                    ))}
                  </Select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-body mb-1">
                    Ürün Durumu <span className="text-danger-500">*</span>
                  </label>
                  <Select
                    value={formData.condition}
                    onChange={(e) =>
                      setFormData({ ...formData, condition: e.target.value })
                    }
                    required
                  >
                    {CONDITIONS.map((cond) => (
                      <option key={cond.value} value={cond.value}>
                        {cond.label}
                      </option>
                    ))}
                  </Select>
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-4 mt-4">
                <SimpleDropdown
                  label="Marka"
                  value={formData.brandId}
                  onValueChange={(newBrandId) =>
                    setFormData((prev) => ({
                      ...prev,
                      brandId: newBrandId,
                      carModelId: "",
                    }))
                  }
                  options={brands.map((b) => ({ value: b.id, label: b.name }))}
                  placeholder={brandsLoading ? "Yükleniyor..." : "Marka Seçin"}
                  disabled={brandsLoading}
                />

                <SimpleDropdown
                  label="Model"
                  value={formData.carModelId}
                  onValueChange={(carModelId) =>
                    setFormData({ ...formData, carModelId })
                  }
                  options={models.map((m) => ({ value: m.id, label: m.name }))}
                  placeholder={
                    !formData.brandId
                      ? "Önce marka seçin"
                      : modelsLoading
                        ? "Yükleniyor..."
                        : models.length === 0
                          ? "Bu markaya ait model yok"
                          : "Model Seçin"
                  }
                  disabled={!formData.brandId || modelsLoading}
                />

                <div>
                  <label className="block text-sm font-medium text-body mb-1">
                    Ölçek
                  </label>
                  <Select
                    value={formData.scale}
                    onChange={(e) =>
                      setFormData({ ...formData, scale: e.target.value })
                    }
                  >
                    {(scaleList.length > 0
                      ? scaleList
                      : ["1:18", "1:24", "1:43", "1:64", "1:87"]
                    ).map((scale) => (
                      <option key={scale} value={scale}>
                        {scale}
                      </option>
                    ))}
                  </Select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-body mb-1">
                    {locale === "en" ? "Material" : "Malzeme"}
                  </label>
                  <Select
                    value={formData.material}
                    onChange={(e) =>
                      setFormData({ ...formData, material: e.target.value })
                    }
                  >
                    <option value="">
                      {locale === "en" ? "Select material" : "Malzeme seçin"}
                    </option>
                    {(materialList.length > 0
                      ? materialList
                      : [
                          { slug: "diecast", label: "Diecast (Metal)" },
                          { slug: "resin", label: "Resin (Reçine)" },
                          { slug: "composite", label: "Composite (Kompozit)" },
                          { slug: "plastic", label: "Plastic (Plastik)" },
                        ]
                    ).map((m) => (
                      <option key={m.slug} value={m.slug}>
                        {m.label}
                      </option>
                    ))}
                  </Select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-body mb-1">
                    {locale === "en" ? "Manufacturer" : "Üretici"}
                  </label>
                  <Select
                    value={formData.manufacturerId}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        manufacturerId: e.target.value,
                      })
                    }
                  >
                    <option value="">
                      {locale === "en"
                        ? "Select manufacturer"
                        : "Üretici seçin"}
                    </option>
                    {manufacturerList.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </Select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-body mb-1">
                    {locale === "en" ? "Release year" : "Çıkış yılı"}
                  </label>
                  <Select
                    value={formData.year}
                    onChange={(e) =>
                      setFormData({ ...formData, year: e.target.value })
                    }
                  >
                    <option value="">
                      {locale === "en" ? "Select year" : "Yıl seçin"}
                    </option>
                    {yearOptions.map((y) => (
                      <option key={y} value={y}>
                        {y}
                      </option>
                    ))}
                  </Select>
                </div>
              </div>
            </div>

            {/* Section: Options */}
            <div className="bg-surface-elevated rounded border border-border-subtle p-5">
              <h2 className="text-sm font-semibold text-heading uppercase tracking-wide mb-4">
                Seçenekler
              </h2>
              <div
                className={`flex items-center justify-between p-3 rounded border ${
                  limits?.canTrade
                    ? "bg-success-50 border-success-200"
                    : "bg-surface border-border"
                }`}
              >
                <div>
                  <label className="font-medium text-heading">
                    Takas Aktif
                  </label>
                  <p className="text-sm text-muted">
                    {limits?.canTrade
                      ? locale === "en"
                        ? "Also makes this product available for trade"
                        : "Bu ürünü takas için de açık tutar"
                      : locale === "en"
                        ? "Trade feature requires Basic or higher membership"
                        : "Takas özelliği Temel veya üstü üyelik gerektirir"}
                  </p>
                </div>
                {limits?.canTrade ? (
                  <Toggle
                    checked={formData.isTradeEnabled}
                    onChange={(val) =>
                      setFormData({ ...formData, isTradeEnabled: val })
                    }
                    size="md"
                  />
                ) : (
                  <Link
                    href="/pricing"
                    className="text-sm text-primary-600 hover:text-primary-700 font-medium"
                  >
                    Premium'a Geç →
                  </Link>
                )}
              </div>

              <div className="flex items-center justify-between p-3 bg-surface rounded border border-border">
                <div>
                  <label className="font-medium text-heading">
                    {locale === "en" ? "Set / Bundle" : "Set / Paket"}
                  </label>
                  <p className="text-sm text-muted">
                    {locale === "en"
                      ? "Multiple models in one listing (e.g. 5-pack, garage set)"
                      : "Tek ilanda birden fazla model (örn. 5'li paket, garaj seti)"}
                  </p>
                </div>
                <Button
                  variant="secondary"
                  type="button"
                  onClick={() =>
                    setFormData({ ...formData, isSet: !formData.isSet })
                  }
                  className={`relative w-14 h-8 rounded-full transition-colors ${formData.isSet ? "bg-info-500" : "bg-border-strong"}`}
                >
                  <span
                    className={`absolute top-1 left-1 w-6 h-6 bg-surface-elevated rounded-full shadow transition-transform ${formData.isSet ? "translate-x-6" : "translate-x-0"}`}
                  />
                </Button>
              </div>
            </div>

            {/* Section: Price & Quantity */}
            <div className="bg-surface-elevated rounded border border-border-subtle p-5">
              <h2 className="text-sm font-semibold text-heading uppercase tracking-wide mb-4">
                Fiyatlandırma
              </h2>
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-body mb-1.5">
                    Fiyat (₺) <span className="text-danger-500">*</span>
                  </label>
                  <Input
                    type="number"
                    value={formData.price}
                    onChange={(e) =>
                      setFormData({ ...formData, price: e.target.value })
                    }
                    className="px-4 py-2.5 border-border rounded text-heading placeholder-subtle"
                    placeholder="0.00"
                    required
                    min={1}
                    max={9999999}
                    step="0.01"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-body mb-1.5">
                    Stok Miktarı
                  </label>
                  <Input
                    type="number"
                    value={
                      formData.quantity === "" ||
                      formData.quantity === null ||
                      formData.quantity === undefined
                        ? ""
                        : formData.quantity
                    }
                    onChange={(e) => {
                      const value = e.target.value;
                      setFormData({
                        ...formData,
                        quantity: value === "" ? "" : Number(value),
                      });
                    }}
                    className="px-4 py-2.5 border-border rounded text-heading placeholder-subtle"
                    placeholder={locale === "en" ? "Unlimited" : "Sınırsız"}
                    min={1}
                  />
                  <p className="text-xs text-subtle mt-1">
                    {locale === "en"
                      ? "Leave empty for unlimited stock"
                      : "Boş bırakırsanız sınırsız stok"}
                  </p>
                </div>
              </div>
              {(commissionPreviewLoading || commissionPreview) && (
                <div className="mt-4 p-3 bg-surface rounded-lg border border-border-subtle text-sm">
                  <p className="text-muted font-medium mb-1">
                    {locale === "en"
                      ? "Estimated (per sale)"
                      : "Tahmini (satış başına)"}
                  </p>
                  {commissionPreviewLoading ? (
                    <span className="text-subtle">
                      {locale === "en" ? "Calculating..." : "Hesaplanıyor..."}
                    </span>
                  ) : commissionPreview ? (
                    <div className="flex flex-wrap gap-x-4 gap-y-1">
                      <span className="text-muted">
                        {locale === "en"
                          ? "Platform deduction"
                          : "Platform kesintisi"}
                        : ₺
                        {commissionPreview.sellerFeeAmount.toLocaleString(
                          "tr-TR",
                          {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          },
                        )}
                      </span>
                      <span className="text-success-700 font-medium">
                        {locale === "en" ? "Net to you" : "Net kazanç"}: ₺
                        {commissionPreview.sellerNetAmount.toLocaleString(
                          "tr-TR",
                          {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          },
                        )}
                      </span>
                    </div>
                  ) : null}
                </div>
              )}
            </div>

            {/* Section: Images */}
            <div className="bg-surface-elevated rounded border border-border-subtle p-5">
              <h2 className="text-sm font-semibold text-heading uppercase tracking-wide mb-4">
                Görseller
              </h2>
              <div className="space-y-3">
                {formData.images.length < (limits?.maxImagesPerListing || 3) ? (
                  <label className="flex flex-col items-center justify-center gap-2 py-8 border-2 border-dashed border-border rounded cursor-pointer hover:border-primary-400 hover:bg-primary-50/30 transition-colors">
                    <PhotoIcon className="w-8 h-8 text-subtle" />
                    <span className="text-sm text-muted font-medium">
                      {locale === "en"
                        ? "Click to upload images"
                        : "Görsel yüklemek için tıklayın"}
                    </span>
                    <span className="text-xs text-subtle">
                      {formData.images.length} /{" "}
                      {limits?.maxImagesPerListing || 3}{" "}
                      {locale === "en" ? "uploaded" : "yüklendi"}
                    </span>
                    <Input
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={(e) => handleFileUpload(e.target.files)}
                      disabled={uploadingImages}
                      className="hidden"
                    />
                  </label>
                ) : (
                  <div className="py-4 border border-success-200 bg-success-50 rounded text-success-700 text-sm text-center">
                    Maksimum görsel sayısına ulaştınız
                  </div>
                )}
                {uploadingImages && (
                  <p className="text-sm text-primary-600">
                    Resimler yükleniyor...
                  </p>
                )}
                {formData.images.length > 0 && (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2 sm:gap-3">
                    {formData.images.map((img, index) => {
                      const previewUrl =
                        imagePreviewUrls?.[index] ||
                        (typeof img === "object" ? img?.cardKey : img);
                      return (
                        <div
                          key={index}
                          className="relative group aspect-square"
                        >
                          <img
                            src={previewUrl}
                            alt={`Preview ${index + 1}`}
                            className="w-full h-full object-cover rounded border border-border"
                            onError={(e) => {
                              (e.target as HTMLImageElement).src =
                                "https://placehold.co/200x200/f3f4f6/9ca3af?text=Resim";
                            }}
                          />
                          <Button
                            variant="secondary"
                            type="button"
                            onClick={() => removeImage(index)}
                            className="absolute top-1 right-1 bg-danger-500 text-inverted rounded-full w-5 h-5 flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            ×
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Submit */}
            <div className="flex gap-3">
              <Button
                type="button"
                variant="secondary"
                size="md"
                className="flex-1"
                onClick={() => router.back()}
              >
                İptal
              </Button>
              <Button
                type="submit"
                variant="primary"
                size="md"
                className="flex-1"
                disabled={isLoading}
              >
                {isLoading
                  ? locale === "en"
                    ? "Creating..."
                    : "Oluşturuluyor..."
                  : locale === "en"
                    ? "Create Listing"
                    : "İlanı Oluştur"}
              </Button>
            </div>
          </form>
        </motion.div>
      </main>
    </div>
  );
}
