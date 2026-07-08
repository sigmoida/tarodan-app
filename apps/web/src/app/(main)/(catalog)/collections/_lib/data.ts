/**
 * The SINGLE fetch source for the collections list route.
 *
 * Both the server page (SSR seed) and the client queries unwrap raw responses
 * through the exact same helpers, so the seeded first page matches the client's
 * first refetch byte-for-byte. `buildBrowseParams` is the single source of truth
 * for the browse query params; this module owns transport + unwrap only.
 */

import { collectionsApi, categoriesApi } from '@/lib/api';

export const API_BASE =
  process.env.API_INTERNAL_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  'http://localhost:3001';

export const PUBLIC_PAGE_SIZE = 24;

export interface Collection {
  id: string;
  name: string;
  description?: string;
  coverImageUrl?: string;
  isPublic: boolean;
  itemCount: number;
  createdAt: string;
  viewCount?: number;
  likeCount?: number;
  userName?: string;
  categoryId?: string | null;
  category?: { id: string; name: string; slug: string } | null;
  user?: {
    id: string;
    displayName: string;
  };
}

export type SortOption = 'popular' | 'recent' | 'name' | 'items_asc' | 'items_desc';

export interface PublicCollectionsResult {
  collections: Collection[];
  total: number;
  page: number;
  pageSize: number;
}

export interface CategoryNode {
  id: string;
  name: string;
  slug: string;
  children?: CategoryNode[];
}

export function flattenCategories(
  tree: CategoryNode[],
  prefix = '',
): { id: string; name: string; slug: string }[] {
  const out: { id: string; name: string; slug: string }[] = [];
  for (const c of tree) {
    out.push({ id: c.id, name: prefix ? `${prefix} ${c.name}` : c.name, slug: c.slug });
    if (c.children?.length) {
      out.push(...flattenCategories(c.children, '—'));
    }
  }
  return out;
}

/**
 * The browse params, built identically for the server seed and the client
 * `useQuery`. `search`/`categoryId` are expected already-trimmed.
 */
export function buildBrowseParams(
  sortBy: SortOption,
  search: string,
  categoryId: string,
): Record<string, string> {
  return {
    sortBy,
    ...(search ? { search } : {}),
    ...(categoryId ? { categoryId } : {}),
  };
}

/**
 * Unwrap a raw `/collections/browse` response body into the grid shape. This is
 * the ONE unwrap used on both server and client so the seeded page equals the
 * refetch. `raw` is the response body (axios `response.data` on the client).
 */
export function unwrapPublicCollections(raw: any): PublicCollectionsResult {
  const collections = raw?.collections || raw?.data || [];
  const total = raw?.total ?? (Array.isArray(collections) ? collections.length : 0);
  const page = raw?.page ?? 1;
  const pageSize = raw?.pageSize ?? PUBLIC_PAGE_SIZE;
  return {
    collections: Array.isArray(collections) ? collections : [],
    total: typeof total === 'number' ? total : 0,
    page: typeof page === 'number' ? page : 1,
    pageSize: typeof pageSize === 'number' ? pageSize : PUBLIC_PAGE_SIZE,
  };
}

/** Unwrap a raw `/categories` response body into a category tree array. */
export function unwrapCategories(raw: any): CategoryNode[] {
  const data = raw?.data ?? raw ?? [];
  return Array.isArray(data) ? data : [];
}

/**
 * Fetch the public collections page server-side, unwrapped EXACTLY like the
 * client queryFn. Returns null on failure so the seed is skipped and the client
 * fetches it.
 */
export async function fetchPublicCollectionsServer(
  sortBy: SortOption,
  search: string,
  categoryId: string,
): Promise<PublicCollectionsResult | null> {
  try {
    const qs = new URLSearchParams(buildBrowseParams(sortBy, search, categoryId)).toString();
    const res = await fetch(`${API_BASE}/api/collections/browse?${qs}`, {
      cache: 'no-store',
    });
    if (!res.ok) return null;
    return unwrapPublicCollections(await res.json());
  } catch {
    return null;
  }
}

/**
 * Fetch the categories tree server-side, unwrapped identically to the client
 * `categoriesApi.findAll({ refresh: '1' })` query. Returns null on failure.
 */
export async function fetchCategoriesServer(): Promise<CategoryNode[] | null> {
  try {
    const res = await fetch(`${API_BASE}/api/categories?refresh=1`, {
      cache: 'no-store',
    });
    if (!res.ok) return null;
    return unwrapCategories(await res.json());
  } catch {
    return null;
  }
}

/**
 * The client-side public collections fetch used by the `useQuery` queryFn.
 * Calls the axios `/collections/browse` endpoint and unwraps identically to the
 * server seed.
 */
export async function fetchPublicCollectionsClient(
  sortBy: SortOption,
  search: string,
  categoryId: string,
): Promise<PublicCollectionsResult> {
  const response = await collectionsApi.browse(buildBrowseParams(sortBy, search, categoryId));
  return unwrapPublicCollections(response.data);
}

/** The client-side "my collections" fetch (authenticated, client-only). */
export async function fetchMyCollectionsClient(): Promise<Collection[]> {
  const response = await collectionsApi.getMyCollections();
  const data = response.data?.collections || response.data?.data || [];
  return Array.isArray(data) ? data : [];
}

/** The client-side categories tree fetch, unwrapped like the server seed. */
export async function fetchCategoriesClient(): Promise<CategoryNode[]> {
  const res = await categoriesApi.findAll({ refresh: '1' });
  return unwrapCategories(res.data);
}
