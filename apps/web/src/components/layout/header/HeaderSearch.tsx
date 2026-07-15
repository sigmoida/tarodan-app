/** @format */

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  MagnifyingGlassIcon,
  XMarkIcon,
  ArrowRightIcon,
  ShoppingBagIcon,
  TagIcon,
} from "@heroicons/react/24/outline";
import { Button, Chip, IconButton, Input, Spinner } from "@tarodan/ui";
import { useLocale, useTranslations } from "next-intl";
import { isValidImageSrc } from "@/components/OptimizedImage";
import { searchApi } from "@/lib/api";
import { queryKeys } from "@/lib/query/keys";
import { useRecentSearchesStore } from "@/stores/recentSearchesStore";

const POPULAR_SEARCHES = {
  tr: [
    "Hot Wheels",
    "Matchbox",
    "Minichamps",
    "1:18 ölçek",
    "Ferrari",
    "Porsche",
  ],
  en: [
    "Hot Wheels",
    "Matchbox",
    "Minichamps",
    "1:18 scale",
    "Ferrari",
    "Porsche",
  ],
};

// Known entities for smart navigation (popular search -> correct filter param)
const KNOWN_BRANDS = [
  "Audi",
  "Alfa Romeo",
  "BMW",
  "Chevrolet",
  "Dodge",
  "Ferrari",
  "Ford",
  "Honda",
  "Jaguar",
  "Lamborghini",
  "Land Rover",
  "Maserati",
  "McLaren",
  "Mercedes-Benz",
  "Nissan",
  "Porsche",
  "Subaru",
  "Tesla",
  "Toyota",
  "Volkswagen",
];
const KNOWN_MANUFACTURERS = [
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
  "GreenLight Collectibles",
  "Abrex",
  "Airfix",
  "American Diorama",
  "Atlantic",
  "Atlas Editions",
  "Brekina",
  "Britains",
  "Cada",
  "Cararama",
  "Corgi",
  "CMJ - Jian Feng Juan Toys",
  "Cobi",
  "Cult",
  "DeAgostini",
  "Diecast Masters",
  "Ebbro",
  "i0lcek",
  "IXO",
  "Kess",
  "KK Olcek",
  "LCD",
  "Looksmart",
  "Matrix",
  "MINI GT",
  "Mitica",
  "Model Car Group",
  "Motormax",
  "NewRay",
  "OttOmobile",
  "Oxford",
  "Paragon",
  "Pop Race",
  "Olcekxtric",
  "Siku",
  "Solido",
  "Sun Star",
  "Tarmac Works",
  "TopSpeed",
  "Touring",
  "Modelcars",
  "Triple 9 Collection",
  "Trumpeter",
  "Unbranded",
  "Welly",
  "Werk83",
  "WhiteBox",
];
// Improved regex to handle Turkish scale text like "1:18 ölçek" or "1:18 scale"
const SCALE_REGEX = /^(1:\d+)\s*(ölçek|scale)?/i;

/** Build the best listings URL for a given search term */
function buildSmartSearchUrl(query: string): string {
  const trimmed = query.trim();
  // Check if it matches a known brand (case-insensitive)
  const matchedBrand = KNOWN_BRANDS.find(
    (b) => b.toLowerCase() === trimmed.toLowerCase(),
  );
  if (matchedBrand)
    return `/listings?brand=${encodeURIComponent(matchedBrand)}`;
  // Check if it matches a known manufacturer (case-insensitive)
  const matchedMfr = KNOWN_MANUFACTURERS.find(
    (m) => m.toLowerCase() === trimmed.toLowerCase(),
  );
  if (matchedMfr)
    return `/listings?manufacturer=${encodeURIComponent(matchedMfr)}`;
  // Check if it starts with a scale pattern like "1:18"
  const scaleMatch = trimmed.match(SCALE_REGEX);
  if (scaleMatch) return `/listings?scale=${encodeURIComponent(scaleMatch[1])}`;
  // Default: free-text search
  return `/listings?search=${encodeURIComponent(trimmed)}`;
}

