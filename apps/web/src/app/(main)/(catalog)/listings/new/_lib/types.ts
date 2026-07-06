/** @format */

export interface Category {
	id: string;
	name: string;
	slug: string;
	children?: Category[];
}

export interface Brand {
	id: string;
	name: string;
	slug: string;
}

export interface CarModel {
	id: string;
	name: string;
	slug: string;
	brand: { slug: string };
}

export interface ListingLimits {
	currentCount: number;
	maxListings: number;
	canCreateListing: boolean;
	isPremium: boolean;
	membershipTier: string;
	remainingListings: number;
}
