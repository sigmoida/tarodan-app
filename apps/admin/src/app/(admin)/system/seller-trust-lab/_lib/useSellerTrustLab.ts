"use client";

import { useState } from "react";
import { useQuery, type QueryKey } from "@tanstack/react-query";
import type {
  SellerTrustLabPopulation,
  SellerTrustLabPopulationRequest,
  SellerTrustLabScenarioRequest,
  SellerTrustLabScenarioResult,
  SellerTrustLabSeller,
  SellerTrustLabSellerRequest,
} from "@tarodan/types";
import { adminApi } from "@/lib/api";
import { adminKeys } from "@/lib/query/keys";

const keys = adminKeys.sellerTrustLab;

/** Formula v1, its limits and the environment: the page cannot open without it. */
export function useLabParams() {
  return useQuery({
    queryKey: keys.params(),
    queryFn: async () => (await adminApi.getSellerTrustLabParams()).data,
    retry: false,
  });
}

/** The ten approved reference scenarios. */
export function useLabScenarios() {
  return useQuery({
    queryKey: keys.scenarios(),
    queryFn: async () => (await adminApi.getSellerTrustLabScenarios()).data,
    retry: false,
  });
}

/**
 * A lab call that is a POST but a read: it runs when the user submits and is
 * keyed on the submitted request. No invalidation, no toast; an error goes to
 * the card's error state. Results hold real seller data, so they are dropped
 * as soon as nothing shows them (`gcTime: 0`) and never served stale.
 * The seller and population calls are audited, so only a user action (a
 * click, or opening a `?userId=` deep link) may run one: focus, a network
 * reconnect and a remount never refetch on their own.
 */
function useSubmittedQuery<Req, Res>(
  keyOf: (request: Req) => QueryKey,
  run: (request: Req) => Promise<Res>,
) {
  const [request, setRequest] = useState<Req | null>(null);
  const query = useQuery({
    queryKey:
      request === null ? adminKeys.all("seller-trust-lab") : keyOf(request),
    queryFn: () => run(request as Req),
    enabled: request !== null,
    staleTime: 0,
    gcTime: 0,
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: false,
  });
  const submit = (next: Req) => {
    // The same request again is a re-run, not a new key.
    if (request !== null && JSON.stringify(next) === JSON.stringify(request)) {
      void query.refetch();
    } else {
      setRequest(next);
    }
  };
  const clear = () => setRequest(null);
  return { request, query, submit, clear };
}

export function useLabSeller() {
  return useSubmittedQuery<
    { userId: string; body: SellerTrustLabSellerRequest },
    SellerTrustLabSeller
  >(
    (r) => keys.seller(r.userId, r.body),
    async (r) =>
      (await adminApi.runSellerTrustLabSeller(r.userId, r.body)).data,
  );
}

export function useLabScenario() {
  return useSubmittedQuery<
    SellerTrustLabScenarioRequest,
    SellerTrustLabScenarioResult
  >(
    (r) => keys.scenario(r),
    async (r) => (await adminApi.runSellerTrustLabScenario(r)).data,
  );
}

export function useLabPopulation() {
  return useSubmittedQuery<
    SellerTrustLabPopulationRequest,
    SellerTrustLabPopulation
  >(
    (r) => keys.population(r),
    async (r) => (await adminApi.runSellerTrustLabPopulation(r)).data,
  );
}
