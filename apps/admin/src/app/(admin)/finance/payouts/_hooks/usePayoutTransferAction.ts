"use client";

import { useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import toast from "react-hot-toast";
import {
  invalidateAdminResources,
  useAdminMutation,
} from "@/hooks/useAdminMutation";
import {
  PAYOUT_TRANSFER_RESOURCES,
  payoutActionError,
  type PayoutActionError,
} from "../_lib/resolution";

/**
 * One payout resolution request (retry, mark as paid):
 * - at most one in flight: a second click, or Enter in a field, while the
 *   first request runs is dropped (the API is idempotent, but a second
 *   request would show a second, confusing result);
 * - the transfer list and its summary reload after success;
 * - an error that says the row changed (or the list was stale) reloads the
 *   list, shows the API's message and calls `onStale` (the dialog closes:
 *   its amounts and options are no longer the row's); any other error goes
 *   to `onError` (the dialog shows it) or, without one, to a toast.
 */
export function usePayoutTransferAction<TVars, TData>(
  request: (vars: TVars) => Promise<TData>,
  opts: {
    onSuccess: (data: TData) => void;
    onError?: (error: PayoutActionError) => void;
    onStale?: () => void;
  },
) {
  const t = useTranslations();
  const queryClient = useQueryClient();
  const inFlight = useRef(false);
  const mutation = useAdminMutation(request, {
    invalidates: [...PAYOUT_TRANSFER_RESOURCES],
    showErrorToast: false,
    onSuccess: (data) => opts.onSuccess(data),
  });

  const submit = (vars: TVars) => {
    if (inFlight.current) return;
    inFlight.current = true;
    mutation.mutate(vars, {
      onSettled: () => {
        inFlight.current = false;
      },
      onError: (raw) => {
        const error = payoutActionError(raw, t("common.operationFailed"));
        if (error.refresh) {
          invalidateAdminResources(queryClient, PAYOUT_TRANSFER_RESOURCES);
          toast.error(error.message);
          opts.onStale?.();
        } else if (opts.onError) {
          opts.onError(error);
        } else {
          toast.error(error.message);
        }
      },
    });
  };

  return {
    submit,
    isPending: mutation.isPending,
    /** The request in flight, for a per-row spinner. */
    pendingVars: mutation.isPending ? mutation.variables : undefined,
  };
}
