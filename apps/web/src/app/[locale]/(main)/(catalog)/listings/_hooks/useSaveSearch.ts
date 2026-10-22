/** @format */

"use client";

import { useMemo, useState } from "react";
import toast from "react-hot-toast";
import { useTranslations } from "next-intl";
import { SAVED_SEARCH_ERROR_CODES, type SavedSearch } from "@tarodan/types";
import { savedSearchesApi } from "@/lib/api";
import { queryKeys } from "@/lib/query/keys";
import { useAuthGate } from "@/hooks/useAuthGate";
import {
  apiErrorCode,
  apiErrorMessage,
  useWebMutation,
} from "@/hooks/useWebMutation";
import { useListings } from "../_context/ListingsContext";
import { priceFilterIssueMessage, priceRangeIssue } from "../_lib/params";
import {
  buildSavedSearchDraft,
  toCreateSavedSearchInput,
} from "../_lib/savedSearch";

/** Why the last save was refused, shown inside the modal. */
export type SaveSearchRefusal =
  { kind: "duplicate" } | { kind: "limit"; limit: number | null };

/** The top-level `limit` of the 403 `SAVED_SEARCH_LIMIT` body. */
function refusalLimit(error: unknown): number | null {
  const limit = (error as { response?: { data?: { limit?: unknown } } })
    ?.response?.data?.limit;
  return typeof limit === "number" ? limit : null;
}

/**
 * "Save this search" on the listings page: the canonical draft of the live
 * filters, the sign-in prompt for a guest (the shared `useAuthGate`, which
 * returns them here after sign-in), and the save mutation with its 409 / 403
 * states. Render `authModal` next to the button.
 */
export function useSaveSearch() {
  const t = useTranslations();
  const { requireAuth, authModal } = useAuthGate();
  const { filtersForSidebar } = useListings();
  const [open, setOpen] = useState(false);
  const [refusal, setRefusal] = useState<SaveSearchRefusal | null>(null);

  const draft = useMemo(
    () =>
      buildSavedSearchDraft(filtersForSidebar, filtersForSidebar.categoryId),
    [filtersForSidebar],
  );

  const close = () => {
    setOpen(false);
    setRefusal(null);
  };

  const mutation = useWebMutation(
    (name: string) =>
      savedSearchesApi
        .create(toCreateSavedSearchInput(draft, name))
        .then((res) => res.data as SavedSearch),
    {
      invalidates: [queryKeys.savedSearches.resource],
      successMessage: t("savedSearch.saved"),
      // The 409 / 403 are shown in the modal; other errors are toasted below.
      silentError: true,
      onSuccess: close,
    },
  );

  /** The toolbar button: guests get the sign-in prompt, signed-in users the modal. */
  const start = () => {
    if (draft.isEmpty) return;
    // A refused or too large price is not applied to the search, so saving
    // now would store a search without the bound the user typed: show why.
    const priceIssue = priceRangeIssue(filtersForSidebar);
    if (priceIssue) {
      toast.error(priceFilterIssueMessage(priceIssue, t));
      return;
    }
    if (
      !requireAuth({
        title: t("savedSearch.saveTitle"),
        message: t("savedSearch.signInToSave"),
      })
    )
      return;
    setRefusal(null);
    setOpen(true);
  };

  const save = (name: string) => {
    setRefusal(null);
    mutation.mutate(name, {
      onError: (error) => {
        const code = apiErrorCode(error);
        if (code === SAVED_SEARCH_ERROR_CODES.duplicate) {
          setRefusal({ kind: "duplicate" });
        } else if (code === SAVED_SEARCH_ERROR_CODES.limitReached) {
          setRefusal({ kind: "limit", limit: refusalLimit(error) });
        } else {
          toast.error(apiErrorMessage(error) ?? t("savedSearch.saveFailed"));
        }
      },
    });
  };

  return {
    draft,
    open,
    refusal,
    isSaving: mutation.isPending,
    authModal,
    start,
    save,
    close,
  };
}
