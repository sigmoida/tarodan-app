"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  type ReactNode,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { categoriesApi } from "@/lib/api";
import { queryKeys } from "@/lib/query/keys";
import {
  PAGE_LIMIT,
  detectBrand,
  parseListingsFilters,
  getListingsPage,
  type Filters,
} from "../_lib/params";
import { fetchListingsClient } from "../_lib/data";
import { type ProductLayout } from "../_components/ProductLayoutSelector";

export interface Listing {
  id: string | number;
  title: string;
  price: number;
  originalPrice?: number | null;
  salePrice?: number | null;
  saleStartDate?: string | null;
  saleEndDate?: string | null;
  discountPercent?: number | null;
  isOnSale?: boolean;
  isBoosted?: boolean;
  status?: string | null;
  availableQuantity?: number | null;
  images:
    | Array<{
        id?: string;
        url?: string;
        cardUrl?: string;
        detailUrl?: string;
        sortOrder?: number;
      }>
    | string[];
  brand?:
    | {
        id: string;
        name: string;
        slug: string;
        logo?: string | null;
      }
    | string;
  scale?: string;
  year?: number | string;
  condition: string;
  trade_available?: boolean;
  isTradeEnabled?: boolean;
  rating?: {
    average: number | null;
    count: number;
  };
  viewCount?: number;
  likeCount?: number;
  seller?: {
    id: string | number;
    displayName?: string;
    username?: string;
    rating?: number;
  };
}

