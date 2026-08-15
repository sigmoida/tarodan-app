/** @format */

import type { MembershipTier } from "./types";
import type { Translate } from "@/types/i18n";

/**
 * The single source of truth for membership-tier fallbacks. The API's
 * `membership.tier` is preferred everywhere; this table only fills in display
 * values when the API doesn't return a tier (e.g. the initial authStore-derived
 * render). Previously this object was duplicated three times across the profile
 * page with diverging values — keep it here only.
 */
export const TIER_DEFAULTS = (
  t: Translate,
): Record<string, MembershipTier> => ({
  free: {
    type: "free",
    name: t("page.profile.tiers.ucretsiz"),
    maxFreeListings: 5,
    maxTotalListings: 10,
    maxImagesPerListing: 3,
    canTrade: false,
    canCreateCollections: false,
  },
  basic: {
    type: "basic",
    name: t("page.profile.tiers.temel"),
    maxFreeListings: 15,
    maxTotalListings: 50,
    maxImagesPerListing: 6,
    canTrade: true,
    canCreateCollections: true,
  },
  premium: {
    type: "premium",
    name: t("page.profile.tiers.premium"),
    maxFreeListings: 50,
    maxTotalListings: 200,
    maxImagesPerListing: 10,
    canTrade: true,
    canCreateCollections: true,
  },
  business: {
    type: "business",
    name: t("page.profile.tiers.is"),
    maxFreeListings: 200,
    maxTotalListings: 1000,
    maxImagesPerListing: 15,
    canTrade: true,
    canCreateCollections: true,
  },
});

export function getTierDefault(t: Translate, type?: string): MembershipTier {
  return TIER_DEFAULTS(t)[type || "free"] || TIER_DEFAULTS(t).free;
}

/** Tailwind token classes per tier, used for accent chips/cards. */
export const TIER_COLORS: Record<
  string,
  { bg: string; text: string; border: string }
> = {
  free: { bg: "bg-surface-alt", text: "text-body", border: "border-border" },
  basic: {
    bg: "bg-primary-50",
    text: "text-primary-700",
    border: "border-primary-300",
  },
  premium: {
    bg: "bg-primary-50",
    text: "text-primary-700",
    border: "border-primary-300",
  },
  business: {
    bg: "bg-warning-50",
    text: "text-warning-700",
    border: "border-warning-300",
  },
};
