"use client";

import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { listingsApi, manufacturersApi, userApi } from "@/lib/api";
import { queryKeys } from "@/lib/query/keys";
import { hasRealDiscount } from "@/lib/productPrice";
import { unwrapList } from "@/lib/unwrapList";
import { BRANDS } from "../lib/constants";
import type { Product } from "@/types/product";
import type { FeaturedBusiness, FeaturedCollector } from "../lib/types";

export function useHomeData() {
  const { data: apiCollections = [], isLoading: isLoadingCollections } =
    useQuery({
      queryKey: queryKeys.home.topCollections(20),
      queryFn: async () => {
        const res = await userApi.getTopCollections(20);
        return unwrapList<FeaturedCollector>(res.data);
      },
      meta: { page: "home", section: "topCollections" },
    });
  const topCollections = apiCollections;

  const {
    data: apiFeaturedCollector = null,
    isLoading: isLoadingFeaturedCollector,
  } = useQuery({
    queryKey: queryKeys.home.featuredCollector(),
    queryFn: async () => {
      const res = await userApi.getFeaturedCollector();
      return (res.data ?? null) as FeaturedCollector | null;
    },
    meta: { page: "home", section: "featuredCollector" },
  });
  const featuredCollector = apiFeaturedCollector;

  const { data: bestSellersData, isLoading: isLoadingBestSellers } =
    useInfiniteQuery({
      queryKey: queryKeys.home.popular(),
      queryFn: async ({ pageParam = 1 }) => {
        const response = await listingsApi.getPopular({
          limit: 20,
          page: pageParam,
        });
        return unwrapList<Product>(response?.data);
      },
      getNextPageParam: (_lastPage, allPages) =>
        _lastPage.length < 20 ? undefined : allPages.length + 1,
      initialPageParam: 1,
      // Not seeded server-side (infinite-query hydration is out of scope), so
      // refetch on mount to keep "popular" fresh.
      refetchOnMount: "always",
      meta: { page: "home", section: "bestSellers" },
    });
  const bestSellers = bestSellersData?.pages.flatMap((p) => p) ?? [];

  const { data: apiCompanyOfWeek = null, isLoading: isLoadingCompany } =
    useQuery({
      queryKey: queryKeys.home.featuredBusiness(),
      queryFn: async () => {
        const res = await userApi.getFeaturedBusiness();
        return (res.data ?? null) as FeaturedBusiness | null;
      },
      meta: { page: "home", section: "featuredBusiness" },
    });
  const companyOfWeek = apiCompanyOfWeek;

  const { data: apiManufacturers = [] } = useQuery({
    queryKey: queryKeys.home.manufacturers(),
    queryFn: async () => {
      const res = await manufacturersApi.findAll();
      return unwrapList<any>(res.data);
    },
    // Seeded server-side; let staleTime govern so the SSR data is reused on
    // mount instead of an immediate refetch.
    staleTime: 60 * 1000,
    meta: { page: "home", section: "manufacturers" },
  });

  const apiNamesSet = new Set(
    (apiManufacturers as any[]).map((m: any) => m.name?.toLowerCase?.() || ""),
  );
  const fallbackBrands = BRANDS.filter(
    (b) => !apiNamesSet.has(b.name.toLowerCase()),
  );
  const marqueeItems = [
    ...(apiManufacturers as any[]).map((m: any) => {
      const fromBrands = BRANDS.find(
        (b) => b.name.toLowerCase() === (m.name || "").toLowerCase(),
      );
      return {
        name: m.name,
        logoUrl: m.logo || fromBrands?.logoUrl || "",
        desc: m.description ?? fromBrands?.desc ?? "",
      };
    }),
    ...fallbackBrands,
  ];
  const marqueeItemsToShow = marqueeItems.length > 0 ? marqueeItems : BRANDS;

  const featuredCollectorToShow: FeaturedCollector | null =
    featuredCollector ?? (topCollections.length > 0 ? topCollections[0] : null);

  const { data: featuredProducts = [], isLoading: isLoadingFeatured } =
    useQuery({
      queryKey: queryKeys.home.featured(),
      queryFn: async () => {
        const response = await listingsApi.getAll({
          limit: 20,
          page: 1,
          boostedOnly: true,
          status: "active",
        });
        return unwrapList<Product>(response?.data);
      },
      meta: { page: "home", section: "featured" },
    });

  const { data: tradeProducts = [], isLoading: isLoadingTrade } = useQuery({
    queryKey: queryKeys.home.trade(),
    queryFn: async () => {
      const response = await listingsApi.getAll({
        limit: 24,
        page: 1,
        tradeOnly: true,
        status: "active",
      });
      return unwrapList<Product>(response?.data);
    },
    meta: { page: "home", section: "trade" },
  });

  const { data: discountedProducts = [], isLoading: isLoadingDiscounted } =
    useQuery({
      queryKey: queryKeys.home.discounted(),
      queryFn: async () => {
        const response = await listingsApi.getAll({
          limit: 24,
          page: 1,
          discountOnly: true,
          status: "active",
        });
        // Sadece gerçek indirimli ürünler (API bazen %0 / yanlış fiyat dönebilir).
        return unwrapList<Product>(response?.data).filter(hasRealDiscount);
      },
      meta: { page: "home", section: "discounted" },
    });

  return {
    topCollections,
    featuredCollector,
    featuredCollectorToShow,
    bestSellers,
    companyOfWeek,
    manufacturers: apiManufacturers,
    marqueeItems,
    marqueeItemsToShow,
    featured: featuredProducts,
    trade: tradeProducts,
    discounted: discountedProducts,
    isLoadingCollections,
    isLoadingFeaturedCollector,
    isLoadingBestSellers,
    isLoadingCompany,
    isLoadingFeatured,
    isLoadingTrade,
    isLoadingDiscounted,
  };
}
