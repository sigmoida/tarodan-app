import type { Metadata } from 'next';
import { HydrationBoundary, dehydrate } from '@tanstack/react-query';
import { getServerQueryClient } from '@/lib/query/server';
import { queryKeys } from '@/lib/query/keys';
import { hasRealDiscount } from '@/lib/productPrice';
import { unwrapList } from '@/lib/unwrapList';
import HomeClient from './_home/_components/HomeClient';

const API_BASE =
	process.env.API_INTERNAL_URL ||
	process.env.NEXT_PUBLIC_API_URL ||
	'http://localhost:3001';

const TITLE = 'Tarodan - Diecast Model Araba Pazarı';
const DESCRIPTION =
	'Diecast model araba koleksiyoncuları için güvenli alış, satış ve takas platformu. Öne çıkan ürünler, indirimler, takas vitrini ve popüler ilanları keşfedin.';

export const metadata: Metadata = {
	title: TITLE,
	description: DESCRIPTION,
	alternates: { canonical: '/' },
	openGraph: {
		title: TITLE,
		description: DESCRIPTION,
		type: 'website',
		url: '/',
	},
	twitter: {
		card: 'summary_large_image',
		title: TITLE,
		description: DESCRIPTION,
	},
};

/**
 * Server fetch for `/products` (public, no auth). Mirrors the client
 * `listingsApi.getAll` unwrap: raw is either an array or `{ data | products }`.
 * The client axios instance uses a relative `/api` baseURL that doesn't resolve
 * on the server, so we hit the absolute API URL directly. `no-store` matches the
 * client's `Cache-Control: no-cache`. Throws on non-OK so the caller skips
 * seeding that key and lets the client fetch it.
 */
async function fetchProducts(
	params: Record<string, string | number | boolean>,
): Promise<unknown[]> {
	const qs = new URLSearchParams(
		Object.entries(params).map(([k, v]) => [k, String(v)]),
	).toString();
	const res = await fetch(`${API_BASE}/api/products?${qs}`, {
		cache: 'no-store',
	});
	if (!res.ok) throw new Error(`products ${res.status}`);
	return unwrapList(await res.json());
}

/** Discounted rail: same real-discount filter the client applies. */
async function fetchDiscountedProducts(): Promise<unknown[]> {
	const products = await fetchProducts({
		limit: 24,
		page: 1,
		discountOnly: true,
		status: 'active',
	});
	return products.filter((p) => hasRealDiscount(p as any));
}

async function fetchManufacturers(): Promise<unknown[]> {
	const res = await fetch(`${API_BASE}/api/manufacturers`, {
		cache: 'no-store',
	});
	if (!res.ok) throw new Error(`manufacturers ${res.status}`);
	return unwrapList(await res.json());
}

async function fetchTopCollections(): Promise<unknown[]> {
	const res = await fetch(`${API_BASE}/api/users/top-collections?limit=20`, {
		cache: 'no-store',
	});
	if (!res.ok) throw new Error(`top-collections ${res.status}`);
	return unwrapList(await res.json());
}

/** featured-collector / featured-business: mirror the client's `data ?? null`. */
async function fetchNullable(path: string): Promise<unknown> {
	const res = await fetch(`${API_BASE}${path}`, { cache: 'no-store' });
	if (!res.ok) throw new Error(`${path} ${res.status}`);
	const raw = await res.json();
	return raw ?? null;
}

export default async function HomePage() {
	const queryClient = getServerQueryClient();

	// Prefetch the FINITE home sections server-side and seed the query cache with
	// the SAME keys the client `useQuery`s use, so the content ships in the first
	// HTML and hydrates without a refetch flash. Each fetch is independent; if one
	// throws/non-OKs we simply don't seed that key and the client fetches it.
	// NOTE: the infinite `bestSellers` (queryKeys.home.popular) is intentionally
	// NOT prefetched — infinite-query hydration is out of scope; it stays
	// client-fetched.
	const [
		featured,
		trade,
		discounted,
		manufacturers,
		featuredCollector,
		featuredBusiness,
		topCollections,
	] = await Promise.allSettled([
		fetchProducts({ limit: 20, page: 1, boostedOnly: true, status: 'active' }),
		fetchProducts({ limit: 24, page: 1, tradeOnly: true, status: 'active' }),
		fetchDiscountedProducts(),
		fetchManufacturers(),
		fetchNullable('/api/users/featured-collector'),
		fetchNullable('/api/users/featured-business'),
		fetchTopCollections(),
	]);

	if (featured.status === 'fulfilled')
		queryClient.setQueryData(queryKeys.home.featured(), featured.value);
	if (trade.status === 'fulfilled')
		queryClient.setQueryData(queryKeys.home.trade(), trade.value);
	if (discounted.status === 'fulfilled')
		queryClient.setQueryData(queryKeys.home.discounted(), discounted.value);
	if (manufacturers.status === 'fulfilled')
		queryClient.setQueryData(
			queryKeys.home.manufacturers(),
			manufacturers.value,
		);
	if (featuredCollector.status === 'fulfilled')
		queryClient.setQueryData(
			queryKeys.home.featuredCollector(),
			featuredCollector.value,
		);
	if (featuredBusiness.status === 'fulfilled')
		queryClient.setQueryData(
			queryKeys.home.featuredBusiness(),
			featuredBusiness.value,
		);
	if (topCollections.status === 'fulfilled')
		queryClient.setQueryData(
			queryKeys.home.topCollections(20),
			topCollections.value,
		);

	return (
		<HydrationBoundary state={dehydrate(queryClient)}>
			<HomeClient />
		</HydrationBoundary>
	);
}
