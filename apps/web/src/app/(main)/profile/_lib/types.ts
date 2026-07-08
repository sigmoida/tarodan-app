/** @format */

export interface MembershipTier {
	type: string;
	name: string;
	maxFreeListings: number;
	maxTotalListings: number;
	maxImagesPerListing: number;
	canTrade: boolean;
	canCreateCollections: boolean;
	featuredListingSlots: number;
	commissionDiscount: number;
	isAdFree: boolean;
}

export interface ProfileStats {
	productsCount: number;
	ordersCount: number;
	tradesCount: number;
	collectionsCount: number;
	rating: number;
	reviewsCount: number;
	followersCount?: number;
}

export interface UserProfile {
	id: string;
	email: string;
	displayName: string;
	phone?: string;
	avatarUrl?: string;
	bio?: string;
	isSeller: boolean;
	isVerified: boolean;
	createdAt: string;
	addresses?: any[];
	stats?: ProfileStats;
	membership?: {
		tier: MembershipTier;
		status: string;
		expiresAt: string | null;
	};
	membershipTier?: string;
	// Premium trust score (optional, surfaced in the hero)
	isPremium?: boolean;
	trustScore?: number;
	trustLevel?: string;
}

export interface PendingCounts {
	offers: number;
	trades: number;
}
