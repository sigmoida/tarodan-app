"use client";

import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { api, listingsApi, manufacturersApi } from "@/lib/api";
import { queryKeys } from "@/lib/query/keys";
import {
  getProductEffectivePrice,
  getProductOriginalPriceForDisplay,
  isProductOnSaleDisplay,
} from "@/lib/productPrice";
import {
  BRANDS,
  DEMO_COLLECTIONS,
  DEMO_COMPANY,
  DEMO_FEATURED_COLLECTOR,
} from "../lib/constants";
import type {
  FeaturedBusiness,
  FeaturedCollector,
  Product,
} from "../lib/types";

export function useHomeData() {
  const { data: apiCollections = [], isLoading: isLoadingCollections } =
    useQuery({
      queryKey: ["home", "topCollections", { limit: 20 }],
      queryFn: async () => {
        const response = await api.get<FeaturedCollector[]>(
          "/users/top-collections",
          { params: { limit: 20 } },
        );
        return Array.isArray(response.data) ? response.data : [];
      },
      meta: { page: "home", section: "topCollections" },
    });
  const topCollections =
    apiCollections.length > 0 ? apiCollections : DEMO_COLLECTIONS;

  const {
    data: apiFeaturedCollector = null,
    isLoading: isLoadingFeaturedCollector,
  } = useQuery({
    queryKey: ["home", "featuredCollector"],
    queryFn: async () => {
      const response = await api.get<FeaturedCollector | null>(
        "/users/featured-collector",
      );
      return response.data ?? null;
    },
    meta: { page: "home", section: "featuredCollector" },
  });
  const featuredCollector = apiFeaturedCollector;

  const { data: bestSellersData, isLoading: isLoadingBestSellers } =
    useInfiniteQuery({
      queryKey: ["home", "bestSellers", "popular"],
      queryFn: async ({ pageParam = 1 }) => {
        const response = await listingsApi.getPopular({
          limit: 20,
          page: pageParam,
        });
        const raw = response?.data;
        const products = Array.isArray(raw)
          ? raw
          : (raw?.data ?? raw?.products ?? []);
        return Array.isArray(products) ? products : [];
      },
      getNextPageParam: (_lastPage, allPages) =>
        _lastPage.length < 20 ? undefined : allPages.length + 1,
      initialPageParam: 1,
      refetchOnMount: "always",
      meta: { page: "home", section: "bestSellers" },
    });
  const bestSellers = bestSellersData?.pages.flatMap((p) => p) ?? [];

  const { data: apiCompanyOfWeek = null, isLoading: isLoadingCompany } =
    useQuery({
      queryKey: ["home", "featuredBusiness"],
      queryFn: async () => {
        const response = await api.get<FeaturedBusiness | null>(
          "/users/featured-business",
        );
        return response.data ?? null;
      },
      meta: { page: "home", section: "featuredBusiness" },
    });
  const companyOfWeek = apiCompanyOfWeek ?? DEMO_COMPANY;

  const { data: apiManufacturers = [] } = useQuery({
    queryKey: ["home", "manufacturers"],
    queryFn: async () => {
      const res = await manufacturersApi.findAll();
      const raw = res.data;
      const data = Array.isArray(raw) ? raw : (raw?.data ?? []);
      return Array.isArray(data) ? data : [];
    },
    staleTime: 60 * 1000,
    refetchOnMount: "always",
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
    featuredCollector ??
    (topCollections.length > 0 ? topCollections[0] : DEMO_FEATURED_COLLECTOR);

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
        const raw = response?.data;
        const products = Array.isArray(raw)
          ? raw
          : (raw?.data ?? raw?.products ?? []);
        return (Array.isArray(products) ? products : []) as Product[];
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
      const raw = response?.data;
      const products = Array.isArray(raw)
        ? raw
        : (raw?.data ?? raw?.products ?? []);
      return (Array.isArray(products) ? products : []) as Product[];
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
        const raw = response?.data;
        const products = Array.isArray(raw)
          ? raw
          : (raw?.data ?? raw?.products ?? []);
        // Sadece gerçek indirimli ürünler: oldPrice > price (API bazen %0 veya yanlış fiyat dönebilir)
        const withRealDiscount = (
          Array.isArray(products) ? products : []
        ).filter((p: Product) => {
          const effective = getProductEffectivePrice(p);
          const original = getProductOriginalPriceForDisplay(p);
          return isProductOnSaleDisplay(p) && original > effective;
        });
        return withRealDiscount as Product[];
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
