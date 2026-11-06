/** @format */

"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { InstallmentOptionsRequest } from "@tarodan/types";
import { paymentsApi } from "@/lib/api";
import { queryKeys } from "@/lib/query/keys";
import {
  INSTALLMENT_OPTIONS_DEBOUNCE_MS,
  installmentOfferOf,
  installmentSourceKey,
  type InstallmentCardSource,
  type InstallmentOffer,
} from "@/lib/installments";

/** Selector state: nothing to price yet, waiting for the answer, or the answer read. */
export type InstallmentOptionsState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "done"; offer: InstallmentOffer };

const UNAVAILABLE: InstallmentOffer = { kind: "single", reason: "unavailable" };

/** The answer without the counts `direct-form` refused for this card; none left = single. */
function withoutRefused(
  offer: InstallmentOffer,
  refused: number[],
): InstallmentOffer {
  if (offer.kind !== "options" || refused.length === 0) return offer;
  const options = offer.options.filter((o) => !refused.includes(o.count));
  return options.some((o) => o.count > 1)
    ? { ...offer, options }
    : { kind: "single", reason: "not_offered_for_payment" };
}

/** Round to kuruş: the API takes `amount` with at most two decimals. */
const toKurus = (value: number) => Math.round(value * 100) / 100;

/**
 * Installment options of the card form (`POST /payments/installment-options`,
 * ADR 0019). Same rules as the mobile M1 hook:
 *
 * - Priced for a payment (`paymentId`: the payment page, or checkout after
 *   the order exists) or, before that, for the checkout's goods total
 *   (`amount`, display only: `direct-form` prices again from the payment row
 *   and refuses a drift with a 409).
 * - The card source is debounced (300 ms). While the typed BIN differs from
 *   the debounced one the state is `loading`, so options of another card are
 *   never shown or payable.
 * - A changed source is a new key: the old query loses its observer and React
 *   Query aborts its request (the `signal` goes to axios); a late answer cannot
 *   land.
 * - The choice belongs to one card: any card change resets it to the single
 *   payment. A count `direct-form` refused (400 `installmentNotOffered`) is not
 *   offered again for that card.
 * - Every failure (network, 5xx, 429, 4xx) reads as the single payment with
 *   the `unavailable` note. The query function never throws (only an abort
 *   rejects, which the cache does not report), so the global query error
 *   reporter never sends this key, which holds up to 8 card digits, to
 *   Sentry. No retry and no refetch on focus: prices must not move under the
 *   buyer's choice; a drift comes back as a 409 and `refetch`.
 */
export function useInstallmentOptions(input: {
  paymentId?: string | null;
  /** Goods total T in TL the screen shows; part of the key. */
  amount?: number | null;
  source: InstallmentCardSource | null;
  enabled: boolean;
}) {
  const { paymentId, amount, source, enabled } = input;
  const sourceKey = installmentSourceKey(source);
  const hasTarget =
    !!paymentId ||
    (typeof amount === "number" && Number.isFinite(amount) && amount > 0);

  // Choice per card, with the counts direct-form refused for it. A card
  // change resets both during render, so no stale count is shown or payable
  // for even one frame.
  const [choice, setChoice] = useState<{
    key: string | null;
    count: number;
    refused: number[];
  }>({ key: sourceKey, count: 1, refused: [] });
  const current =
    choice.key === sourceKey
      ? choice
      : { key: sourceKey, count: 1, refused: [] };
  if (current !== choice) setChoice(current);

  // The debounced card; its key is derived (one source of truth).
  const [debounced, setDebounced] = useState<InstallmentCardSource | null>(
    source,
  );
  const debouncedKey = installmentSourceKey(debounced);
  useEffect(() => {
    if (!enabled || debouncedKey === sourceKey) return;
    const timer = setTimeout(
      () => setDebounced(source),
      INSTALLMENT_OPTIONS_DEBOUNCE_MS,
    );
    return () => clearTimeout(timer);
    // `source` is identified by `sourceKey`: a new object with the same key
    // is the same card.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, sourceKey, debouncedKey]);

  const amountKey =
    !paymentId && typeof amount === "number" ? String(toKurus(amount)) : "";
  const active = enabled && hasTarget && debounced !== null;
  const query = useQuery({
    queryKey: queryKeys.payments.installmentOptions(
      paymentId ?? "",
      amountKey,
      debouncedKey ?? "",
    ),
    queryFn: async ({ signal }): Promise<InstallmentOffer> => {
      const card = debounced as InstallmentCardSource;
      const body: InstallmentOptionsRequest = {
        ...(card.kind === "bin"
          ? { bin: card.bin }
          : { savedCardId: card.savedCardId }),
        ...(paymentId ? { paymentId } : { amount: toKurus(amount as number) }),
      };
      try {
        const res = await paymentsApi.installmentOptions(body, { signal });
        return installmentOfferOf(res.data);
      } catch (error) {
        // An abort belongs to a superseded card: React Query drops it.
        if (signal.aborted) throw error;
        return UNAVAILABLE;
      }
    },
    enabled: active,
    retry: false,
    staleTime: 0,
    gcTime: 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  // Read every flag on each render: React Query re-renders only for the
  // fields a render read, and a short-circuit could leave one unread.
  const { isPending, isFetching, isError, data } = query;
  let state: InstallmentOptionsState;
  if (!enabled || !hasTarget || !sourceKey) state = { status: "idle" };
  else if (debouncedKey !== sourceKey || isPending || isFetching) {
    state = { status: "loading" };
  } else if (isError || !data) state = { status: "done", offer: UNAVAILABLE };
  else {
    state = {
      status: "done",
      offer: withoutRefused(data, current.refused),
    };
  }

  const offer = state.status === "done" ? state.offer : null;
  // Only an option of the current answer is payable; while it loads (or
  // after a refusal) the payment is single.
  const chosen =
    offer?.kind === "options" && current.count > 1
      ? (offer.options.find((o) => o.count === current.count) ?? null)
      : null;

  return {
    state,
    /** Identity of the card the state belongs to (`installmentSourceKey`). */
    sourceKey,
    /** The count above 1 the buyer picked and the current answer offers; `null` = single. */
    chosen,
    /** The count the radio group shows as checked. */
    selectedCount: chosen ? chosen.count : 1,
    /** A count above 1 is picked and its price is being read: no payment until it is shown. */
    pending: current.count > 1 && state.status === "loading",
    select: (count: number) => setChoice({ ...current, count }),
    resetToSingle: () => setChoice({ ...current, count: 1 }),
    /** direct-form refused the picked count for this card: back to single, not offered again. */
    refuseChosen: () =>
      setChoice({
        ...current,
        count: 1,
        refused:
          current.count > 1
            ? [...current.refused, current.count]
            : current.refused,
      }),
    /** Reads the options again; joins a request already in flight for the same key. */
    refetch: () => query.refetch({ cancelRefetch: false }),
  };
}

export type InstallmentOptionsHook = ReturnType<typeof useInstallmentOptions>;
