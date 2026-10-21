import { savedSearchToRouteParams, type SavedSearch } from "@tarodan/types";

/**
 * The `/listings` URL that reproduces a saved search. The shared
 * `savedSearchToRouteParams` emits the names `/listings` reads (`search`,
 * `tradeOnly`, `attr.<group>`, the display names next to the ids), so there is
 * no local mapping to drift.
 */
export function savedSearchRunHref({
  query,
  labels,
}: Pick<SavedSearch, "query" | "labels">): string {
  const qs = new URLSearchParams(savedSearchToRouteParams(query, labels));
  const search = qs.toString();
  return search ? `/listings?${search}` : "/listings";
}
