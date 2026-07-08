/** @format */

export type Period = 'monthly' | 'yearly';

export type TierId = 'free' | 'basic' | 'premium' | 'business';

/** Per-tier active-listing caps (from DB MembershipTier). */
export interface ListingLimits {
	free_listing_limit?: number;
	basic_listing_limit?: number;
	premium_listing_limit?: number;
	business_listing_limit?: number;
}

/** Per-tier prices + derived yearly discount (single source: DB MembershipTier). */
export interface TierPrices {
	basic_monthly_price?: number;
	basic_yearly_price?: number;
	premium_monthly_price?: number;
	premium_yearly_price?: number;
	business_monthly_price?: number;
	business_yearly_price?: number;
	yearly_discount_percentage?: number;
}

/** Normalized tier data the server hands the client (prices + limits together). */
export interface TierData {
	prices: TierPrices;
	limits: ListingLimits;
}

/** The current user's membership (from `/membership/me`). */
export interface MembershipDetails {
	currentPeriodStart?: string;
	currentPeriodEnd?: string;
	tier?: string;
	status?: string;
	cancelledAt?: string;
	pendingPayment?: boolean;
	pendingTierName?: string;
	pendingTierType?: string;
	scheduledTierType?: string;
	scheduledBillingPeriod?: string;
	autoRenew?: boolean;
}

export interface TierFeature {
	text: string;
	included: boolean;
}

/** One display plan card. */
export interface Tier {
	id: TierId;
	name: string;
	/** Base monthly price (0 for free). */
	price: number;
	description: string;
	features: TierFeature[];
	popular: boolean;
}
