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

/**
 * A listing that is due a one-time boost offer: the seller's live listing,
 * created after `boost_offer_since` and in the last `BOOST_OFFER_WINDOW_DAYS`
 * days, never boosted, not dismissed, with a package for its price.
 */
export interface BoostOffer {
  productId: string;
  title: string;
  /** Public URL of the first image (card size), or null. */
  image: string | null;
  price: number;
  createdAt: string;
}

/** `GET /products/boost/offers`: newest first, at most `BOOST_OFFER_MAX`. */
export interface BoostOffersResponse {
  /** `isBoostEnabled`; when false, `offers` is empty. */
  enabled: boolean;
  offers: BoostOffer[];
}

/**
 * `POST /products/boost/offers/dismiss` body (204): the offers the dialog
 * showed. Only the caller's own listings are recorded; once dismissed, a
 * listing is never offered again, on any device.
 */
export interface DismissBoostOffersRequest {
  /** 1 to `BOOST_OFFER_MAX` listing ids. */
  productIds: string[];
}

/** The two sections of "My boosts" (`GET /products/boost/my?state=`). */
export const MY_BOOST_STATES = ["current", "history"] as const;
export type MyBoostState = (typeof MY_BOOST_STATES)[number];

/**
 * The boost statuses each section shows. `pending` and `failed` (abandoned
 * checkouts) are never shown.
 */
export const MY_BOOST_STATE_STATUSES: Record<
  MyBoostState,
  readonly BoostStatus[]
> = {
  current: ["active", "paused"],
  history: ["expired", "cancelled"],
};

/** Default page size per section; `limit` goes up to `MY_BOOSTS_MAX_LIMIT`. */
export const MY_BOOSTS_DEFAULT_LIMIT: Record<MyBoostState, number> = {
  current: 100,
  history: 20,
};
export const MY_BOOSTS_MAX_LIMIT = 100;

/** A listing's counters: views, favourites and clicks. */
export interface BoostMetricCounts {
  views: number;
  likes: number;
  clicks: number;
}

/** One boost in "My boosts" (`GET /products/boost/my`). */
export interface MyBoostRow {
  id: string;
  productId: string;
  product: {
    id: string;
    title: string;
    /** The listing's status (`ProductStatus`). */
    status: string;
    /** Public URL of the first image (card size), or null. */
    image: string | null;
    /**
     * The listing's real promotion end (ISO), the last end of its stacked
     * boosts: what "remaining" shows. Null when it is not boosted now.
     */
    boostedUntil: string | null;
    /** The listing's home showcase end (ISO), or null. */
    homeShowcaseUntil: string | null;
  };
  /** `purchase` or a free `admin_grant` ("Tarodan hediyesi"). */
  source: BoostSource;
  packageName: string | null;
  /** The package placed the listing in the home showcase ("Vitrin"). */
  showcaseOnHome: boolean;
  durationDays: number;
  extendedDays: number;
  /** What was paid (TL, VAT included); 0 for a grant. */
  price: number;
  /** Refunded so far (TL); > 0 on a `cancelled` boost means "refunded". */
  refundedAmount: number;
  status: BoostStatus;
  /**
   * The reminder flag of this row (premium; no automatic charge). The
   * reminder is the listing's: it is on while any running or paused boost of
   * the listing has it, and the switch sets them all.
   */
  autoRenew: boolean;
  startsAt: string | null;
  /**
   * End of this boost's stretch (ISO). Stacked boosts lie end to end, so a
   * later boost's end includes the time of the boosts before it; the
   * listing's end is `product.boostedUntil`.
   */
  endsAt: string | null;
  /** When staff stopped it (revoke, or refund and stop), else null. */
  cancelledAt: string | null;
  /** The boost order (invoice link); null for a grant. */
  orderId: string | null;
  orderNumber: string | null;
  /**
   * `active` and its end not reached. A stacked boost counts as active
   * before its own stretch starts (its time is reserved behind the others).
   */
  isActive: boolean;
  /**
   * Until `endsAt` (ms), so for a stacked boost it includes the boosts before
   * it; show "remaining" from `product.boostedUntil`. For `paused`, the
   * boost's own paused remainder.
   */
  remainingMs: number;
  metrics: {
    /** The listing's counters when the boost started; null before. */
    before: BoostMetricCounts | null;
    current: BoostMetricCounts;
    gain: BoostMetricCounts | null;
    performanceScore: number | null;
  };
  createdAt: string;
  /**
   * The best performing boost on this page: at most one row, the first with
   * the highest score above zero.
   */
  isBest: boolean;
}

