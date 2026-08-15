/** @format */

"use client";

import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query/keys";
import { useAuthStore } from "@/stores/authStore";
import { fetchManufacturersClient, mergeManufacturers } from "../_lib/data";
import { useTranslations } from "next-intl";

function useManufacturersValue() {
  const t = useTranslations();
  const { isAuthenticated } = useAuthStore();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCountry, setSelectedCountry] = useState<string | null>(null);
  const [expandedBrand, setExpandedBrand] = useState<string | null>(null);

  const { data: rawList = [] } = useQuery({
    queryKey: queryKeys.manufacturers.list(),
    queryFn: fetchManufacturersClient,
    staleTime: 60_000,
  });

  const brands = useMemo(() => mergeManufacturers(rawList), [rawList]);

  const filteredBrands = useMemo(() => {
    return brands.filter((b) => {
      const q = searchQuery.toLowerCase();
      const matchesSearch =
        !searchQuery ||
        b.name.toLowerCase().includes(q) ||
        (b.description || "").toLowerCase().includes(q) ||
        (b.country || "").toLowerCase().includes(q);
      const matchesCountry = !selectedCountry || b.country === selectedCountry;
      return matchesSearch && matchesCountry;
    });
  }, [brands, searchQuery, selectedCountry]);

  const countries = useMemo(() => {
    const map = new Map<string, { flag: string; count: number }>();
    brands.forEach((b) => {
      const key =
        b.country || t("page.manufacturers.manufacturerscontext.diger");
      const existing = map.get(key);
      if (existing) existing.count++;
      else map.set(key, { flag: b.countryFlag, count: 1 });
    });
    return Array.from(map.entries()).sort((a, b) => b[1].count - a[1].count);
  }, [brands]);

  const totalProducts = useMemo(
    () => brands.reduce((sum, b) => sum + b.productCount, 0),
    [brands],
  );

  // Drives the Radix Accordion (controlled): its `onValueChange` passes the open
  // item's value, or '' when all collapse.
  const setExpanded = (slug: string | null) => setExpandedBrand(slug || null);

  const clearFilters = () => {
    setSearchQuery("");
    setSelectedCountry(null);
  };

  return {
    isAuthenticated,
    searchQuery,
    setSearchQuery,
    selectedCountry,
    setSelectedCountry,
    expandedBrand,
    setExpanded,
    clearFilters,
    brands,
    filteredBrands,
    countries,
    totalProducts,
  };
}

type ManufacturersValue = ReturnType<typeof useManufacturersValue>;

const ManufacturersContext = createContext<ManufacturersValue | null>(null);

export function ManufacturersProvider({ children }: { children: ReactNode }) {
  const value = useManufacturersValue();
  return (
    <ManufacturersContext.Provider value={value}>
      {children}
    </ManufacturersContext.Provider>
  );
}

export function useManufacturers() {
  const t = useTranslations();
  const ctx = useContext(ManufacturersContext);
  if (!ctx)
    throw new Error(
      t(
        "page.manufacturers.manufacturerscontext.usemanufacturersMustBeUsedWithinA",
      ),
    );
  return ctx;
}
