/**
 * Listing boost ("öne çıkarma"): the settings, rules and response shapes the
 * API, web, admin and mobile agree on. Boost purchase is web-only (tarodan-ops
 * ADR 0003, 0015); mobile vendors this file for the shapes it still reads.
 */

/** Platform setting that switches boost sales on and off. */
export const BOOST_ENABLED_SETTING = "boost_enabled";

/**
 * Whether boost sales are on. Unlike the standard on/off rule
 * (`isPlatformSettingOn`, where a missing value is off), a missing or empty
 * `boost_enabled` means **on**: boost shipped before the setting existed and
 * production never wrote the row. Only "false" (any case, trimmed) turns it
 * off. The API reads the setting through this rule; the admin toggle must use
 * it too, never `isPlatformSettingOn`, or it shows boost off while it is on.
 */
export function isBoostEnabled(value: string | null | undefined): boolean {
  return value?.trim().toLowerCase() !== "false";
}

/**
 * Platform setting: the ISO timestamp from which new listings get the
 * one-time boost offer. Empty or invalid means offers are off.
 */
export const BOOST_OFFER_SINCE_SETTING = "boost_offer_since";

/** Only listings created in the last this many days get an offer. */
export const BOOST_OFFER_WINDOW_DAYS = 30;

/** At most this many listings are offered in one dialog. */
export const BOOST_OFFER_MAX = 20;

/** The ending-soon reminder goes out this many hours before the end. */
export const BOOST_REMINDER_LEAD_HOURS = 24;

/**
 * The offer start read from `boost_offer_since`, or null when offers are off
 * (missing, empty or not a valid date).
 */
export function boostOfferSince(value: string | null | undefined): Date | null {
  const text = value?.trim();
  if (!text) return null;
  const at = new Date(text);
  return Number.isNaN(at.getTime()) ? null : at;
}

/** A free staff grant runs for this many days at least and at most. */
export const BOOST_GRANT_MIN_DAYS = 1;
export const BOOST_GRANT_MAX_DAYS = 90;

/**
 * Length of the reason staff give for a grant, a revoke or a refund and stop
 * (written on the boost and to the audit log).
 */
export const BOOST_ADMIN_REASON_MIN_LENGTH = 10;
export const BOOST_ADMIN_REASON_MAX_LENGTH = 500;

/** Where a boost came from (`ProductBoost.source`). */
export const BOOST_SOURCES = ["purchase", "admin_grant"] as const;
export type BoostSource = (typeof BOOST_SOURCES)[number];

/** `ProductBoost.status` values. */
export const BOOST_STATUSES = [
  "pending",
  "active",
  "paused",
  "expired",
  "cancelled",
  "failed",
] as const;
export type BoostStatus = (typeof BOOST_STATUSES)[number];

/** One duration of a package, priced for the listing's price band. */
export interface BoostDurationOption {
  durationDays: number;
  /** What the seller pays now (the campaign price while a campaign runs). */
  price: number;
  /** The tier's regular price. */
  listPrice: number;
  /** True while a campaign price below `listPrice` applies. */
  campaign: boolean;
  label: string;
}

export interface BoostPackage {
  id: string;
  name: string;
  slug: string;
  /** A "Vitrin" package also places the listing in the home showcase. */
  showcaseOnHome: boolean;
  options: BoostDurationOption[];
}

/** `GET /products/:id/boost/options` (the listing's owner only). */
export interface BoostOptionsResponse {
  /** `isBoostEnabled` of the platform setting. */
  enabled: boolean;
  /** The price the tiers are matched against (`boostTierBasePrice`). */
  productPrice: number;
  /** Packages with at least one tier for this price and this seller. */
  packages: BoostPackage[];
}

/** A listing that is due a one-time boost offer. */
export interface BoostOffer {
  productId: string;
  title: string;
  image: string | null;
  price: number;
  createdAt: string;
}

/** `GET /products/boost/offers`. */
export interface BoostOffersResponse {
  enabled: boolean;
  offers: BoostOffer[];
}
