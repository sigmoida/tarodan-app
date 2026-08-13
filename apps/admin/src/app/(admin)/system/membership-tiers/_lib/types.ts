import { z } from "zod";
import { useTranslations } from "next-intl";

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
  canCreateCollections: boolean;
  canTrade: boolean;
  isAdFree: boolean;
  /** DEVRE DIŞI: öne çıkarmayı ücretli paketler devraldı; API artık dönmüyor. */
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
 * Sınırlar API ile BİREBİR: ad/açıklama uzunlukları (100/500), negatif olmayan
 * sayaçlar ve `maxTotalListings ∈ {-1} ∪ [1,∞)` kuralı UpdateMembershipTierDto
 * + admin-membership.service'ten gelir. Eskiden istemci hiçbirini bilmiyordu ve
 * kullanıcı ham 400 mesajlarıyla karşılaşıyordu. `isFree`, ücretsiz katmanın
 * fiyatının 0 OLMAK ZORUNDA / ücretlinin 0'dan BÜYÜK olma kuralını ayırır.
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
    sortOrder: int(v.sortOrder),
    canCreateCollections: v.canCreateCollections,
    canTrade: v.canTrade,
    isAdFree: v.isAdFree,
    isActive: v.isActive,
  };
}
