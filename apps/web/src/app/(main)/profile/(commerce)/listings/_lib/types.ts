/** @format */

export interface Listing {
	id: string;
	title: string;
	price: number;
	originalPrice?: number | null;
	salePrice?: number | null;
	isOnSale?: boolean;
	discountPercent?: number | null;
	status: string;
	isBoosted?: boolean;
	boostedUntil?: string | null;
	images?: Array<{ url: string } | string>;
	createdAt: string;
	viewCount?: number;
	soldAt?: string;
	soldPrice?: number;
	buyer?: { id: string; displayName: string };
	orderId?: string;
	rating?: { average: number | null; count: number };
	category?: { id: string; name: string; slug: string };
}

/** Estimated seller net — single source in the shared commission-preview hook. */
export type { EstimatedNet } from '@/hooks/useCommissionPreviews';

const PLACEHOLDER = 'https://placehold.co/200x200/f3f4f6/9ca3af?text=Ürün';

export const getListingImage = (listing: Listing): string => {
	const first = listing.images?.[0];
	if (!first) return PLACEHOLDER;
	return typeof first === 'string'
		? first
		: ((first as any).cardUrl ??
				(first as any).detailUrl ??
				(first as any).url ??
				PLACEHOLDER);
};

// Money formatting lives in one place — re-exported for local `formatTL` imports.
export { formatPrice as formatTL } from '@/lib/format';
