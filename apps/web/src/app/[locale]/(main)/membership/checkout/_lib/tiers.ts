/** @format */
import type { Translate } from "@/types/i18n";

export const TIER_NAMES = (t: Translate): Record<string, string> => ({
  basic: t("page.checkout.tiers.temelUyelik"),
  premium: t("page.checkout.tiers.premiumUyelik"),
  business: t("page.checkout.tiers.isUyeligi"),
});

// Plan features are derived from the tier DTO via the shared buildTierFeatures
// (membership/_lib/tiers) so the checkout never drifts from the membership page.

export const PAID_TIERS = ["basic", "premium", "business"] as const;

export interface TierInfo {
  name: string;
  price: number;
  basePrice: number;
  features: string[];
}
