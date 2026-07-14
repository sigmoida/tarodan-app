"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query/keys";
import { useLocale, useTranslations } from "next-intl";
import { categoriesApi, manufacturersApi, listingsApi } from "@/lib/api";
import { SCALE_FALLBACK } from "@/lib/constants";
import type { Filters } from "../_lib/params";

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

interface CustomAttributeGroup {
  slug: string;
  name: string;
  manufacturerSlug: string | null;
  attributes: Array<{ slug: string; label: string; color?: string | null }>;
}

interface FiltersData {
  scales?: string[];
  materials?: Array<{ slug: string; label: string }>;
  brands?: Array<string | { id: string; name: string; slug: string }>;
  carModels?: Array<{
    id: string;
    name: string;
    slug: string;
    brandId: string;
  }>;
}

const STALE = 60 * 60 * 1000;

const MATERIAL_FALLBACK = [
  { slug: "diecast", label: "Diecast (Metal)" },
  { slug: "resin", label: "Resin (Reçine)" },
  { slug: "composite", label: "Composite (Kompozit)" },
  { slug: "plastic", label: "Plastic (Plastik)" },
];

// Üreticiler - API'den yüklenecek, bu liste sadece fallback
const MANUFACTURERS_FALLBACK = [
  "Hot Wheels",
  "Matchbox",
  "Majorette",
  "Tomica",
  "Bburago",
  "Maisto",
  "AUTOart",
  "Minichamps",
  "Kyosho",
  "CMC",
  "GT Spirit",
  "Almost Real",
  "Spark",
  "Schuco",
  "Norev",
  "Oxford Diecast",
  "Greenlight",
  "ERTL",
];

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

  const filtersQuery = useQuery({
    queryKey: queryKeys.listings.filters(),
    queryFn: async () => (await listingsApi.getFilters()).data as FiltersData,
    staleTime: STALE,
  });
  const scaleList = filtersQuery.data?.scales ?? [];
  const materialList = filtersQuery.data?.materials ?? [];
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

  // The selected manufacturer's slug (DB-authoritative) drives its scoped
  // attribute groups. No manufacturer selected → no groups.
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

  const customAttrGroupsQuery = useQuery({
    queryKey: queryKeys.manufacturers.customAttrs(manufacturerSlug ?? ""),
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
    staleTime: STALE,
  });
  const customAttrGroups = useMemo(
    () => (manufacturerSlug ? (customAttrGroupsQuery.data ?? []) : []),
    [manufacturerSlug, customAttrGroupsQuery.data],
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
    { value: "new", label: locale === "en" ? "New" : "Yeni" },
    { value: "like_new", label: locale === "en" ? "Like New" : "Yeni Gibi" },
    { value: "very_good", label: locale === "en" ? "Very Good" : "Çok İyi" },
    { value: "good", label: locale === "en" ? "Good" : "İyi" },
    { value: "fair", label: locale === "en" ? "Fair" : "Orta" },
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
    if (filters.manufacturerId === manufacturerId) {
      onFilterChange({
        ...filters,
        manufacturerId: "",
        manufacturer: "",
        customAttributes: {},
      });
    } else {
      onFilterChange({
        ...filters,
        manufacturerId,
        manufacturer: manufacturerName,
        customAttributes: {},
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
      ? brandList.filter((b) =>
          b.name.toLowerCase().includes(brandSearch.toLowerCase()),
        )
      : [];

  const modelsForBrand = carModelList.filter(
    (m) =>
      (!filters.brandId || m.brandId === filters.brandId) &&
      m.name.toLowerCase().includes(modelSearch.toLowerCase()),
  );

  const displayManufacturers =
    manufacturerList.length > 0
      ? manufacturerList.filter((m) =>
          m.name.toLowerCase().includes(manufacturerSearch.toLowerCase()),
        )
      : MANUFACTURERS_FALLBACK.filter((m) =>
          m.toLowerCase().includes(manufacturerSearch.toLowerCase()),
        ).map((name) => ({
          id: "",
          name,
          slug: name.toLowerCase().replace(/\s+/g, "-"),
        }));

  const filteredCategories = categories.filter((c) =>
    c.name.toLowerCase().includes(categorySearch.toLowerCase()),
  );
  const scaleOptions = scaleList.length > 0 ? scaleList : SCALE_FALLBACK;
  const filteredScales = scaleOptions.filter((s) =>
    s.toLowerCase().includes(scaleSearch.toLowerCase()),
  );
  const materialOptions =
    materialList.length > 0 ? materialList : MATERIAL_FALLBACK;
  const filteredMaterials = materialOptions.filter((m) =>
    m.label.toLowerCase().includes(materialSearch.toLowerCase()),
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
    displayManufacturers,
    customAttrGroups,
    CONDITIONS,
    // handlers
    handleCategoryChange,
    handleBrandChange,
    handleCarModelChange,
    handleScaleChange,
    handleMaterialChange,
    handleManufacturerChange,
    toggleCustomAttribute,
    handleConditionChange,
  };
}
