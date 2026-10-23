/** @format */

import {
  listingPath,
  listingPathSegment,
  type ListingUrlSource,
} from "@tarodan/types";

/** A page's `searchParams` as Next hands them over. */
export type RouteSearchParams = Record<string, string | string[] | undefined>;

/**
 * Where a listing request must permanently redirect to, or null when the
 * requested `[id]` segment is already canonical (ADR 0017).
 *
 * The canonical segment is `<slug>-<uuid>` built from the CURRENT title by the
 * same function every link uses, so a bare UUID, an upper-cased UUID or a
 * stale slug after a title edit all land on one URL, and the canonical URL
 * itself never redirects (no loop). The path is locale-less: the caller's
 * locale-aware redirect adds the `/en` prefix.
 */
export function canonicalListingPath(
  segment: string,
  listing: ListingUrlSource,
): string | null {
  return segment === listingPathSegment(listing) ? null : listingPath(listing);
}

/**
 * The redirect target for next-intl's `permanentRedirect`: the canonical path
 * plus the request's query (`?boost=`, utm tags), with the keys Next left
 * undefined dropped and repeated keys kept as arrays. A plain path when there
 * is no query, so the target carries no stray `?`.
 */
export function canonicalRedirectHref(
  pathname: string,
  searchParams: RouteSearchParams,
): string | { pathname: string; query: Record<string, string | string[]> } {
  const query: Record<string, string | string[]> = {};
  for (const [key, value] of Object.entries(searchParams)) {
    if (value !== undefined) query[key] = value;
  }
  return Object.keys(query).length > 0 ? { pathname, query } : pathname;
}
