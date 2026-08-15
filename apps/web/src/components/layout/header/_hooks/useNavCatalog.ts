/** @format */

"use client";

import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { queryKeys } from "@/lib/query/keys";
import { categoriesApi, manufacturersApi, listingsApi } from "@/lib/api";
import { categoryBarItems, type ManufacturerRef } from "../nav/config";

interface Category {
  id: string;
  name: string;
  slug: string;
}

const HOUR = 60 * 60 * 1000;

/**
 * The catalog data behind the header nav — categories, manufacturers and scale
 * facets. All cached via TanStack Query (keys shared with the rest of the app,
 * so repeated mounts and other consumers dedupe to one request each) instead of
 * the previous per-mount `useEffect` fetches.
 */
export function useNavCatalog() {
  const t = useTranslations();

  const categoriesQuery = useQuery({
    queryKey: queryKeys.categories.all(),
    queryFn: async (): Promise<Category[]> => {
      const res = await categoriesApi.findAll();
      const raw = res.data;
      return Array.isArray(raw) ? raw : (raw?.data ?? []);
    },
    staleTime: HOUR,
  });

  const manufacturersQuery = useQuery({
    queryKey: queryKeys.manufacturers.list(),
    queryFn: async (): Promise<ManufacturerRef[]> => {
      const res = await manufacturersApi.findAll();
      const raw = res.data;
      return Array.isArray(raw) ? raw : (raw?.data ?? []);
    },
    staleTime: HOUR,
  });

  // The full listings filter facets — cached under one key so the sidebar
  // filters (SidebarFilters) share the same fetch; here we only read `scales`.
  const filtersQuery = useQuery({
    queryKey: queryKeys.listings.filters(),
    queryFn: async () =>
      (await listingsApi.getFilters()).data as { scales?: string[] },
    staleTime: HOUR,
  });

  const categories = categoriesQuery.data ?? [];
  const manufacturers = manufacturersQuery.data ?? [];
  const scales = filtersQuery.data?.scales ?? [];

  // Açılır menü başlıkları veriye bağlıdır ve bu karar TEK yerde verilir —
  // masaüstü mega-menüsü ile mobil çekmece aynı listeyi tüketir. Katalog boşken
  // "Kategoriler" yalnızca iki başlıktan oluşan boş bir panel açıyor, "Ölçek"
  // ise hiçbir üründe bulunmayan sabit bir ölçek listesi gösteriyordu.
  const navItems = categoryBarItems(t).filter((item) => {
    if (item.dropdown === "categories")
      return categories.length > 0 || manufacturers.length > 0;
    if (item.dropdown === "scales") return scales.length > 0;
    return true;
  });

  return { categories, manufacturers, scales, navItems };
}
