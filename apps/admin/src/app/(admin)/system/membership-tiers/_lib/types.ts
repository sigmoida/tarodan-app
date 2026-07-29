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
  featuredListingSlots: number;
  commissionDiscount: number;
  isActive: boolean;
  sortOrder: number;
  userCount: number;
}

/** Yearly price = monthly × 12 × (1 − discount%). */
export const computedYearly = (monthly: number, discountPct: number) =>
  Math.round(monthly * 12 * (1 - discountPct / 100) * 100) / 100;

/** Form schema — validation-only; numbers are shaped in the mutationFn. */
export const tierSchema = (t: T) =>
  z.object({
    name: z.string().min(1, t("admin.tiers.validation.nameRequired")),
    description: z.string().optional().default(""),
    monthlyPrice: z.string().optional().default("0"),
    maxFreeListings: z.string().optional().default("0"),
    maxTotalListings: z.string().optional().default("0"),
    maxImagesPerListing: z.string().optional().default("0"),
    sortOrder: z.string().optional().default("0"),
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
