/** @format */

"use client";

import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import type { SavedSearch } from "@tarodan/types";
import { membershipApi, savedSearchesApi } from "@/lib/api";
import { queryKeys } from "@/lib/query/keys";
import { useWebList } from "@/hooks/useWebResource";
import { useWebMutation } from "@/hooks/useWebMutation";
import { useRouter } from "@/i18n/navigation";
import { useConfirm } from "@/components/ConfirmProvider";
import { savedSearchRunHref } from "../_lib/runHref";

/** The device-local list the page kept before the server list. Discarded, not imported. */
const LEGACY_STORAGE_KEY = "diecast_saved_searches";

interface SavedSearchList {
  items: SavedSearch[];
  total: number;
}

/**
 * The server list of saved searches (`GET /saved-searches`) with the tier
 * limit, delete (with confirm) and run. The first call also discards the old
 * localStorage list, once and without importing it.
 */
export function useSavedSearches(enabled: boolean) {
  const t = useTranslations();
  const router = useRouter();
  const confirm = useConfirm();

  useEffect(() => {
    if (!enabled) return;
    try {
      localStorage.removeItem(LEGACY_STORAGE_KEY);
    } catch {
      // Storage can be blocked (private window); nothing to discard then.
    }
  }, [enabled]);

  const list = useWebList<SavedSearchList>({
    resource: queryKeys.savedSearches.resource,
    fetcher: async () => {
      const body = (await savedSearchesApi.list()).data;
      const items: SavedSearch[] = body?.data ?? [];
      return { items, total: body?.meta?.total ?? items.length };
    },
    enabled,
    query: { meta: { page: "profile-saved-searches" } },
  });

  // Always the server's value for the effective tier: 0 is a valid limit.
  const limit = useQuery({
    queryKey: queryKeys.membership.savedSearchLimit(),
    queryFn: async (): Promise<number | null> => {
      const value = (await membershipApi.getLimits()).data?.maxSavedSearches;
      return typeof value === "number" ? value : null;
    },
    enabled,
    staleTime: 5 * 60 * 1000,
  });

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
    total: list.data?.total ?? 0,
    limit: limit.data ?? null,
    isLoading: list.isLoading,
    isError: list.isError,
    refetch: list.refetch,
    remove,
    runSearch,
  };
}