type FlatItem = {
  type:
    | "product"
    | "brand"
    | "category"
    | "manufacturer"
    | "carModel"
    | "scale"
    | "material"
    | "condition"
    | "search";
  id: string;
  label: string;
  href: string;
};

/**
 * Owns the header search state: the query + debounced query, the dropdown
 * open/active-index state machine, the rich autocomplete query, the flat item
 * list for keyboard navigation, recent-searches store wiring, the `?search=`
 * URL sync on `/listings`, and the search-container outside-click close.
 */
function useNavSearch() {
  const router = useRouter();
  const pathname = usePathname();
  const navSearchParams = useSearchParams();
  const {
    addSearch,
    removeSearch,
    clearSearches,
    searches: recentSearches,
  } = useRecentSearchesStore();

  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const searchContainerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Close the search dropdown when clicking outside the search container
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        searchContainerRef.current &&
        !searchContainerRef.current.contains(e.target as Node)
      ) {
        setShowSearchDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = searchQuery.trim();
    if (trimmed) {
      addSearch(trimmed);
      setSearchQuery("");
      setShowSearchDropdown(false);
      router.push(buildSmartSearchUrl(trimmed));
    }
  };

  // Debounce search query for autocomplete
  useEffect(() => {
    const trimmed = searchQuery.trim();
    if (trimmed.length < 2) {
      setDebouncedQuery("");
      return;
    }
    const timer = setTimeout(() => setDebouncedQuery(trimmed), 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Reset active index when query changes
  useEffect(() => {
    setActiveIndex(-1);
  }, [debouncedQuery]);

  // When on /listings, keep the search input in sync with the URL ?search= param
  useEffect(() => {
    if (pathname === "/listings") {
      const urlSearch = navSearchParams.get("search") || "";
      setSearchQuery(urlSearch);
    }
  }, [pathname, navSearchParams]);

  // Rich autocomplete query
  const richAutoQuery = useQuery({
    queryKey: queryKeys.search.autocomplete(debouncedQuery),
    queryFn: async () => {
      const res = await searchApi.autocompleteRich(debouncedQuery);
      return res.data;
    },
    enabled: debouncedQuery.length >= 2,
    staleTime: 60_000,
    meta: { page: "navbar-autocomplete" },
  });
  const autoResults = richAutoQuery.data;

  // Build flat list for keyboard navigation
  const flatItems: FlatItem[] = (() => {
    if (!autoResults || debouncedQuery.length < 2) return [];
    const items: FlatItem[] = [];
    autoResults.products?.forEach((p) =>
      items.push({
        type: "product",
        id: p.id,
        label: p.title,
        href: `/listings/${p.id}`,
      }),
    );
    autoResults.brands?.forEach((b) =>
      items.push({
        type: "brand",
        id: b.id,
        label: b.name,
        href: `/listings?brand=${encodeURIComponent(b.name)}&brandId=${b.id}`,
      }),
    );
    autoResults.categories?.forEach((c) =>
      items.push({
        type: "category",
        id: c.id,
        label: c.name,
        href: `/listings?categoryId=${c.id}`,
      }),
    );
    autoResults.manufacturers?.forEach((m) =>
      items.push({
        type: "manufacturer",
        id: m.id,
        label: m.name,
        href: `/listings?manufacturer=${encodeURIComponent(m.name)}&manufacturerId=${m.id}`,
      }),
    );
    autoResults.carModels?.forEach((m) =>
      items.push({
        type: "carModel",
        id: m.id,
        label: m.name,
        href: `/listings?carModelId=${m.id}&carModel=${encodeURIComponent(m.name)}`,
      }),
    );
    autoResults.scales?.forEach((s) =>
      items.push({
        type: "scale",
        id: s,
        label: s,
        href: `/listings?scale=${encodeURIComponent(s)}`,
      }),
    );
    autoResults.materials?.forEach((mat) =>
      items.push({
        type: "material",
        id: mat.slug,
        label: mat.label,
        href: `/listings?material=${encodeURIComponent(mat.slug)}`,
      }),
    );
    autoResults.conditions?.forEach((cond) =>
      items.push({
        type: "condition",
        id: cond.value,
        label: cond.label,
        href: `/listings?condition=${encodeURIComponent(cond.value)}`,
      }),
    );
    items.push({
      type: "search",
      id: "__search__",
      label: debouncedQuery,
      href: `/listings?search=${encodeURIComponent(debouncedQuery)}`,
    });
    return items;
  })();

  const handleSearchKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Escape") {
        setShowSearchDropdown(false);
        searchInputRef.current?.blur();
        return;
      }
      if (!showSearchDropdown) return;

      if (debouncedQuery.length >= 2 && flatItems.length > 0) {
        if (e.key === "ArrowDown") {
          e.preventDefault();
          setActiveIndex((prev) => (prev + 1) % flatItems.length);
        } else if (e.key === "ArrowUp") {
          e.preventDefault();
          setActiveIndex((prev) =>
            prev <= 0 ? flatItems.length - 1 : prev - 1,
          );
        } else if (
          e.key === "Enter" &&
          activeIndex >= 0 &&
          activeIndex < flatItems.length
        ) {
          e.preventDefault();
          const item = flatItems[activeIndex];
          if (item.type === "search") {
            addSearch(item.label);
          }
          setSearchQuery("");
          setShowSearchDropdown(false);
          router.push(item.href);
        }
      } else if (debouncedQuery.length < 2) {
        // In empty/recent mode, Enter submits the form (default behavior)
        if (e.key === "ArrowDown" && recentSearches.length > 0) {
          e.preventDefault();
          setActiveIndex((prev) =>
            Math.min(prev + 1, recentSearches.length - 1),
          );
        } else if (e.key === "ArrowUp" && recentSearches.length > 0) {
          e.preventDefault();
          setActiveIndex((prev) => Math.max(prev - 1, -1));
        } else if (
          e.key === "Enter" &&
          activeIndex >= 0 &&
          activeIndex < recentSearches.length
        ) {
          e.preventDefault();
          const q = recentSearches[activeIndex];
          addSearch(q);
          setSearchQuery("");
          setShowSearchDropdown(false);
          router.push(buildSmartSearchUrl(q));
        }
      }
    },
    [
      showSearchDropdown,
      debouncedQuery,
      flatItems,
      activeIndex,
      recentSearches,
      addSearch,
      router,
    ],
  );

  const navigateSearch = (query: string) => {
    addSearch(query);
    setSearchQuery("");
    setShowSearchDropdown(false);
    router.push(buildSmartSearchUrl(query));
  };

  return {
    searchContainerRef,
    searchInputRef,
    searchQuery,
    setSearchQuery,
    setDebouncedQuery,
    debouncedQuery,
    showSearchDropdown,
    setShowSearchDropdown,
    activeIndex,
    recentSearches,
    clearSearches,
    removeSearch,
    handleSearchSubmit,
    handleSearchKeyDown,
    navigateSearch,
    autoResults,
    isAutocompleteLoading: richAutoQuery.isLoading,
    flatItems,
  };
}

