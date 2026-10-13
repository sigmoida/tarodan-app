/** @format */

import type { QueryClient } from "@tanstack/react-query";
import { queryKeys } from "./keys";

/**
 * Üyelik değişince bayatlayan sorgular — TEK liste. `me` (katman / durum /
 * dönem) ile birlikte `limits` de tazelenir: reklamsızlık (`isAdFree`) ve ilan
 * limitleri katmandan gelir, yoksa yeni reklamsız üye 5 dk boyunca banner görür
 * (ya da düşüren üye görmez).
 */
export function invalidateMembershipQueries(queryClient: QueryClient) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.membership.me() }),
    queryClient.invalidateQueries({ queryKey: queryKeys.membership.limits() }),
  ]);
}
