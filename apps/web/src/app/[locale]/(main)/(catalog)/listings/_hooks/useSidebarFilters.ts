"use client";

import { useEffect, useMemo, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { keepAttributeGroups } from "@tarodan/listing-form";
import { queryKeys } from "@/lib/query/keys";
import { useLocale, useTranslations } from "next-intl";
import { categoriesApi, manufacturersApi, listingsApi } from "@/lib/api";
import { matchesSearch } from "@tarodan/ui";
import type { Filters } from "../_lib/params";
import {
  useListingFiltersQuery,
  type CustomAttributeGroup,
} from "./useListingFiltersQuery";

interface Category {
  id: string;
  name: string;
  slug: string;
}

interface ManufacturerItem {
  id: string;
  name: string;
  slug: string;
  _count?: { products: number };
}

const STALE = 60 * 60 * 1000;

export const BASE_SECTIONS = [
  "category",
  "brand",
  "model",
  "scale",
  "material",
  "manufacturer",
  "condition",
  "price",
  "options",
];

/**
 * All data-fetching, filter state and change handlers for the listings sidebar.
 * Keeps `SidebarFilters` a thin presentational component (§4/§7): catalog data
 * comes from shared TanStack Query keys (deduped with the header nav), and the
 * option lists / handlers are derived here from the page-owned `filters`.
 */
export function useSidebarFilters({
  filters,
  onFilterChange,
}: {
  filters: Filters;
  onFilterChange: (filters: Filters) => void;
}) {
  const t = useTranslations();
  const locale = useLocale();

  const [customAttrSearch, setCustomAttrSearch] = useState<
    Record<string, string>
  >({});

  // Open accordion sections (controlled so async-loaded custom groups open too).
  const [openSections, setOpenSections] = useState<string[]>(BASE_SECTIONS);

  // Catalog data via TanStack Query — shared cache keys dedupe with the header
  // nav and across mounts (replaces the old per-mount useEffect fetches).
  const categoriesQuery = useQuery({
    queryKey: queryKeys.categories.all(),
    queryFn: async (): Promise<Category[]> => {
      const res = await categoriesApi.findAll();
      return Array.isArray(res.data) ? res.data : (res.data?.data ?? []);
    },
    staleTime: STALE,
  });
  const categories = categoriesQuery.data ?? [];

  const manufacturersQuery = useQuery({
    queryKey: queryKeys.manufacturers.list(),
    queryFn: async (): Promise<ManufacturerItem[]> => {
      const res = await manufacturersApi.findAll();
      return Array.isArray(res.data) ? res.data : (res.data?.data ?? []);
    },
    staleTime: STALE,
  });
  const manufacturerList = useMemo(
    () => manufacturersQuery.data ?? [],
    [manufacturersQuery.data],
  );

  const filtersQuery = useListingFiltersQuery();
  const scaleList = filtersQuery.data?.scales ?? [];
  const materialList = filtersQuery.data?.materials ?? [];
  const colorList = filtersQuery.data?.colors ?? [];
  const carModelList = filtersQuery.data?.carModels ?? [];
  const brandList = useMemo(
    () =>
      (filtersQuery.data?.brands ?? []).map((b) =>
        typeof b === "string"
          ? { id: "", name: b, slug: b.toLowerCase().replace(/\s+/g, "-") }
          : b,
      ),
    [filtersQuery.data],
  );

  // The selected manufacturer's slug (DB-authoritative) adds its scoped
  // attribute groups on top of the global custom groups (which the base
  // filters request already carries, manufacturer or not).
  const manufacturerSlug = useMemo(() => {
    if (filters.manufacturerId)
      return manufacturerList.find((m) => m.id === filters.manufacturerId)
        ?.slug;
    if (filters.manufacturer)
      return manufacturerList.find(
        (m) => m.name.toLowerCase() === filters.manufacturer!.toLowerCase(),
      )?.slug;
    return undefined;
  }, [filters.manufacturerId, filters.manufacturer, manufacturerList]);

  const scopedAttrGroupsQuery = useQuery({
    queryKey: queryKeys.listings.scopedAttrGroups(manufacturerSlug ?? ""),
    queryFn: async (): Promise<CustomAttributeGroup[]> => {
      const res = await listingsApi.getFilters({
        manufacturer: manufacturerSlug,
      });
      return (
        (res.data as { customAttributes?: CustomAttributeGroup[] })
          .customAttributes ?? []
      );
    },
    enabled: !!manufacturerSlug,
    placeholderData: keepPreviousData,
    staleTime: STALE,
  });
  // Üreticisiz durumda ek istek yok: genel gruplar temel filtre yanıtında.
  // `keepPreviousData` üretici A→B geçişinde A'nın yanıtını gösterir; A'ya
  // bağlı gruplar B'nin başlığı altında çıkmasın diye kapsamlı gruplar seçili
  // üreticiye göre süzülür, genel gruplar her zaman kalır.
  const globalAttrGroups = filtersQuery.data?.customAttributes;
  const customAttrGroups = useMemo(
    () =>
      manufacturerSlug
        ? (scopedAttrGroupsQuery.data ?? globalAttrGroups ?? []).filter(
            (g) =>
              g.manufacturerSlug == null ||
              g.manufacturerSlug === manufacturerSlug,
          )
        : (globalAttrGroups ?? []),
    [manufacturerSlug, scopedAttrGroupsQuery.data, globalAttrGroups],
  );

  // Open custom-attribute groups by default once they load.
  useEffect(() => {
    if (customAttrGroups.length === 0) return;
    setOpenSections((prev) => [
      ...new Set([
        ...prev,
        ...customAttrGroups.map((g) => `customAttr:${g.slug}`),
      ]),
    ]);
  }, [customAttrGroups]);

  const [brandSearch, setBrandSearch] = useState("");
  const [manufacturerSearch, setManufacturerSearch] = useState("");
  const [modelSearch, setModelSearch] = useState("");
  const [categorySearch, setCategorySearch] = useState("");
  const [scaleSearch, setScaleSearch] = useState("");
  const [materialSearch, setMaterialSearch] = useState("");

  const CONDITIONS = [
    { value: "new", label: t("product.conditionNew") },
    { value: "like_new", label: t("product.conditionLikeNew") },
    { value: "very_good", label: t("product.conditionVeryGood") },
    { value: "good", label: t("product.conditionGood") },
    { value: "fair", label: t("product.conditionFair") },
  ];

  const handleBrandChange = (brandId: string, brandName: string) => {
    const isCurrentlySelected = brandId
      ? filters.brandId === brandId
      : filters.brand === brandName;
    if (isCurrentlySelected) {
      onFilterChange({
        ...filters,
        brandId: "",
        brand: "",
        carModelId: "",
        carModel: "",
      });
    } else {
      onFilterChange({
        ...filters,
        brandId,
        brand: brandName,
        carModelId: "",
        carModel: "",
      });
    }
  };

  const handleCarModelChange = (carModelId: string, carModelName: string) => {
    if (filters.carModelId === carModelId) {
      onFilterChange({ ...filters, carModelId: "", carModel: "" });
    } else {
      onFilterChange({ ...filters, carModelId, carModel: carModelName });
    }
  };

  const handleScaleChange = (scale: string) => {
    onFilterChange({ ...filters, scale: filters.scale === scale ? "" : scale });
  };

  const handleMaterialChange = (materialSlug: string) => {
    onFilterChange({
      ...filters,
      material: filters.material === materialSlug ? "" : materialSlug,
    });
  };

  // Renk çoklu seçim: aynı gruptaki renkler arasında OR uygulanır, bu yüzden
  // seçim tek değer değil liste olarak taşınır.
  const toggleColor = (colorSlug: string) => {
    const current = filters.colors ?? [];
    onFilterChange({
      ...filters,
      colors: current.includes(colorSlug)
        ? current.filter((slug) => slug !== colorSlug)
        : [...current, colorSlug],
    });
  };

  const handleConditionChange = (condition: string) => {
    onFilterChange({
      ...filters,
      condition: filters.condition === condition ? "" : condition,
    });
  };

  const handleManufacturerChange = (
    manufacturerId: string,
    manufacturerName: string,
  ) => {
    // Üretici değişince onun gruplarındaki seçimler düşer; genel özel grup
    // seçimleri (Nadirlik gibi) üreticiden bağımsızdır ve kalır.
    const customAttributes = keepAttributeGroups(
      filters.customAttributes,
      customAttrGroups
        .filter((g) => g.manufacturerSlug == null)
        .map((g) => g.slug),
    );
    if (filters.manufacturerId === manufacturerId) {
      onFilterChange({
        ...filters,
        manufacturerId: "",
        manufacturer: "",
        customAttributes,
      });
    } else {
      onFilterChange({
        ...filters,
        manufacturerId,
        manufacturer: manufacturerName,
        customAttributes,
      });
    }
  };

  const toggleCustomAttribute = (groupSlug: string, attrSlug: string) => {
    const current = filters.customAttributes?.[groupSlug] ?? [];
    const isSelected = current.includes(attrSlug);
    const nextMap = { ...(filters.customAttributes ?? {}) };
    if (isSelected) {
      const remaining = current.filter((s) => s !== attrSlug);
      if (remaining.length > 0) nextMap[groupSlug] = remaining;
      else delete nextMap[groupSlug];
    } else {
      nextMap[groupSlug] = [...current, attrSlug];
    }
    onFilterChange({ ...filters, customAttributes: nextMap });
  };

  const handleCategoryChange = (categoryId: string, categoryName: string) => {
    if (filters.categoryId === categoryId) {
      onFilterChange({ ...filters, categoryId: "", category: "" });
    } else {
      onFilterChange({ ...filters, categoryId, category: categoryName });
    }
  };

  const filteredBrands =
    brandList.length > 0
      ? brandList.filter((b) => matchesSearch(b.name, brandSearch))
      : [];

  const modelsForBrand = carModelList.filter(
    (m) =>
      (!filters.brandId || m.brandId === filters.brandId) &&
      matchesSearch(m.name, modelSearch),
  );

  // Filtre seçenekleri YALNIZ katalogdan gelir — hiçbir koşulda yedek liste
  // yok. Bir zamanlar "liste boşsa" koşuluna bağlıydılar ve boş katalogda
  // olmayan 18 üretici + 5 ölçek + 4 malzeme reklam ediyor, her tıklama sıfır
  // sonuca gidiyordu. Sonra "yalnız istek hata verirse" diye daraltıldı; o da
  // yanlış: ağ hatasında uydurma çip göstermek, hiç göstermemekten kötüdür —
  // kullanıcı seçer, sonuç boş gelir ve hatayı katalogda sanır. Başarılı ama
  // boş yanıt da, başarısız yanıt da "seçenek yok" demektir.
  const displayManufacturers = manufacturerList.filter((m) =>
    matchesSearch(m.name, manufacturerSearch),
  );

  const filteredCategories = categories.filter((c) =>
    matchesSearch(c.name, categorySearch),
  );
  const filteredScales = scaleList.filter((s) => matchesSearch(s, scaleSearch));
  const filteredMaterials = materialList.filter((m) =>
    matchesSearch(m.label, materialSearch),
  );

  return {
    t,
    locale,
    // accordion
    openSections,
    setOpenSections,
    // per-list search state
    brandSearch,
    setBrandSearch,
    manufacturerSearch,
    setManufacturerSearch,
    modelSearch,
    setModelSearch,
    categorySearch,
    setCategorySearch,
    scaleSearch,
    setScaleSearch,
    materialSearch,
    setMaterialSearch,
    customAttrSearch,
    setCustomAttrSearch,
    // option lists
    filteredCategories,
    filteredBrands,
    modelsForBrand,
    filteredScales,
    filteredMaterials,
    colorList,
    displayManufacturers,
    customAttrGroups,
    CONDITIONS,
    // handlers
    handleCategoryChange,
    handleBrandChange,
    handleCarModelChange,
    handleScaleChange,
    handleMaterialChange,
    toggleColor,
    handleManufacturerChange,
    toggleCustomAttribute,
    handleConditionChange,
  };
}
