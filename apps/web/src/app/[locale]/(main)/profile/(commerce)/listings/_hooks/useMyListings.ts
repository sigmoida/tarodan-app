/** @format */

"use client";

import { userApi, api, listingsApi } from "@/lib/api";
import { useAuthStore } from "@/stores/authStore";
import { useWebList } from "@/hooks/useWebResource";
import { useWebMutation } from "@/hooks/useWebMutation";
import type { Listing } from "../_lib/types";
import { useTranslations } from "next-intl";

const RESOURCE = "profile-listings";
/** The listing detail cache (queryKeys.product.detail → ["listing", id]). */
const LISTING_RESOURCE = "listing";

/** The user's listings for the active status filter. `all` fetches everything. */
export function useMyListings(activeFilter: string, enabled: boolean) {
  const query = useWebList<Listing[]>({
    resource: RESOURCE,
    params: activeFilter,
    fetcher: async () => {
      const params: Record<string, any> = { limit: 100, page: 1 };
      if (activeFilter && activeFilter !== "all") params.status = activeFilter;
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

/** Delete a listing — owns the toast + cache invalidation (the only way to mutate). */
export function useDeleteListing() {
  const t = useTranslations();
  return useWebMutation(
    async (listingId: string) => {
      await api.delete(`/products/${listingId}`);
      return listingId;
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

export function useDeactivateListing() {
  const t = useTranslations();
  return useWebMutation(
    async (listingId: string) => {
      await listingsApi.update(listingId, { status: "inactive" } as any);
      return listingId;
    },
    {
      invalidates: [RESOURCE, LISTING_RESOURCE],
      successMessage: t("profile.myListings.ilanPasifeAlindi"),
      errorMessage: t("profile.myListings.ilanPasifeAlinamadi"),
    },
  );
}
