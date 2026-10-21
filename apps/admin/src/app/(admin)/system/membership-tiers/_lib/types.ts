import { z } from "zod";
import { useTranslations } from "next-intl";
import { SAVED_SEARCH_TIER_LIMIT_MAX } from "@tarodan/types";

type T = ReturnType<typeof useTranslations<never>>;

export interface MembershipTier {
  id: string;
  type: string;
  name: string;
  description?: string;
  monthlyPrice: number;
  yearlyPrice: number;
  maxFreeListings: number;
  maxTotalListings: number;
  maxImagesPerListing: number;
  /** Saved-search cap for the tier; 0 = saving searches is off. */
  maxSavedSearches: number;
  canCreateCollections: boolean;
  canTrade: boolean;
  isAdFree: boolean;
  /** Deprecated: paid boost packages replaced featured slots; the API no longer returns it. */
  featuredListingSlots?: number;
  isActive: boolean;
  sortOrder: number;
  userCount: number;
}

/** Yearly price = monthly × 12 × (1 − discount%). */
export const computedYearly = (monthly: number, discountPct: number) =>
  Math.round(monthly * 12 * (1 - discountPct / 100) * 100) / 100;

/** Numeric string field with a predicate — inputs are native `type="number"`. */
const numField = (check: (n: number) => boolean, message: string) =>
  z
    .string()
    .optional()
    .default("0")
    .refine((v) => {
      const n = Number(v);
      return v.trim() !== "" && !Number.isNaN(n) && check(n);
    }, message);

/**
 * Form schema — validation-only; numbers are shaped in the mutationFn.
 *
 * The bounds mirror UpdateMembershipTierDto and the tier update service: the
 * name/description lengths (100/500), non-negative counters, the
 * `maxTotalListings ∈ {-1} ∪ [1,∞)` rule and `maxSavedSearches` in
 * 0..SAVED_SEARCH_TIER_LIMIT_MAX, so the admin sees a field error instead of a
 * raw 400. Not yet mirrored: the API's `maxImagesPerListing` 1..MAX_PRODUCT_IMAGES
 * and `sortOrder` <= 10000 caps (the image cap is API-only today). `isFree`
 * selects the rule that the free tier's price must be 0 and a paid tier's must
 * be greater than 0.
 */
export const tierSchema = (t: T, isFree = false) =>
  z.object({
    name: z
      .string()
      .min(1, t("admin.tiers.validation.nameRequired"))
      .max(100, t("admin.tiers.validation.nameMax")),
    description: z
      .string()
      .optional()
      .default("")
      .refine(
        (v) => v.length <= 500,
        t("admin.tiers.validation.descriptionMax"),
      ),
    monthlyPrice: numField(
      (n) => (isFree ? n === 0 : n > 0),
      isFree
        ? t("admin.tiers.validation.freePriceZero")
        : t("admin.tiers.validation.paidPricePositive"),
    ),
    maxFreeListings: numField(
      (n) => Number.isInteger(n) && n >= 0,
      t("admin.tiers.validation.nonNegativeInt"),
    ),
    maxTotalListings: numField(
      (n) => Number.isInteger(n) && (n === -1 || n >= 1),
      t("admin.tiers.validation.totalListingsRange"),
    ),
    maxImagesPerListing: numField(
      (n) => Number.isInteger(n) && n >= 0,
      t("admin.tiers.validation.nonNegativeInt"),
    ),
    maxSavedSearches: numField(
      (n) => Number.isInteger(n) && n >= 0 && n <= SAVED_SEARCH_TIER_LIMIT_MAX,
      t("admin.tiers.validation.savedSearchLimitRange", {
        max: SAVED_SEARCH_TIER_LIMIT_MAX,
      }),
    ),
    sortOrder: numField(
      (n) => Number.isInteger(n) && n >= 0,
      t("admin.tiers.validation.nonNegativeInt"),
    ),
    canCreateCollections: z.boolean().default(false),
    canTrade: z.boolean().default(false),
    isAdFree: z.boolean().default(false),
    isActive: z.boolean().default(true),
  });

export type TierFormValues = z.infer<ReturnType<typeof tierSchema>>;

export function tierToForm(t: MembershipTier): TierFormValues {
  return {
    name: t.name,
    description: t.description ?? "",
    monthlyPrice: String(t.monthlyPrice ?? 0),
    maxFreeListings: String(t.maxFreeListings ?? 0),
    maxTotalListings: String(t.maxTotalListings ?? 0),
    maxImagesPerListing: String(t.maxImagesPerListing ?? 0),
    maxSavedSearches: String(t.maxSavedSearches ?? 0),
    sortOrder: String(t.sortOrder ?? 0),
    canCreateCollections: t.canCreateCollections,
    canTrade: t.canTrade,
    isAdFree: t.isAdFree,
    isActive: t.isActive,
  };
}

const int = (s: string) => parseInt(s, 10) || 0;
const flt = (s: string) => parseFloat(s) || 0;

/** Shape form values into the updateMembershipTier payload (yearlyPrice injected by caller). */
export function tierFormToPayload(v: TierFormValues, yearlyPrice: number) {
  return {
    name: v.name.trim(),
    description: v.description,
    monthlyPrice: flt(v.monthlyPrice),
    yearlyPrice,
    maxFreeListings: int(v.maxFreeListings),
    maxTotalListings: int(v.maxTotalListings),
    maxImagesPerListing: int(v.maxImagesPerListing),
    maxSavedSearches: int(v.maxSavedSearches),
    sortOrder: int(v.sortOrder),
    canCreateCollections: v.canCreateCollections,
    canTrade: v.canTrade,
    isAdFree: v.isAdFree,
    isActive: v.isActive,
  };
}
