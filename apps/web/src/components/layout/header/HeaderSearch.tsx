/** @format */

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter, usePathname } from "@/i18n/navigation";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { MagnifyingGlassIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { IconButton, Input } from "@tarodan/ui";
import { useTranslations } from "next-intl";
import { searchApi } from "@/lib/api";
import { queryKeys } from "@/lib/query/keys";
import { useRecentSearchesStore } from "@/stores/recentSearchesStore";

const HeaderSearchDropdown = dynamic(() => import("./HeaderSearchDropdown"), {
  ssr: false,
});

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
      data-tour="search"
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
            <IconButton
              variant="ghost"
              size="sm"
              type="button"
              aria-label={t("common.clear")}
              onClick={() => {
                setSearchQuery("");
                setDebouncedQuery("");
                searchInputRef.current?.focus();
              }}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full text-subtle hover:text-heading"
            >
              <XMarkIcon className="w-4 h-4" />
            </IconButton>
          )}
        </form>

        {showSearchDropdown && (
          <HeaderSearchDropdown
            debouncedQuery={debouncedQuery}
            activeIndex={activeIndex}
            recentSearches={recentSearches}
            clearSearches={clearSearches}
            removeSearch={removeSearch}
            navigateSearch={navigateSearch}
            onClose={() => setShowSearchDropdown(false)}
            autoResults={autoResults}
            isAutocompleteLoading={isAutocompleteLoading}
            flatItemsLength={flatItems.length}
          />
        )}
      </div>
    </div>
  );
}
