/** @format */

"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { collectionsApi, categoriesApi } from "@/lib/api";
import { queryKeys } from "@/lib/query/keys";
import {
  flattenCategories,
  type Collection,
  type SortOption,
} from "../_lib/types";

/**
 * The user's collections + the category tree, with client-side search/sort
 * applied. Owns the search/sort state so the page stays thin.
 */
export function useMyCollections(isAuthenticated: boolean) {
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<SortOption>("recent");

  const categoriesQuery = useQuery({
    queryKey: queryKeys.categories.collections(),
    queryFn: async () => {
      const res = await categoriesApi.findAll({ refresh: "1" });
      return res.data?.data ?? res.data ?? [];
    },
    meta: { page: "my-collections-categories" },
  });
  const flatCategories = useMemo(
    () =>
      Array.isArray(categoriesQuery.data)
        ? flattenCategories(categoriesQuery.data)
        : [],
    [categoriesQuery.data],
  );

  const myQuery = useQuery({
    queryKey: queryKeys.collections.mine(),
    queryFn: async (): Promise<Collection[]> => {
      const response = await collectionsApi.getMyCollections();
      const data = response.data?.collections || response.data?.data || [];
      return Array.isArray(data) ? data : [];
    },
    enabled: isAuthenticated,
    meta: { page: "my-collections" },
  });
  const myCollections = myQuery.data ?? [];
  const loading = myQuery.isLoading && !myQuery.data;

  const displayedCollections = useMemo(() => {
    let result = myQuery.data ?? [];
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      result = result.filter(
        (collection) =>
          collection.name.toLowerCase().includes(query) ||
          collection.description?.toLowerCase().includes(query),
      );
    }
    const sorted = [...result];
    switch (sortBy) {
      case "popular":
        sorted.sort((a, b) => (b.viewCount || 0) - (a.viewCount || 0));
        break;
      case "recent":
        sorted.sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
        );
        break;
      case "name": {
        const collator = new Intl.Collator("tr", {
          sensitivity: "base",
          numeric: false,
        });
        sorted.sort((a, b) =>
          collator.compare(a.name.toLowerCase(), b.name.toLowerCase()),
        );
        break;
      }
      case "items_asc":
        sorted.sort((a, b) => (a.itemCount || 0) - (b.itemCount || 0));
        break;
      case "items_desc":
        sorted.sort((a, b) => (b.itemCount || 0) - (a.itemCount || 0));
        break;
    }
    return sorted;
  }, [myQuery.data, searchQuery, sortBy]);

  return {
    flatCategories,
    myCollections,
    displayedCollections,
    loading,
    searchQuery,
    setSearchQuery,
    sortBy,
    setSortBy,
  };
}
