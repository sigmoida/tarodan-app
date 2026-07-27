/** @format */

export const TIER_NAMES: Record<string, string> = {
  basic: "Temel Üyelik",
  premium: "Premium Üyelik",
  business: "İş Üyeliği",
};

// Plan features are derived from the tier DTO via the shared buildTierFeatures
// (membership/_lib/tiers) so the checkout never drifts from the membership page.

export const PAID_TIERS = ["basic", "premium", "business"] as const;

export interface TierInfo {
  name: string;
  price: number;
  basePrice: number;
  features: string[];
}
