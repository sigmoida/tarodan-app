/** @format */

"use client";

import { userApi, listingsApi, type ListingRemovalPayload } from "@/lib/api";
import { useAuthStore } from "@/stores/authStore";
import { useWebList } from "@/hooks/useWebResource";
import { useWebMutation } from "@/hooks/useWebMutation";
import type { Listing } from "../_lib/types";
import { listingFilterParams } from "../_lib/status";
import { useTranslations } from "next-intl";

export const RESOURCE = "profile-listings";
/** The listing detail cache (queryKeys.product.detail → ["listing", id]). */
export const LISTING_RESOURCE = "listing";

/** The user's listings for the active status filter. `all` fetches everything. */
export function useMyListings(activeFilter: string, enabled: boolean) {
  const query = useWebList<Listing[]>({
    resource: RESOURCE,
    params: activeFilter,
    fetcher: async () => {
      const params: Record<string, any> = {
        limit: 100,
        page: 1,
        ...listingFilterParams(activeFilter),
      };
      const response = await userApi.getMyProducts(params);
      const data =
        response.data?.data || response.data?.products || response.data || [];
      return Array.isArray(data) ? data : [];
    },
    enabled,
    query: { meta: { page: "profile-listings" } },
  });

  return { listings: query.data ?? [], isLoading: query.isLoading };
}

/** A seller removal: which listing, and why (asked by `ListingRemovalModal`). */
export interface ListingRemovalRequest {
  id: string;
  removal: ListingRemovalPayload;
}

/** Delete a listing — owns the toast + cache invalidation (the only way to mutate). */
export function useDeleteListing() {
  const t = useTranslations();
  return useWebMutation(
    async ({ id, removal }: ListingRemovalRequest) => {
      await listingsApi.delete(id, removal);
      return id;
    },
    {
      invalidates: [RESOURCE, LISTING_RESOURCE],
      successMessage: t("profile.myListings.ilanSilindi"),
      errorMessage: t("profile.myListings.ilanSilinemedi"),
      onSuccess: () => {
        void useAuthStore.getState().refreshUserData?.();
      },
    },
  );
}

/** Deactivate (pause) a listing with the seller's reason. */
export function useDeactivateListing() {
  const t = useTranslations();
  return useWebMutation(
    async ({ id, removal }: ListingRemovalRequest) => {
      await listingsApi.deactivate(id, removal);
      return id;
    },
    {
      invalidates: [RESOURCE, LISTING_RESOURCE],
      successMessage: t("profile.myListings.ilanPasifeAlindi"),
      errorMessage: t("profile.myListings.ilanPasifeAlinamadi"),
    },
  );
}
