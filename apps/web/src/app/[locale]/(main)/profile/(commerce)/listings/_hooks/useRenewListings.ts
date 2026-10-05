/** @format */

"use client";

import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { useTranslations } from "next-intl";
import { listingsApi } from "@/lib/api";
import { useAuthStore } from "@/stores/authStore";
import { useWebMutation } from "@/hooks/useWebMutation";
import { LISTING_RESOURCE, RESOURCE } from "./useMyListings";
import {
  readRenewBatch,
  renewalFailureLines,
  type RenewResult,
} from "../_lib/renewal";
import type { Listing } from "../_lib/types";

/** Renewal changes the listing count the membership limit reads — refresh it too. */
const refreshLimits = () => {
  void useAuthStore.getState().refreshUserData?.();
};

/** Renew one expired listing — live again, or sent for approval if its content changed. */
export function useRenewListing() {
  const t = useTranslations();
  return useWebMutation(
    async (listingId: string) => {
      const response = await listingsApi.renew(listingId);
      return (response.data?.data ?? response.data) as RenewResult;
    },
    {
      invalidates: [RESOURCE, LISTING_RESOURCE],
      errorMessage: t("profile.expiredListings.renewFailed"),
      onSuccess: (result) => {
        toast.success(
          result.status === "active"
            ? t("profile.expiredListings.renewed")
            : t("profile.expiredListings.submitted"),
        );
        refreshLimits();
      },
    },
  );
}

/**
 * Renew several expired listings in one request. The API answers per listing, so
 * a partial failure (e.g. the membership limit filled up halfway) still renews
 * the rest; the failures are listed with their reason.
 */
export function useRenewListings() {
  const t = useTranslations();
  return useWebMutation(
    async (listings: Pick<Listing, "id" | "title">[]) => {
      const response = await listingsApi.renewMany(listings.map((l) => l.id));
      return {
        batch: readRenewBatch(response.data),
        titles: Object.fromEntries(listings.map((l) => [l.id, l.title])),
      };
    },
    {
      invalidates: [RESOURCE, LISTING_RESOURCE],
      errorMessage: t("profile.expiredListings.renewFailed"),
      onSuccess: ({ batch, titles }) => {
        if (batch.renewed > 0) {
          toast.success(
            t("profile.expiredListings.bulkRenewed", { count: batch.renewed }),
          );
        }
        if (batch.submitted > 0) {
          toast.success(
            t("profile.expiredListings.bulkSubmitted", {
              count: batch.submitted,
            }),
          );
        }
        if (batch.failed > 0) {
          const lines = renewalFailureLines(batch, (id) => titles[id] ?? id, t);
          toast.error(
            [
              t("profile.expiredListings.bulkFailed", { count: batch.failed }),
              ...lines,
            ].join("\n"),
          );
        }
        refreshLimits();
      },
    },
  );
}

/** Which expired listings are ticked for a bulk renewal. Drops ids that left the list. */
export function useListingSelection(listings: Pick<Listing, "id">[]) {
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());

  // A renewed listing leaves the "expired" list; its tick must not linger.
  useEffect(() => {
    const present = new Set(listings.map((l) => l.id));
    setSelected((current) => {
      const next = new Set([...current].filter((id) => present.has(id)));
      return next.size === current.size ? current : next;
    });
  }, [listings]);

  const toggle = useCallback((id: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }, []);
  const toggleAll = useCallback(() => {
    setSelected((current) =>
      current.size === listings.length
        ? new Set()
        : new Set(listings.map((l) => l.id)),
    );
  }, [listings]);
  const clear = useCallback(() => setSelected(new Set()), []);

  return {
    selected,
    selectedCount: selected.size,
    allSelected: listings.length > 0 && selected.size === listings.length,
    toggle,
    toggleAll,
    clear,
  };
}
