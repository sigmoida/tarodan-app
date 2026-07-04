import type { Metadata } from 'next';
import { HydrationBoundary, dehydrate } from '@tanstack/react-query';
import { getServerQueryClient } from '@/lib/query/server';
import { queryKeys } from '@/lib/query/keys';
import {
  PAGE_LIMIT,
  parseListingsFilters,
  getListingsPage,
  buildListApiParams,
} from './_lib/params';
import ListingsClient from './ListingsClient';

const API_BASE =
  process.env.API_INTERNAL_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  'http://localhost:3001';

const TITLE = 'Ürünler | Tarodan';
const DESCRIPTION =
  'Diecast model araba, koleksiyon ve model araç ilanlarını keşfedin. Markaya, ölçeğe, fiyata ve duruma göre filtreleyin; takas ve indirimli ürünleri bulun.';

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: '/listings' },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    type: 'website',
    url: '/listings',
  },
  twitter: {
    card: 'summary_large_image',
    title: TITLE,
    description: DESCRIPTION,
  },
};

type Props = {
  searchParams: Record<string, string | string[] | undefined>;
};

/**
 * Rebuild a URLSearchParams from Next's plain searchParams object so the exact
 * same shared parsers (parseListingsFilters / getListingsPage) run on the
 * server and the client. `.get()` returns the first value, matching
 * `useSearchParams().get()` on the client.
 */
function toSearchParams(
  searchParams: Record<string, string | string[] | undefined>,
): URLSearchParams {
  const sp = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    if (Array.isArray(value)) {
      for (const v of value) sp.append(key, v);
    } else if (value !== undefined) {
      sp.set(key, value);
    }
  }
  return sp;
}

interface CategoryLite {
  id: string;
  name: string;
  slug: string;
}

/**
 * Resolve a category slug → {id,name,slug} server-side (public, no auth).
 * Mirrors the client `categoriesApi.findBySlug` (axios returns the body
 * directly). Returns null on any failure so seeding is simply skipped.
 */
async function fetchCategoryBySlug(slug: string): Promise<CategoryLite | null> {
  try {
    const res = await fetch(
      `${API_BASE}/api/categories/slug/${encodeURIComponent(slug)}`,
      { cache: 'no-store' },
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
async function fetchListingsPage(
  params: Record<string, string | number | boolean>,
  page: number,
): Promise<{ listings: unknown[]; meta: unknown } | null> {
  try {
    const qs = new URLSearchParams(
      Object.entries(params).map(([k, v]) => [k, String(v)]),
    ).toString();
    const res = await fetch(`${API_BASE}/api/products?${qs}`, {
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const raw = await res.json();
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
  } catch {
    return null;
  }
}

export default async function ListingsPage({ searchParams }: Props) {
  const sp = toSearchParams(searchParams);
  const filters = parseListingsFilters(sp);
  const page = getListingsPage(sp);

  const queryClient = getServerQueryClient();

  // Resolve the category the same way the client does: an explicit `categoryId`
  // wins; otherwise a category *slug* is resolved to its id. When resolving from
  // a slug we ALSO seed `['categoryBySlug', slug]` so the client reads its `.id`
  // synchronously on first render — that keeps resolvedCategoryId (and thus the
  // listings key) identical to the server seed, so there's no refetch flash.
  const urlCategoryId = sp.get('categoryId') || '';
  const categorySlug = filters.category;
  let resolvedCategoryId: string | undefined = urlCategoryId || undefined;

  if (categorySlug && !urlCategoryId) {
    const category = await fetchCategoryBySlug(categorySlug);
    if (category) {
      queryClient.setQueryData(
        queryKeys.category.bySlug(categorySlug),
        category,
      );
      resolvedCategoryId = category.id;
    }
  }

  // Seed the first listings page with the SAME key the client's useQuery uses.
  const apiParams = buildListApiParams(
    filters,
    resolvedCategoryId,
    page,
    PAGE_LIMIT,
  );
  const listingsData = await fetchListingsPage(apiParams, page);
  if (listingsData) {
    queryClient.setQueryData(
      queryKeys.listings.list(filters, resolvedCategoryId, page),
      listingsData,
    );
  }

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <ListingsClient />
    </HydrationBoundary>
  );
}
