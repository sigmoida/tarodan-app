/** @format */

"use client";

import { api, listingsApi, brandsApi } from "@/lib/api";
import { useWebList } from "@/hooks/useWebResource";
import {
  EXCLUDED_BRAND_SLUGS,
  EXCLUDED_SCALE_SLUGS,
  type Brand,
  type Category,
  type CarModel,
  type Ref,
} from "./constants";

// Shared TanStack Query hooks for the new/edit listing forms. One set of query
// keys → the two forms share the cache.

function flatten(cats: Category[]): Category[] {
  const out: Category[] = [];
  for (const c of cats) {
    out.push(c);
    if (c.children?.length) out.push(...flatten(c.children));
  }
  return out;
}

/** Flat, de-duplicated category list. When `excludeBrandScale` is set, brand and
 *  scale categories are dropped (they have their own dedicated fields). */
export function useListingCategories(
  enabled: boolean,
  excludeBrandScale = false,
) {
  const query = useWebList<Category[]>({
    resource: "listing-form-categories",
    fetcher: async () => {
      const res = await api.get("/categories");
      return res.data.data || res.data || [];
    },
    enabled,
    query: { staleTime: 5 * 60 * 1000 },
  });
  let flatCategories = flatten(query.data ?? []);
  if (excludeBrandScale) {
    flatCategories = flatCategories.filter((c) => {
      const slug = c.slug.toLowerCase();
      return !EXCLUDED_BRAND_SLUGS.has(slug) && !EXCLUDED_SCALE_SLUGS.has(slug);
    });
  }
  return { flatCategories };
}

/** Scale / material / brand / manufacturer option lists, with a brands fallback
 *  to `brandsApi.findAll()`. */
export function useListingFilters(enabled = true) {
  const query = useWebList<{
    scales: string[];
    materials: Array<{ slug: string; label: string }>;
    brands: Brand[];
    manufacturers: Ref[];
  }>({
    resource: "listing-form-filters",
    fetcher: async () => {
      let scales: string[] = [];
      let materials: Array<{ slug: string; label: string }> = [];
      let brands: Brand[] = [];
      let manufacturers: Ref[] = [];
      try {
        const res = await listingsApi.getFilters();
        const d = res.data as {
          scales?: string[];
          materials?: Array<{ slug: string; label: string }>;
          brands?: Ref[];
          manufacturers?: Ref[];
        };
        scales = d.scales ?? [];
        materials = d.materials ?? [];
        brands = (d.brands ?? []) as Brand[];
        manufacturers = d.manufacturers ?? [];
      } catch {
        // fall through to the brands fallback below
      }
      if (!brands.length) {
        try {
          const raw = (await brandsApi.findAll()).data;
          brands = (
            Array.isArray(raw) ? raw : (raw as any)?.data || []
          ) as Brand[];
        } catch {
          brands = [];
        }
      }
      return { scales, materials, brands, manufacturers };
    },
    enabled,
    query: { staleTime: 5 * 60 * 1000 },
  });
  return {
    scales: query.data?.scales ?? [],
    materials: query.data?.materials ?? [],
    brands: query.data?.brands ?? [],
    manufacturers: query.data?.manufacturers ?? [],
    brandsLoading: query.isPending && enabled,
  };
}

/** Car models for the selected brand slug. */
export function useCarModels(brandSlug: string | undefined) {
  const query = useWebList<CarModel[]>({
    resource: "listing-form-car-models",
    params: brandSlug,
    fetcher: async () => {
      const res = await api.get(`/car-models?brand=${brandSlug}`);
      return Array.isArray(res.data) ? res.data : res.data?.data || [];
    },
    enabled: !!brandSlug,
    query: { staleTime: 5 * 60 * 1000, retry: false },
  });
  return {
    models: brandSlug ? (query.data ?? []) : [],
    modelsLoading: !!brandSlug && query.isLoading,
  };
}

/** Estimated platform fee / net for a price + category. */
export function useCommissionPreview(
  price: string | number,
  categoryId: string,
) {
  const amount = Number(price);
  const enabled = !!price && !Number.isNaN(amount) && amount > 0;
  const query = useWebList<{
    sellerFeeAmount: number;
    sellerNetAmount: number;
  }>({
    resource: "listing-form-commission",
    params: [String(price), categoryId],
    fetcher: async () => {
      const res = await api.get("/orders/commission-preview", {
        params: { amount: price, categoryId: categoryId || undefined },
      });
      return {
        sellerFeeAmount: Number(res.data?.sellerFeeAmount ?? 0),
        sellerNetAmount: Number(res.data?.sellerNetAmount ?? 0),
      };
    },
    enabled,
    query: { staleTime: 30 * 1000 },
  });
  return {
    commissionPreview: enabled ? (query.data ?? null) : null,
    commissionPreviewLoading: enabled && query.isLoading,
  };
}

export interface AttributeGroup {
  slug: string;
  name: string;
  manufacturerSlug: string | null;
  isRequired: boolean;
  attributes: Array<{ slug: string; label: string; color?: string | null }>;
}

/** Manufacturer-scoped attribute groups (global scale/material groups dropped). */
export function useManufacturerAttributes(
  manufacturerSlug: string | undefined,
) {
  const query = useWebList<AttributeGroup[]>({
    resource: "listing-form-mfr-attrs",
    params: manufacturerSlug,
    fetcher: async () => {
      const res = await listingsApi.getAttributeGroups({
        manufacturer: manufacturerSlug!,
      });
      const groups = (res.data as AttributeGroup[]) ?? [];
      return groups.filter((g) => g.manufacturerSlug === manufacturerSlug);
    },
    enabled: !!manufacturerSlug,
    query: { staleTime: 5 * 60 * 1000 },
  });
  return { manufacturerAttrGroups: manufacturerSlug ? (query.data ?? []) : [] };
}

export interface ListingLimits {
  currentCount: number;
  maxListings: number;
  canCreateListing: boolean;
  isPremium: boolean;
  membershipTier: string;
  remainingListings: number;
}

/** The seller's listing-quota stats (new-listing limit banner). */
export function useListingLimits(enabled: boolean, membershipTier: string) {
  const query = useWebList<ListingLimits>({
    resource: "listing-form-limits",
    fetcher: async () => {
      try {
        const res = await api.get("/products/my/stats", {
          params: { _t: Date.now() },
        });
        const stats = res.data;
        const tierType = stats.limits?.tierType || "free";
        return {
          currentCount: stats.summary?.used ?? 0,
          maxListings: stats.summary?.max ?? -1,
          canCreateListing: stats.summary?.canCreate ?? true,
          isPremium: tierType === "premium" || tierType === "business",
          membershipTier: stats.limits?.tierName || "Free",
          remainingListings: stats.summary?.remaining ?? -1,
        };
      } catch {
        return {
          currentCount: 0,
          maxListings: -1,
          canCreateListing: true,
          isPremium:
            membershipTier === "premium" || membershipTier === "business",
          membershipTier,
          remainingListings: -1,
        };
      }
    },
    enabled,
    query: { staleTime: 0, refetchOnWindowFocus: true },
  });
  return {
    listingLimits: query.data ?? null,
    limitsLoading: query.isLoading && enabled,
    refetchLimits: query.refetch,
  };
}