/** `GET /products/boost/my` response: `{ data, meta }` (common list envelope). */
export interface MyBoostsResponse {
  data: MyBoostRow[];
  meta: { total: number; page: number; limit: number; totalPages: number };
}

/**
 * `PATCH /products/:id/boost/reminder` body: the ending-soon reminder for the
 * listing's running and paused boosts. Turning it on needs premium (400
 * `server.product.boostReminderPremiumOnly`).
 */
export interface BoostReminderRequest {
  enabled: boolean;
}

/** `PATCH /products/:id/boost/reminder` response: false when nothing runs. */
export interface BoostReminderResponse {
  enabled: boolean;
}

/**
 * Whether the price the seller was shown (`InitiateBoostRequest.expectedPrice`)
 * is the price the server charges, compared in whole kuruş: 59.9, 59.90 and
 * 59.899999 are 59,90 TL, 59.89 is not. A value that is not a finite number
 * never matches, so a caller without a price fails closed. The one comparison
 * rule of the boost purchase: the API refuses a mismatch with 409
 * `server.product.boostPriceChanged` before it writes anything.
 */
export function boostPriceMatches(expected: number, actual: number): boolean {
  return (
    Number.isFinite(expected) &&
    Number.isFinite(actual) &&
    Math.round(expected * 100) === Math.round(actual * 100)
  );
}

/**
 * `POST /products/:id/boost/initiate` body. Both consents must be `true`
 * (anything else: 400 `server.product.boostConsentRequired`, nothing is
 * written); they are recorded with the boost order. `expectedPrice` must be
 * what the server charges now (`boostPriceMatches`), else 409
 * `server.product.boostPriceChanged` and nothing is written.
 */
export interface InitiateBoostRequest {
  packageId: string;
  durationDays: number;
  /**
   * The price the pre-information showed for this package and duration (TL,
   * VAT included): `price` of the chosen `BoostDurationOption`. A JSON number
   * with at most two decimals (text is a 400).
   */
  expectedPrice: number;
  /** Default `paytr`. */
  provider?: "paytr";
  /** The ending-soon reminder; kept only for premium members. */
  autoRenew?: boolean;
  /** The pre-contract information form and distance service contract (`platform_service_sales`). */
  preInformationAccepted: true;
  /** The statement that the service starts at once and the withdrawal right does not apply (`withdrawal_waiver`). */
  withdrawalWaiverAccepted: true;
}

/** `POST /products/:id/boost/initiate` response: card entry goes through `/payments/direct-form`. */
export interface InitiateBoostResponse {
  boostId: string;
  productId: string;
  durationDays: number;
  price: number;
  paymentId: string;
  provider: string;
  expiresIn: number;
  /** Dev and test only (`PAYMENT_BYPASS`). */
  useBypass: boolean;
}

/**
 * The boost behind a boost payment: `boost` of `GET /payments/:id/status`,
 * `/status-guest` and `GET /payments/:id` (with `isBoostOrder: true`).
 */
export interface BoostPaymentSummary {
  /** `ProductBoost.id`. */
  id: string;
  /** The boosted listing. */
  productId: string;
  productTitle: string;
  /** When the boost ends (ISO); null until the paid payment activates it. */
  endsAt: string | null;
}