/**
 * Desktop search form + the full autocomplete dropdown (recent + popular +
 * rich categorized results). All state/logic lives in `useNavSearch`.
 */
export default function HeaderSearch() {
  const t = useTranslations();
  const locale = useLocale();
  const {
    searchContainerRef,
    searchInputRef,
    searchQuery,
    setSearchQuery,
    setDebouncedQuery,
    debouncedQuery,
    showSearchDropdown,
    setShowSearchDropdown,
    activeIndex,
    recentSearches,
    clearSearches,
    removeSearch,
    handleSearchSubmit,
    handleSearchKeyDown,
    navigateSearch,
    autoResults,
    isAutocompleteLoading,
    flatItems,
  } = useNavSearch();

  return (
    <div
      ref={searchContainerRef}
      className="hidden md:flex flex-1 justify-center min-w-0 min-h-0 px-4"
    >
      <div className="w-full max-w-xl relative flex-shrink-0">
        <form onSubmit={handleSearchSubmit} className="relative h-10 block">
          <span className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 flex items-center justify-center flex-shrink-0 pointer-events-none text-primary-400">
            <MagnifyingGlassIcon className="w-4 h-4 shrink-0" aria-hidden />
          </span>
          <Input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onFocus={() => setShowSearchDropdown(true)}
            onKeyDown={handleSearchKeyDown}
            placeholder={t("nav.searchPlaceholder")}
            className="w-full h-10 pl-10 pr-10"
            aria-label={t("nav.searchPlaceholder")}
            autoComplete="off"
          />
          {searchQuery && (
            <Button
              variant="secondary"
              type="button"
              onClick={() => {
                setSearchQuery("");
                setDebouncedQuery("");
                searchInputRef.current?.focus();
              }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-subtle hover:text-muted"
            >
              <XMarkIcon className="w-4 h-4" />
            </Button>
          )}
        </form>

        {/* Search Dropdown */}
        {showSearchDropdown && (
          <div className="absolute left-0 right-0 mt-1 bg-surface-elevated rounded-lg shadow-2xl border border-border z-[100] overflow-hidden">
            {/* === STATE 1: Empty / Focus — Recent searches + Popular === */}
            {debouncedQuery.length < 2 ? (
              <div className="max-h-[420px] overflow-y-auto">
                {/* Son Aramalar */}
                {recentSearches.length > 0 && (
                  <div className="px-4 pt-3 pb-2">
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-xs font-semibold uppercase tracking-wide text-muted">
                        {t("search.recentSearches")}
                      </span>
                      <Button
                        variant="link"
                        size="sm"
                        type="button"
                        onClick={clearSearches}
                      >
                        {t("common.clear")}
                      </Button>
                    </div>
                    <div className="space-y-0.5">
                      {recentSearches.map((s, idx) => (
                        <div key={s} className="group flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            type="button"
                            onClick={() => navigateSearch(s)}
                            className={`min-w-0 flex-1 justify-start ${activeIndex === idx ? "bg-primary-50 text-primary-600" : ""}`}
                          >
                            <span className="truncate">{s}</span>
                          </Button>
                          <IconButton
                            variant="ghost"
                            size="sm"
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              removeSearch(s);
                            }}
                            className="shrink-0 text-subtle opacity-0 transition-opacity hover:text-danger-500 group-hover:opacity-100"
                            aria-label={t("common.remove")}
                          >
                            <XMarkIcon className="h-4 w-4" />
                          </IconButton>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Popüler Aramalar */}
                <div
                  className={`px-4 pb-3 ${recentSearches.length > 0 ? "border-t border-border-subtle pt-2" : "pt-3"}`}
                >
                  <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-muted">
                    {t("search.popularSearches")}
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {POPULAR_SEARCHES[locale as "tr" | "en"]?.map((s) => (
                      <Chip
                        key={s}
                        type="button"
                        onClick={() => navigateSearch(s)}
                      >
                        {s}
                      </Chip>
                    ))}
                  </div>
                </div>

                {/* Tüm ilanları gör */}
                <Link
                  href="/listings"
                  className="flex items-center justify-between px-4 py-2.5 text-sm text-muted hover:bg-primary-50 hover:text-primary-600 border-t border-border-subtle transition-colors"
                  onClick={() => setShowSearchDropdown(false)}
                >
                  <span>{t("search.browseAllListings")}</span>
                  <ArrowRightIcon className="w-4 h-4" />
                </Link>
              </div>
            ) : (
              /* === STATE 2: Typing — Categorized results === */
              <div className="max-h-[480px] overflow-y-auto">
                {isAutocompleteLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Spinner
                      size="md"
                      color="border-primary-500 border-t-transparent"
                    />
                  </div>
                ) : (
                  <>
                    {/* İlgili Sonuçlar başlığı */}
                    <div className="px-4 pt-3 pb-1">
                      <span className="text-xs font-semibold text-muted uppercase tracking-wide">
                        {t("search.relatedResults")}
                      </span>
                    </div>

                    {/* Ürünler */}
                    {autoResults?.products &&
                      autoResults.products.length > 0 && (
                        <div>
                          {autoResults.products.map((product, idx) => {
                            const itemIdx = idx;
                            return (
                              <Link
                                key={product.id}
                                href={`/listings/${product.id}`}
                                className={`flex items-center gap-3 px-4 py-2.5 transition-colors ${activeIndex === itemIdx ? "bg-primary-50" : "hover:bg-surface"}`}
                                onClick={() => setShowSearchDropdown(false)}
                              >
                                {product.imageUrl &&
                                isValidImageSrc(product.imageUrl) ? (
                                  <img
                                    src={product.imageUrl}
                                    alt={product.title}
                                    className="w-12 h-12 rounded-lg object-cover bg-surface-alt flex-shrink-0 border border-border"
                                    onError={(e) => {
                                      (
                                        e.target as HTMLImageElement
                                      ).style.display = "none";
                                      (
                                        e.target as HTMLImageElement
                                      ).nextElementSibling?.classList.remove(
                                        "hidden",
                                      );
                                    }}
                                  />
                                ) : null}
                                <div
                                  className={`w-12 h-12 rounded-lg bg-surface-alt flex-shrink-0 flex items-center justify-center border border-border ${product.imageUrl && isValidImageSrc(product.imageUrl) ? "hidden" : ""}`}
                                >
                                  <ShoppingBagIcon className="w-5 h-5 text-subtle" />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm text-heading font-medium truncate">
                                    {product.title}
                                  </p>
                                  <p className="text-xs text-primary-600 font-semibold">
                                    {product.price.toLocaleString("tr-TR", {
                                      minimumFractionDigits: 2,
                                      maximumFractionDigits: 2,
                                    })}{" "}
                                    TL
                                  </p>
                                </div>
                                <span className="text-2xs text-subtle font-medium px-2 py-0.5 bg-surface-alt rounded-full flex-shrink-0">
                                  {t("order.product")}
                                </span>
                              </Link>
                            );
                          })}
                        </div>
                      )}

                    {/* Markalar (Car Brands) */}
                    {autoResults?.brands && autoResults.brands.length > 0 && (
                      <div
                        className={
                          autoResults?.products?.length
                            ? "border-t border-border-subtle"
                            : ""
                        }
                      >
                        {autoResults.brands.map((brand) => {
                          const itemIdx =
                            (autoResults?.products?.length || 0) +
                            autoResults.brands.indexOf(brand);
                          return (
                            <Link
                              key={brand.id}
                              href={`/listings?brand=${encodeURIComponent(brand.name)}`}
                              className={`flex items-center gap-3 px-4 py-2.5 transition-colors ${activeIndex === itemIdx ? "bg-primary-50" : "hover:bg-surface"}`}
                              onClick={() => setShowSearchDropdown(false)}
                            >
                              {brand.logo ? (
                                <img
                                  src={brand.logo}
                                  alt={brand.name}
                                  className="w-10 h-10 rounded-full object-contain bg-surface-elevated flex-shrink-0 border border-border p-0.5"
                                />
                              ) : (
                                <div className="w-10 h-10 rounded-full bg-primary-100 flex-shrink-0 flex items-center justify-center text-primary-600 text-sm font-bold">
                                  {brand.name.charAt(0)}
                                </div>
                              )}
                              <span className="flex-1 text-sm text-heading font-medium truncate">
                                {brand.name}
                              </span>
                              <span className="text-2xs text-primary-600 font-medium px-2 py-0.5 bg-primary-50 rounded-full flex-shrink-0">
                                {t("product.brand")}
                              </span>
                            </Link>
                          );
                        })}
                      </div>
                    )}

                    {/* Kategoriler */}
                    {autoResults?.categories &&
                      autoResults.categories.length > 0 && (
                        <div
                          className={
                            autoResults?.products?.length ||
                            autoResults?.brands?.length
                              ? "border-t border-border-subtle"
                              : ""
                          }
                        >
                          {autoResults.categories.map((cat) => {
                            const itemIdx =
                              (autoResults?.products?.length || 0) +
                              (autoResults?.brands?.length || 0) +
                              autoResults.categories.indexOf(cat);
                            return (
                              <Link
                                key={cat.id}
                                href={`/listings?categoryId=${cat.id}`}
                                className={`flex items-center gap-3 px-4 py-2.5 transition-colors ${activeIndex === itemIdx ? "bg-primary-50" : "hover:bg-surface"}`}
                                onClick={() => setShowSearchDropdown(false)}
                              >
                                <div className="w-10 h-10 rounded-full bg-info-50 flex-shrink-0 flex items-center justify-center text-info-500 border border-info-100">
                                  <TagIcon className="w-5 h-5" />
                                </div>
                                <span className="flex-1 text-sm text-heading font-medium truncate">
                                  {cat.name}
                                </span>
                                <span className="text-2xs text-info-600 font-medium px-2 py-0.5 bg-info-50 rounded-full flex-shrink-0">
                                  {t("product.category")}
                                </span>
                              </Link>
                            );
                          })}
                        </div>
                      )}

                    {/* Üreticiler (Manufacturers) */}
                    {autoResults?.manufacturers &&
                      autoResults.manufacturers.length > 0 && (
                        <div
                          className={
                            autoResults?.products?.length ||
                            autoResults?.brands?.length ||
                            autoResults?.categories?.length
                              ? "border-t border-border-subtle"
                              : ""
                          }
                        >
                          {autoResults.manufacturers.map((mfr) => {
                            const itemIdx =
                              (autoResults?.products?.length || 0) +
                              (autoResults?.brands?.length || 0) +
                              (autoResults?.categories?.length || 0) +
                              autoResults.manufacturers.indexOf(mfr);
                            return (
                              <Link
                                key={mfr.id}
                                href={`/listings?manufacturer=${encodeURIComponent(mfr.name)}&manufacturerId=${mfr.id}`}
                                className={`flex items-center gap-3 px-4 py-2.5 transition-colors ${activeIndex === itemIdx ? "bg-primary-50" : "hover:bg-surface"}`}
                                onClick={() => setShowSearchDropdown(false)}
                              >
                                {mfr.logo ? (
                                  <img
                                    src={mfr.logo}
                                    alt={mfr.name}
                                    className="w-10 h-10 rounded-full object-contain bg-surface-elevated flex-shrink-0 border border-border p-0.5"
                                  />
                                ) : (
                                  <div className="w-10 h-10 rounded-full bg-primary-50 flex-shrink-0 flex items-center justify-center text-primary-600 text-sm font-bold border border-primary-100">
                                    {mfr.name.charAt(0)}
                                  </div>
                                )}
                                <span className="flex-1 text-sm text-heading font-medium truncate">
                                  {mfr.name}
                                </span>
                                <span className="text-2xs text-primary-600 font-medium px-2 py-0.5 bg-primary-50 rounded-full flex-shrink-0">
                                  {t("product.manufacturer")}
                                </span>
                              </Link>
                            );
                          })}
                        </div>
                      )}

                    {/* Modeller (Car Models) */}
                    {autoResults?.carModels &&
                      autoResults.carModels.length > 0 && (
                        <div
                          className={
                            autoResults?.products?.length ||
                            autoResults?.brands?.length ||
                            autoResults?.categories?.length ||
                            autoResults?.manufacturers?.length
                              ? "border-t border-border-subtle"
                              : ""
                          }
                        >
                          {autoResults.carModels.map((m) => {
                            const itemIdx =
                              (autoResults?.products?.length || 0) +
                              (autoResults?.brands?.length || 0) +
                              (autoResults?.categories?.length || 0) +
                              (autoResults?.manufacturers?.length || 0) +
                              (autoResults?.carModels ?? []).indexOf(m);
                            return (
                              <Link
                                key={m.id}
                                href={`/listings?carModelId=${m.id}&carModel=${encodeURIComponent(m.name)}`}
                                className={`flex items-center gap-3 px-4 py-2.5 transition-colors ${activeIndex === itemIdx ? "bg-primary-50" : "hover:bg-surface"}`}
                                onClick={() => setShowSearchDropdown(false)}
                              >
                                <div className="w-10 h-10 rounded-full bg-success-50 flex-shrink-0 flex items-center justify-center text-success-600 text-sm font-bold border border-success-100">
                                  {m.name.charAt(0)}
                                </div>
                                <span className="flex-1 text-sm text-heading font-medium truncate">
                                  {m.name}
                                </span>
                                <span className="text-2xs text-success-600 font-medium px-2 py-0.5 bg-success-50 rounded-full flex-shrink-0">
                                  {t("product.model")}
                                </span>
                              </Link>
                            );
                          })}
                        </div>
                      )}

                    {/* Ölçek (Scale) */}
                    {autoResults?.scales && autoResults.scales.length > 0 && (
                      <div
                        className={
                          autoResults?.products?.length ||
                          autoResults?.brands?.length ||
                          autoResults?.categories?.length ||
                          autoResults?.manufacturers?.length ||
                          autoResults?.carModels?.length
                            ? "border-t border-border-subtle"
                            : ""
                        }
                      >
                        {autoResults.scales.map((s) => {
                          const itemIdx =
                            (autoResults?.products?.length || 0) +
                            (autoResults?.brands?.length || 0) +
                            (autoResults?.categories?.length || 0) +
                            (autoResults?.manufacturers?.length || 0) +
                            (autoResults?.carModels?.length || 0) +
                            (autoResults?.scales ?? []).indexOf(s);
                          return (
                            <Link
                              key={s}
                              href={`/listings?scale=${encodeURIComponent(s)}`}
                              className={`flex items-center gap-3 px-4 py-2.5 transition-colors ${activeIndex === itemIdx ? "bg-primary-50" : "hover:bg-surface"}`}
                              onClick={() => setShowSearchDropdown(false)}
                            >
                              <div className="w-10 h-10 rounded-full bg-warning-50 flex-shrink-0 flex items-center justify-center text-warning-600 text-xs font-bold border border-warning-100">
                                {s}
                              </div>
                              <span className="flex-1 text-sm text-heading font-medium truncate">
                                {s}
                              </span>
                              <span className="text-2xs text-warning-600 font-medium px-2 py-0.5 bg-warning-50 rounded-full flex-shrink-0">
                                {t("product.scale")}
                              </span>
                            </Link>
                          );
                        })}
                      </div>
                    )}

                    {/* Malzeme (Material) */}
                    {autoResults?.materials &&
                      autoResults.materials.length > 0 && (
                        <div
                          className={
                            autoResults?.products?.length ||
                            autoResults?.brands?.length ||
                            autoResults?.categories?.length ||
                            autoResults?.manufacturers?.length ||
                            autoResults?.carModels?.length ||
                            autoResults?.scales?.length
                              ? "border-t border-border-subtle"
                              : ""
                          }
                        >
                          {autoResults.materials.map((mat) => {
                            const itemIdx =
                              (autoResults?.products?.length || 0) +
                              (autoResults?.brands?.length || 0) +
                              (autoResults?.categories?.length || 0) +
                              (autoResults?.manufacturers?.length || 0) +
                              (autoResults?.carModels?.length || 0) +
                              (autoResults?.scales?.length || 0) +
                              (autoResults?.materials ?? []).indexOf(mat);
                            return (
                              <Link
                                key={mat.slug}
                                href={`/listings?material=${encodeURIComponent(mat.slug)}`}
                                className={`flex items-center gap-3 px-4 py-2.5 transition-colors ${activeIndex === itemIdx ? "bg-primary-50" : "hover:bg-surface"}`}
                                onClick={() => setShowSearchDropdown(false)}
                              >
                                <div className="w-10 h-10 rounded-full bg-surface flex-shrink-0 flex items-center justify-center text-muted text-sm font-bold border border-border-subtle">
                                  {mat.label.charAt(0)}
                                </div>
                                <span className="flex-1 text-sm text-heading font-medium truncate">
                                  {mat.label}
                                </span>
                                <span className="text-2xs text-muted font-medium px-2 py-0.5 bg-surface rounded-full flex-shrink-0">
                                  {t("product.material")}
                                </span>
                              </Link>
                            );
                          })}
                        </div>
                      )}

                    {/* Durum (Condition) */}
                    {autoResults?.conditions &&
                      autoResults.conditions.length > 0 && (
                        <div
                          className={
                            autoResults?.products?.length ||
                            autoResults?.brands?.length ||
                            autoResults?.categories?.length ||
                            autoResults?.manufacturers?.length ||
                            autoResults?.carModels?.length ||
                            autoResults?.scales?.length ||
                            autoResults?.materials?.length
                              ? "border-t border-border-subtle"
                              : ""
                          }
                        >
                          {autoResults.conditions.map((cond) => {
                            const itemIdx =
                              (autoResults?.products?.length || 0) +
                              (autoResults?.brands?.length || 0) +
                              (autoResults?.categories?.length || 0) +
                              (autoResults?.manufacturers?.length || 0) +
                              (autoResults?.carModels?.length || 0) +
                              (autoResults?.scales?.length || 0) +
                              (autoResults?.materials?.length || 0) +
                              (autoResults?.conditions ?? []).indexOf(cond);
                            return (
                              <Link
                                key={cond.value}
                                href={`/listings?condition=${encodeURIComponent(cond.value)}`}
                                className={`flex items-center gap-3 px-4 py-2.5 transition-colors ${activeIndex === itemIdx ? "bg-primary-50" : "hover:bg-surface"}`}
                                onClick={() => setShowSearchDropdown(false)}
                              >
                                <div className="w-10 h-10 rounded-full bg-success-50 flex-shrink-0 flex items-center justify-center text-success-600 text-sm font-bold border border-success-100">
                                  {cond.label.charAt(0)}
                                </div>
                                <span className="flex-1 text-sm text-heading font-medium truncate">
                                  {cond.label}
                                </span>
                                <span className="text-2xs text-success-600 font-medium px-2 py-0.5 bg-success-50 rounded-full flex-shrink-0">
                                  {t("product.condition")}
                                </span>
                              </Link>
                            );
                          })}
                        </div>
                      )}

                    {/* No results */}
                    {!autoResults?.products?.length &&
                      !autoResults?.brands?.length &&
                      !autoResults?.categories?.length &&
                      !autoResults?.manufacturers?.length &&
                      !autoResults?.carModels?.length &&
                      !autoResults?.scales?.length &&
                      !autoResults?.materials?.length &&
                      !autoResults?.conditions?.length && (
                        <div className="px-4 py-6 text-center text-sm text-muted">
                          {t("search.noResults")}
                        </div>
                      )}

                    {/* "...ile ara" footer */}
                    <Button
                      variant="secondary"
                      type="button"
                      onClick={() => navigateSearch(debouncedQuery)}
                      className={`flex items-center justify-between w-full px-4 py-3 text-sm font-medium border-t border-border-subtle transition-colors ${activeIndex === flatItems.length - 1 ? "bg-primary-50 text-primary-600" : "text-primary-600 hover:bg-primary-50"}`}
                    >
                      <span>
                        &ldquo;{debouncedQuery}&rdquo;{" "}
                        {t("search.searchAction")}
                      </span>
                      <ArrowRightIcon className="w-4 h-4" />
                    </Button>
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