interface Pagination {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

interface ListingsContextValue {
  filters: Filters;
  filtersForSidebar: Filters;
  currentPage: number;
  productLayout: ProductLayout;
  setProductLayout: (layout: ProductLayout) => void;
  showMobileSidebar: boolean;
  setShowMobileSidebar: (open: boolean) => void;
  barsHidden: boolean;
  currentSearch: string;
  activeFilterCount: number;
  listings: Listing[];
  pagination: Pagination;
  isLoading: boolean;
  setFilters: (f: Filters) => void;
  setCurrentPage: (page: number) => void;
  handleFiltersChange: (nextFilters: Filters) => void;
  clearFilters: () => void;
}

const ListingsContext = createContext<ListingsContextValue | null>(null);

function useListingsValue(): ListingsContextValue {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [showMobileSidebar, setShowMobileSidebar] = useState(false);
  // Navbar + CategoryNavBar aşağı kaydırınca gizlenir; filtre kutusunun sticky
  // top değerini buna göre ayarla ki çubuklar gizliyken üstte boşluk kalmasın.
  const [barsHidden, setBarsHidden] = useState(false);
  const [productLayout, setProductLayout] = useState<ProductLayout>("grid");
  const [currentPage, setCurrentPage] = useState(() =>
    getListingsPage(new URLSearchParams(searchParams.toString())),
  );
  const pageLimit = PAGE_LIMIT;

  // Initial filters are parsed by the SAME shared function the server page uses,
  // so the first-render query key matches the server's seed (no refetch flash).
  const [filters, setFilters] = useState<Filters>(() =>
    parseListingsFilters(new URLSearchParams(searchParams.toString())),
  );

  const searchString = searchParams.toString();

  const normalizeParams = (p: URLSearchParams): string => {
    const sorted = new URLSearchParams(
      Array.from(p.entries()).sort((a, b) => a[0].localeCompare(b[0])),
    );
    return sorted.toString();
  };

  const buildParamsFromFilters = (f: typeof filters, page: number) => {
    const params = new URLSearchParams();
    if (f.search) params.set("search", f.search);
    if (f.brand) params.set("brand", f.brand);
    if (f.brandId) params.set("brandId", f.brandId);
    if (f.carModel) params.set("carModel", f.carModel);
    if (f.carModelId) params.set("carModelId", f.carModelId);
    if (f.scale) params.set("scale", f.scale);
    if (f.material) params.set("material", f.material);
    if (f.condition) params.set("condition", f.condition);
    if (f.minPrice) params.set("minPrice", f.minPrice);
    if (f.maxPrice) params.set("maxPrice", f.maxPrice);
    if (f.tradeOnly) params.set("tradeOnly", "true");
    if (f.discountOnly) params.set("discountOnly", "true");
    if (f.preOrder) params.set("preOrder", "true");
    if (f.limited) params.set("limited", "true");
    if (f.set) params.set("set", "true");
    if (f.sortBy && f.sortBy !== "relevance") params.set("sortBy", f.sortBy);
    if (f.category) params.set("category", f.category);
    if (f.categoryId) params.set("categoryId", f.categoryId);
    if (f.manufacturer) params.set("manufacturer", f.manufacturer);
    if (f.manufacturerId) params.set("manufacturerId", f.manufacturerId);
    // Encode manufacturer-scoped attribute selections as attr.<groupSlug>=a,b,c
    if (f.customAttributes) {
      for (const [groupSlug, slugs] of Object.entries(f.customAttributes)) {
        if (slugs && slugs.length > 0)
          params.set(`attr.${groupSlug}`, slugs.join(","));
      }
    }
    if (page > 1) params.set("page", page.toString());
    return params;
  };

  const lastScrollY = useRef(0);
  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY;
      setBarsHidden(y > lastScrollY.current && y > 80);
      lastScrollY.current = y;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const hasSyncedToUrl = useRef(false);
  useEffect(() => {
    if (!hasSyncedToUrl.current) {
      hasSyncedToUrl.current = true;
      return;
    }
    const nextParams = buildParamsFromFilters(filters, currentPage);
    const currentParams = new URLSearchParams(searchString);
    if (normalizeParams(nextParams) !== normalizeParams(currentParams)) {
      const nextStr = nextParams.toString();
      const newUrl = nextStr ? `/listings?${nextStr}` : "/listings";
      router.replace(newUrl);
    }
  }, [filters, currentPage]);

  useEffect(() => {
    const newSearch = searchParams.get("search") || "";
    const detectedBrand = detectBrand(newSearch);
    const page = getListingsPage(new URLSearchParams(searchString));
    setCurrentPage(page);

    setFilters((prev) => {
      const next = {
        ...prev,
        search: detectedBrand ? "" : newSearch,
        tradeOnly: searchParams.get("tradeOnly") === "true",
        discountOnly: searchParams.get("discountOnly") === "true",
        preOrder: searchParams.get("preOrder") === "true",
        limited: searchParams.get("limited") === "true",
        set: searchParams.get("set") === "true",
        brand: searchParams.get("brand") || detectedBrand || "",
        brandId: searchParams.get("brandId") || "",
        carModelId: searchParams.get("carModelId") || "",
        carModel: searchParams.get("carModel") || "",
        scale: searchParams.get("scale") || "",
        material: searchParams.get("material") || "",
        condition: searchParams.get("condition") || "",
        minPrice: searchParams.get("minPrice") || "",
        maxPrice: searchParams.get("maxPrice") || "",
        sortBy: searchParams.get("sortBy") || prev.sortBy || "relevance",
        category: searchParams.get("category") || "",
        categoryId: searchParams.get("categoryId") || "",
        manufacturer: searchParams.get("manufacturer") || "",
        manufacturerId: searchParams.get("manufacturerId") || "",
      };
      const changed = (Object.keys(next) as (keyof typeof next)[]).some(
        (k) => prev[k] !== next[k],
      );
      return changed ? next : prev;
    });
  }, [searchString]);

  const categorySlug = filters.category || searchParams.get("category") || "";
  const { data: categoryBySlug } = useQuery({
    queryKey: queryKeys.category.bySlug(categorySlug),
    queryFn: async () => {
      const res = await categoriesApi.findBySlug(categorySlug);
      return res.data as { id: string; name: string; slug: string };
    },
    enabled: !!categorySlug,
    staleTime: 5 * 60 * 1000,
  });
  const resolvedCategoryId =
    searchParams.get("categoryId") || categoryBySlug?.id;

  // Filters for sidebar: merge resolved category when coming from slug (navbar)
  const filtersForSidebar = {
    ...filters,
    categoryId: resolvedCategoryId || filters.categoryId,
    category:
      resolvedCategoryId && categoryBySlug?.name
        ? categoryBySlug.name
        : filters.category,
  };

  const { data: listingsData, isLoading } = useQuery({
    queryKey: queryKeys.listings.list(filters, resolvedCategoryId, currentPage),
    // fetchListingsClient owns buildListApiParams + the /products call + unwrap,
    // the SINGLE source of truth shared with the server seed so the first page matches.
    queryFn: () =>
      fetchListingsClient(filters, resolvedCategoryId, currentPage),
    meta: { page: "listings" },
  });

  const listings: Listing[] = (listingsData?.listings ?? []) as Listing[];
  const pagination: Pagination = (listingsData?.meta as Pagination) ?? {
    total: 0,
    page: currentPage,
    limit: pageLimit,
    totalPages: 1,
  };

  const handleFiltersChange = (nextFilters: typeof filters) => {
    setFilters(nextFilters);
    setCurrentPage(1);
    // URL sync is handled by useEffect [filters, currentPage]
  };

  const clearFilters = () => {
    setFilters({
      search: "",
      brand: "",
      brandId: "",
      carModelId: "",
      carModel: "",
      scale: "",
      material: "",
      condition: "",
      minPrice: "",
      maxPrice: "",
      tradeOnly: false,
      discountOnly: false,
      preOrder: false,
      limited: false,
      set: false,
      sortBy: "relevance",
      category: "",
      categoryId: "",
      manufacturer: "",
      manufacturerId: "",
      customAttributes: {},
    });
    setCurrentPage(1);
    // URL sync is handled by useEffect [filters, currentPage]
  };

  // Read search query directly from URL so display is always in sync regardless of state timing
  const currentSearch = searchParams.get("search") || "";

  // Count active filters; paired keys (e.g. manufacturer+manufacturerId) count as 1.
  // Uses currentSearch (from URL) so the count is accurate even before state syncs.
  const activeFilterCount = (() => {
    const pairs: [string, string][] = [
      ["manufacturer", "manufacturerId"],
      ["brand", "brandId"],
      ["category", "categoryId"],
      ["carModel", "carModelId"],
    ];
    const exclude = new Set(["sortBy", "search"]);
    let count = currentSearch ? 1 : 0;
    const counted = new Set<string>();
    for (const [k, v] of Object.entries(filters)) {
      if (exclude.has(k) || v === "" || v === false) continue;
      const pair = pairs.find(([a, b]) => a === k || b === k);
      if (pair && !counted.has(pair[0] + pair[1])) {
        const hasEither =
          filters[pair[0] as keyof typeof filters] ||
          filters[pair[1] as keyof typeof filters];
        if (hasEither) {
          count += 1;
          counted.add(pair[0] + pair[1]);
        }
      } else if (!pair) {
        if (k === "minPrice" || k === "maxPrice") {
          if (!counted.has("price") && (filters.minPrice || filters.maxPrice)) {
            count += 1;
            counted.add("price");
          }
        } else if (k === "customAttributes") {
          // Count each non-empty custom attribute group (e.g. each Hot Wheels attribute filter).
          if (v && typeof v === "object") {
            for (const sel of Object.values(v as Record<string, string[]>)) {
              if (Array.isArray(sel) && sel.length > 0) count += 1;
            }
          }
        } else {
          count += 1;
        }
      }
    }
    return count;
  })();

  return {
    filters,
    filtersForSidebar,
    currentPage,
    productLayout,
    setProductLayout,
    showMobileSidebar,
    setShowMobileSidebar,
    barsHidden,
    currentSearch,
    activeFilterCount,
    listings,
    pagination,
    isLoading,
    setFilters,
    setCurrentPage,
    handleFiltersChange,
    clearFilters,
  };
}

export function ListingsProvider({ children }: { children: ReactNode }) {
  const value = useListingsValue();
  return (
    <ListingsContext.Provider value={value}>
      {children}
    </ListingsContext.Provider>
  );
}

export function useListings(): ListingsContextValue {
  const ctx = useContext(ListingsContext);
  if (!ctx) {
    throw new Error("useListings must be used within a ListingsProvider");
  }
  return ctx;
}
