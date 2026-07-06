/** @format */

'use client';

import { useQuery } from '@tanstack/react-query';
import { api, listingsApi, brandsApi } from '@/lib/api';
import type { Category, Brand, CarModel, ListingLimits } from '../_lib/types';

// ---- Categories ----

function flatten(cats: Category[]): Category[] {
	const out: Category[] = [];
	for (const c of cats) {
		out.push(c);
		if (c.children?.length) out.push(...flatten(c.children));
	}
	return out;
}

const EXCLUDED_BRAND_SLUGS = new Set([
	'hot-wheels',
	'hot-wheels-premium',
	'hot-wheels-rlc',
	'matchbox',
	'tomica',
	'tomica-limited-vintage',
	'majorette',
	'm2-machines',
	'greenlight',
	'johnny-lightning',
]);
const EXCLUDED_SCALE_SLUGS = new Set([
	'scale-118',
	'scale-124',
	'scale-143',
	'scale-164',
]);

/** Flat, de-duplicated category list (brand/scale categories dropped — they have
 *  their own fields). Replaces `fetchCategories` + the inline flatten/filter. */
export function useCategories(enabled: boolean) {
	const query = useQuery({
		queryKey: ['new-listing-categories'],
		queryFn: async (): Promise<Category[]> => {
			const res = await api.get('/categories');
			return res.data.data || res.data || [];
		},
		enabled,
		staleTime: 5 * 60 * 1000,
	});
	const flatCategories = flatten(query.data ?? []).filter((c) => {
		const slug = c.slug.toLowerCase();
		return !EXCLUDED_BRAND_SLUGS.has(slug) && !EXCLUDED_SCALE_SLUGS.has(slug);
	});
	return { flatCategories };
}

// ---- Filters (scales / materials / brands / manufacturers) ----

interface Ref {
	id: string;
	name: string;
	slug: string;
}

/** Scale / material / brand / manufacturer option lists, with a brands fallback
 *  to `brandsApi.findAll()`. Replaces the `fetchFilters` effect. */
export function useListingFilters() {
	const query = useQuery({
		queryKey: ['new-listing-filters'],
		queryFn: async () => {
			let scales: string[] = [];
			let materials: Array<{ slug: string; label: string }> = [];
			let brands: Brand[] = [];
			let manufacturers: Ref[] = [];
			try {
				const res = await listingsApi.getFilters();
				const d = res.data as {
					scales?: string[];
					materials?: Array<{ slug: string; label: string }>;
					brands?: Ref[];
					manufacturers?: Ref[];
				};
				scales = d.scales ?? [];
				materials = d.materials ?? [];
				brands = d.brands ?? [];
				manufacturers = d.manufacturers ?? [];
			} catch {
				// fall through to the brands fallback below
			}
			if (!brands.length) {
				const raw = (await brandsApi.findAll()).data;
				brands = (Array.isArray(raw) ? raw : (raw as any)?.data || []) as Brand[];
			}
			return { scales, materials, brands, manufacturers };
		},
		staleTime: 5 * 60 * 1000,
	});
	return {
		scales: query.data?.scales ?? [],
		materials: query.data?.materials ?? [],
		brands: query.data?.brands ?? [],
		manufacturers: query.data?.manufacturers ?? [],
		isLoading: query.isLoading,
	};
}

// ---- Car models for the selected brand ----

export function useCarModels(brandSlug: string | undefined) {
	const query = useQuery({
		queryKey: ['new-listing-car-models', brandSlug],
		queryFn: async (): Promise<CarModel[]> => {
			const res = await api.get(`/car-models?brand=${brandSlug}`);
			return Array.isArray(res.data) ? res.data : res.data?.data || [];
		},
		enabled: !!brandSlug,
		staleTime: 5 * 60 * 1000,
	});
	return { models: query.data ?? [], isLoading: !!brandSlug && query.isLoading };
}

// ---- Listing limits (stats) ----

/** The seller's listing-quota stats. Refetches on window focus/mount, which
 *  replaces the old visibility/focus/pathname effects. On error it resolves to a
 *  permissive fallback (never blocks; the server re-validates on POST). */
export function useListingLimits(enabled: boolean, membershipTier: string) {
	const query = useQuery({
		queryKey: ['new-listing-limits'],
		queryFn: async (): Promise<ListingLimits> => {
			try {
				const res = await api.get('/products/my/stats', {
					params: { _t: Date.now() },
				});
				const stats = res.data;
				const tierType = stats.limits?.tierType || 'free';
				return {
					currentCount: stats.summary?.used ?? 0,
					maxListings: stats.summary?.max ?? -1,
					canCreateListing: stats.summary?.canCreate ?? true,
					isPremium: tierType === 'premium' || tierType === 'business',
					membershipTier: stats.limits?.tierName || 'Free',
					remainingListings: stats.summary?.remaining ?? -1,
				};
			} catch {
				return {
					currentCount: 0,
					maxListings: -1,
					canCreateListing: true,
					isPremium: membershipTier === 'premium' || membershipTier === 'business',
					membershipTier,
					remainingListings: -1,
				};
			}
		},
		enabled,
		staleTime: 0,
		refetchOnWindowFocus: true,
	});
	return {
		listingLimits: query.data ?? null,
		limitsLoading: query.isLoading && enabled,
		refetchLimits: query.refetch,
	};
}

// ---- Commission preview ----

export function useCommissionPreview(price: string | number, categoryId: string) {
	const amount = Number(price);
	const enabled = !!price && !Number.isNaN(amount) && amount > 0;
	const query = useQuery({
		queryKey: ['new-listing-commission', String(price), categoryId],
		queryFn: async () => {
			const res = await api.get('/orders/commission-preview', {
				params: { amount: price, categoryId: categoryId || undefined },
			});
			return {
				sellerFeeAmount: Number(res.data?.sellerFeeAmount ?? 0),
				sellerNetAmount: Number(res.data?.sellerNetAmount ?? 0),
			};
		},
		enabled,
		staleTime: 30 * 1000,
	});
	return {
		commissionPreview: enabled ? (query.data ?? null) : null,
		commissionPreviewLoading: enabled && query.isLoading,
	};
}

// ---- Manufacturer-scoped attribute groups ----

export interface AttributeGroup {
	slug: string;
	name: string;
	manufacturerSlug: string | null;
	isRequired: boolean;
	attributes: Array<{ slug: string; label: string; color?: string | null }>;
}

export function useManufacturerAttributes(manufacturerSlug: string | undefined) {
	const query = useQuery({
		queryKey: ['new-listing-mfr-attrs', manufacturerSlug],
		queryFn: async (): Promise<AttributeGroup[]> => {
			const res = await listingsApi.getAttributeGroups({
				manufacturer: manufacturerSlug!,
			});
			const groups = (res.data as AttributeGroup[]) ?? [];
			// Only manufacturer-specific groups; global ones (scale/material) have
			// their own dedicated fields already.
			return groups.filter((g) => g.manufacturerSlug === manufacturerSlug);
		},
		enabled: !!manufacturerSlug,
		staleTime: 5 * 60 * 1000,
	});
	return { manufacturerAttrGroups: manufacturerSlug ? query.data ?? [] : [] };
}
