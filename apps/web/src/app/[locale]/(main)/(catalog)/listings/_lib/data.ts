/**
 * The SINGLE fetch source for the listings route.
 *
 * Both the server page (SSR seed) and the client query unwrap raw `/products`
 * responses through the exact same `unwrapListings`, so the seeded first page
 * matches the client's first refetch byte-for-byte. `buildListApiParams`
 * (`_lib/params.ts`) stays the single source of truth for the query params;
 * this module only owns the actual transport + unwrap.
 */

import { listingsApi } from "@/lib/api";
import { PAGE_LIMIT, buildListApiParams, type Filters } from "./params";

export const API_BASE =
  process.env.API_INTERNAL_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "http://localhost:3001";

export interface ListingsResult {
  listings: unknown[];
  meta: unknown;
}

interface CategoryLite {
  id: string;
  name: string;
  slug: string;
}

/**
 * Unwrap a raw `/products` response into `{ listings, meta }`. This is the ONE
 * unwrap used on both server and client so the seeded page equals the refetch.
 */
export function unwrapListings(raw: any, page: number): ListingsResult {
  const listings = Array.isArray(raw)
    ? raw
    : (raw?.data ?? raw?.products ?? []);
  const meta = raw?.meta || {
    total: listings.length,
    page,
    limit: PAGE_LIMIT,
    totalPages: 1,
  };
  return { listings, meta };
}

/**
 * Resolve a category slug → {id,name,slug} server-side (public, no auth).
 * Mirrors the client `categoriesApi.findBySlug` (axios returns the body
 * directly). Returns null on any failure so seeding is simply skipped.
 */
export async function fetchCategoryServer(
  slug: string,
): Promise<CategoryLite | null> {
  try {
    const res = await fetch(
      `${API_BASE}/api/categories/slug/${encodeURIComponent(slug)}`,
      { next: { revalidate: 60 } },
    );
    if (!res.ok) return null;
    const cat = await res.json();
    if (!cat?.id) return null;
    return { id: cat.id, name: cat.name, slug: cat.slug };
  } catch {
    return null;
  }
}

/**
 * Fetch the first listings page server-side, unwrapped EXACTLY like the client
 * queryFn (`raw` → `{ listings, meta }`). Returns null on failure so the seed is
 * skipped and the client fetches it.
 */
export async function fetchListingsServer(
  params: Record<string, string | number | boolean>,
  page: number,
): Promise<ListingsResult | null> {
  try {
    const qs = new URLSearchParams(
      Object.entries(params).map(([k, v]) => [k, String(v)]),
    ).toString();
    const res = await fetch(`${API_BASE}/api/products?${qs}`, {
      next: { revalidate: 60 },
    });
    if (!res.ok) return null;
    const raw = await res.json();
    return unwrapListings(raw, page);
  } catch {
    return null;
  }
}

/**
 * The client-side listings fetch used by the `useQuery` queryFn. Builds the
 * params via the shared `buildListApiParams`, calls the axios `/products`
 * endpoint, and unwraps identically to the server seed.
 */
export async function fetchListingsClient(
  filters: Filters,
  resolvedCategoryId: string | undefined,
  page: number,
): Promise<ListingsResult> {
  const params = buildListApiParams(
    filters,
    resolvedCategoryId,
    page,
    PAGE_LIMIT,
  );
  const response = await listingsApi.getAll(params);
  return unwrapListings(response?.data, page);
}
