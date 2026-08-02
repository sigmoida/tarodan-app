/** @format */

import type { MembershipTier } from "./types";

/**
 * The single source of truth for membership-tier fallbacks. The API's
 * `membership.tier` is preferred everywhere; this table only fills in display
 * values when the API doesn't return a tier (e.g. the initial authStore-derived
 * render). Previously this object was duplicated three times across the profile
 * page with diverging values — keep it here only.
 */
export const TIER_DEFAULTS: Record<string, MembershipTier> = {
  free: {
    type: "free",
    name: "Ücretsiz",
    maxFreeListings: 5,
    maxTotalListings: 10,
    maxImagesPerListing: 3,
    canTrade: false,
    canCreateCollections: false,
    featuredListingSlots: 0,
    isAdFree: false,
  },
  basic: {
    type: "basic",
    name: "Temel",
    maxFreeListings: 15,
    maxTotalListings: 50,
    maxImagesPerListing: 6,
    canTrade: true,
    canCreateCollections: true,
    featuredListingSlots: 2,
    isAdFree: false,
  },
  premium: {
    type: "premium",
    name: "Premium",
    maxFreeListings: 50,
    maxTotalListings: 200,
    maxImagesPerListing: 10,
    canTrade: true,
    canCreateCollections: true,
    featuredListingSlots: 10,
    isAdFree: true,
  },
  business: {
    type: "business",
    name: "İş",
    maxFreeListings: 200,
    maxTotalListings: 1000,
    maxImagesPerListing: 15,
    canTrade: true,
    canCreateCollections: true,
    featuredListingSlots: 50,
    isAdFree: true,
  },
};

export function getTierDefault(type?: string): MembershipTier {
  return TIER_DEFAULTS[type || "free"] || TIER_DEFAULTS.free;
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
