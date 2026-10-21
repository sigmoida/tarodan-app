/** @format */

"use client";

import { useTranslations } from "next-intl";
import type { SavedSearch } from "@tarodan/types";
import { savedSearchesApi } from "@/lib/api";
import { queryKeys } from "@/lib/query/keys";
import { unwrapList } from "@/lib/unwrapList";
import { useWebList } from "@/hooks/useWebResource";
import { useWebMutation } from "@/hooks/useWebMutation";
import {
  useMembershipLimits,
  type MembershipLimits,
} from "@/hooks/useMembershipLimits";
import { useSavedSearchUpgrade } from "@/hooks/useSavedSearchUpgrade";
import { useListingFiltersQuery } from "@/hooks/useListingFiltersQuery";
import { useRouter } from "@/i18n/navigation";
import { useConfirm } from "@/components/ConfirmProvider";
import { savedSearchRunHref } from "../_lib/runHref";

interface SavedSearchList {
  items: SavedSearch[];
  total: number;
}

/** Always the server's value for the effective tier: 0 is a valid limit. */
const selectSavedSearchLimit = (limits: MembershipLimits): number | null =>
  typeof limits.maxSavedSearches === "number" ? limits.maxSavedSearches : null;

/**
 * Every page of `GET /saved-searches`. Launch tiers fit in one page of 100,
 * but an admin can set a tier up to `SAVED_SEARCH_TIER_LIMIT_MAX`, and a
 * search past the first page must still be visible and deletable. The other
 * pages load in parallel; an id that shifts onto two pages (a save in
 * another tab meanwhile) is kept once.
 */
async function fetchAllSavedSearches(): Promise<SavedSearchList> {
  const first = (await savedSearchesApi.list(1)).data;
  const totalPages = Number(first?.meta?.totalPages) || 1;
  const rest = await Promise.all(
    Array.from({ length: Math.max(totalPages - 1, 0) }, (_, i) =>
      savedSearchesApi.list(i + 2).then((res) => res.data),
    ),
  );
  const byId = new Map<string, SavedSearch>();
  for (const page of [first, ...rest]) {
    for (const item of unwrapList<SavedSearch>(page)) {
      if (!byId.has(item.id)) byId.set(item.id, item);
    }
  }
  const items = [...byId.values()];
  const total = Number(first?.meta?.total);
  return { items, total: Number.isFinite(total) ? total : items.length };
}

/**
 * The server list of saved searches (`GET /saved-searches`) with the tier
 * limit, delete (with confirm) and run. The old localStorage list is
 * discarded app-wide by the auth store (`clearLegacyStorageKeys`).
 */
export function useSavedSearches(enabled: boolean) {
  const t = useTranslations();
  const router = useRouter();
  const confirm = useConfirm();

  const list = useWebList<SavedSearchList>({
    resource: queryKeys.savedSearches.resource,
    fetcher: fetchAllSavedSearches,
    enabled,
    query: { meta: { page: "profile-saved-searches" } },
  });

  const limit =
    useMembershipLimits(selectSavedSearchLimit, { enabled }).data ?? null;
  const total = list.data?.total ?? 0;
  const atLimit = limit !== null && total >= limit;
  // The tier rows are read only when the limit alert (and its link) shows.
  const canUpgrade = useSavedSearchUpgrade(atLimit ? limit : null);
  // The colour names of the chips: one read of the shared filter catalog,
  // only when a saved search filters by colour.
  const needsColors = !!list.data?.items.some((search) => search.query.color);
  const colorOptions = useListingFiltersQuery({
    enabled: enabled && needsColors,
  }).data?.colors;

  const deleteMutation = useWebMutation(
    (id: string) => savedSearchesApi.remove(id),
    {
      invalidates: [queryKeys.savedSearches.resource],
      successMessage: t("savedSearch.deleted"),
      errorMessage: t("savedSearch.deleteFailed"),
    },
  );

  const remove = async (search: SavedSearch) => {
    const confirmed = await confirm({
      title: t("savedSearch.deleteTitle"),
      description: t("savedSearch.deleteConfirm", {
        name: search.name ?? t("savedSearch.untitled"),
      }),
      confirmLabel: t("common.delete"),
      destructive: true,
    });
    if (confirmed) deleteMutation.mutate(search.id);
  };

  const runSearch = (search: SavedSearch) =>
    router.push(savedSearchRunHref(search));

  return {
    savedSearches: list.data?.items ?? [],
    total,
    limit,
    atLimit,
    canUpgrade,
    colorOptions,
    isLoading: list.isLoading,
    isError: list.isError,
    refetch: list.refetch,
    remove,
    runSearch,
  };
}
