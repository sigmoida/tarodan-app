/** @format */

"use client";

import { useEffect, useState } from "react";
import { useRouter } from "@/i18n/navigation";
import toast from "react-hot-toast";
import { useConfirm } from "@/components/ConfirmProvider";
import { STORAGE_KEY, type SavedSearch } from "../_lib/types";
import { useTranslations } from "next-intl";

/**
 * localStorage-backed saved searches: load on mount, delete (with confirm),
 * toggle notifications, and run a saved search by building the listings URL.
 */
export function useSavedSearches(enabled: boolean) {
  const t = useTranslations();
  const router = useRouter();
  const confirm = useConfirm();
  const [savedSearches, setSavedSearches] = useState<SavedSearch[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!enabled) return;
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) setSavedSearches(JSON.parse(stored));
    } catch (error) {
      if (process.env.NODE_ENV === "development")
        console.error(
          t("profile.savedSearches.failedToLoadSavedSearches"),
          error,
        );
    } finally {
      setIsLoading(false);
    }
  }, [enabled]);

  const persist = (searches: SavedSearch[]) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(searches));
    setSavedSearches(searches);
  };

  const remove = async (id: string) => {
    if (
      !(await confirm({
        title: t("profile.savedSearches.aramayiSil"),
        description: t(
          "profile.savedSearches.buAramayiSilmekIstediginizdenEminMisiniz",
        ),
        confirmLabel: "Sil",
        destructive: true,
      }))
    )
      return;
    persist(savedSearches.filter((s) => s.id !== id));
    toast.success(t("profile.savedSearches.aramaSilindi"));
  };

  const toggleNotify = (id: string) => {
    const updated = savedSearches.map((s) =>
      s.id === id ? { ...s, notifyEnabled: !s.notifyEnabled } : s,
    );
    persist(updated);
    const search = updated.find((s) => s.id === id);
    toast.success(
      search?.notifyEnabled
        ? t("profile.savedSearches.bildirimlerAcildi")
        : t("profile.savedSearches.bildirimlerKapatildi"),
    );
  };

  const runSearch = (search: SavedSearch) => {
    const params = new URLSearchParams();
    if (search.query) params.set("q", search.query);
    if (search.filters?.category)
      params.set("category", search.filters.category);
    if (search.filters?.brand) params.set("brand", search.filters.brand);
    if (search.filters?.minPrice)
      params.set("minPrice", String(search.filters.minPrice));
    if (search.filters?.maxPrice)
      params.set("maxPrice", String(search.filters.maxPrice));
    if (search.filters?.condition)
      params.set("condition", search.filters.condition);
    router.push(`/listings?${params.toString()}`);
  };

  return { savedSearches, isLoading, remove, toggleNotify, runSearch };
}
