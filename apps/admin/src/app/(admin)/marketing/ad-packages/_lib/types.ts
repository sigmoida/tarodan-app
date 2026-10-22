import { z } from "zod";
import type { useTranslations } from "next-intl";
import {
  amountField,
  amountInputValue,
  amountOrNull,
  amountOrZero,
} from "@/lib/schemas/amount";

type T = ReturnType<typeof useTranslations<never>>;

export interface AdPackageTier {
  id: string;
  durationDays: number;
  minAmount: number;
  maxAmount: number | null;
  price: number;
  campaignPrice: number | null;
  campaignStartsAt: string | null;
  campaignEndsAt: string | null;
  isActive: boolean;
}

export interface AdPackage {
  id: string;
  name: string;
  slug: string;
  showcaseOnHome: boolean;
  isActive: boolean;
  sortOrder: number;
  audienceMode:
    "everyone" | "membership_tiers" | "specific_users" | "tiers_or_users";
  targetTierTypes: MembershipTierType[];
  targetUsers: AudienceUser[];
  createdAt: string;
  tiers: AdPackageTier[];
}

export type MembershipTierType = "free" | "basic" | "premium" | "business";

export interface AudienceUser {
  id: string;
  adminCode: string;
  username: string;
  displayName: string;
  email: string;
}

/** Distinct durations present in a package's tiers, ascending. */
export function packageDurations(pkg: AdPackage): number[] {
  return Array.from(new Set(pkg.tiers.map((t) => t.durationDays))).sort(
    (a, b) => a - b,
  );
}

// ── Form schema (validation-only; strings→numbers/ISO shaped in toPayload) ──
// The TL fields are text read by the shared TL amount parser
// (`@/lib/schemas/amount`): "1.000" is refused, never 1 TL. 0 is a real value.
// A tier's price band is half-open (`@/lib/amount-band`): the form takes the
// exclusive upper bound as stored, as the commission form does.

const tierRowSchema = (t: T) =>
  z
    .object({
      durationDays: z
        .string()
        .min(1, t("admin.marketing.adPackages.validation.durationMin")),
      minAmount: amountField(t).default("0"),
      maxAmount: amountField(t).default(""),
      price: amountField(t, {
        required: t("admin.marketing.adPackages.validation.priceMin"),
      }),
      campaignPrice: amountField(t).default(""),
      campaignStartsAt: z.string().default(""),
      campaignEndsAt: z.string().default(""),
      isActive: z.boolean().default(true),
    })
    .superRefine((row, context) => {
      // The API refuses an empty band on any row (active or not). Refused
      // text has its own field error, and null skips the comparison; a blank
      // lower bound is sent as 0 (`packageFormToPayload`).
      const max = amountOrNull(row.maxAmount);
      const min = row.minAmount.trim() === "" ? 0 : amountOrNull(row.minAmount);
      if (max != null && min != null && max <= min) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["maxAmount"],
          message: t("admin.finance.commission.validation.strictRange"),
        });
      }
    });

export const packageSchema = (t: T) =>
  z
    .object({
      name: z
        .string()
        .min(1, t("admin.marketing.adPackages.validation.nameRequired")),
      slug: z
        .string()
        .min(1, t("admin.marketing.adPackages.validation.slugRequired")),
      showcaseOnHome: z.boolean().default(false),
      isActive: z.boolean().default(true),
      sortOrder: z.string().default("0"),
      audienceMode: z
        .enum([
          "everyone",
          "membership_tiers",
          "specific_users",
          "tiers_or_users",
        ])
        .default("everyone"),
      targetTierTypes: z
        .array(z.enum(["free", "basic", "premium", "business"]))
        .default([]),
      targetUserIds: z.array(z.string().uuid()).default([]),
      tiers: z.array(tierRowSchema(t)).default([]),
    })
    .superRefine((value, context) => {
      if (
        value.audienceMode === "membership_tiers" &&
        value.targetTierTypes.length === 0
      ) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["targetTierTypes"],
          message: t(
            "admin.marketing.adPackages.validation.tierTargetRequired",
          ),
        });
      }
      if (
        value.audienceMode === "specific_users" &&
        value.targetUserIds.length === 0
      ) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["targetUserIds"],
          message: t(
            "admin.marketing.adPackages.validation.userTargetRequired",
          ),
        });
      }
      if (
        value.audienceMode === "tiers_or_users" &&
        value.targetTierTypes.length === 0 &&
        value.targetUserIds.length === 0
      ) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["targetTierTypes"],
          message: t(
            "admin.marketing.adPackages.validation.audienceTargetRequired",
          ),
        });
      }
    });

export type PackageFormValues = z.infer<ReturnType<typeof packageSchema>>;
export type TierRowValues = PackageFormValues["tiers"][number];

export const emptyTierRow: TierRowValues = {
  durationDays: "7",
  minAmount: "0",
  maxAmount: "",
  price: "",
  campaignPrice: "",
  campaignStartsAt: "",
  campaignEndsAt: "",
  isActive: true,
};

/**
 * The row "Add row" appends. After a band with an upper bound it is the next
 * band of the same duration, starting at that bound: the upper bound is
 * exclusive, so the two bands touch with no gap (1000-5000, then 5000-...).
 * After an open-ended band (or none) that duration is covered, so the new
 * row starts from scratch.
 */
export function nextTierRow(rows: readonly TierRowValues[]): TierRowValues {
  const last = rows.at(-1);
  const end = last ? amountOrNull(last.maxAmount) : null;
  if (!last || end == null) return { ...emptyTierRow };
  return {
    ...emptyTierRow,
    durationDays: last.durationDays,
    minAmount: amountInputValue(end),
  };
}

const dateInput = (iso: string | null) => (iso ? iso.slice(0, 10) : "");

export function packageToForm(pkg?: AdPackage): PackageFormValues {
  if (!pkg) {
    return {
      name: "",
      slug: "",
      showcaseOnHome: false,
      isActive: true,
      sortOrder: "0",
      audienceMode: "everyone",
      targetTierTypes: [],
      targetUserIds: [],
      tiers: [{ ...emptyTierRow }],
    };
  }
  return {
    name: pkg.name,
    slug: pkg.slug,
    showcaseOnHome: pkg.showcaseOnHome,
    isActive: pkg.isActive,
    sortOrder: String(pkg.sortOrder ?? 0),
    audienceMode: pkg.audienceMode ?? "everyone",
    targetTierTypes: pkg.targetTierTypes ?? [],
    targetUserIds: pkg.targetUsers?.map((user) => user.id) ?? [],
    tiers: pkg.tiers.map((tier) => ({
      durationDays: String(tier.durationDays),
      minAmount: amountInputValue(tier.minAmount),
      maxAmount: amountInputValue(tier.maxAmount),
      price: amountInputValue(tier.price),
      campaignPrice: amountInputValue(tier.campaignPrice),
      campaignStartsAt: dateInput(tier.campaignStartsAt),
      campaignEndsAt: dateInput(tier.campaignEndsAt),
      isActive: tier.isActive,
    })),
  };
}

/** Shape form values into the create/update API payload. */
export function packageFormToPayload(v: PackageFormValues) {
  return {
    name: v.name.trim(),
    slug: v.slug.trim().toLowerCase(),
    showcaseOnHome: v.showcaseOnHome,
    isActive: v.isActive,
    sortOrder: Number(v.sortOrder) || 0,
    audienceMode: v.audienceMode,
    targetTierTypes:
      v.audienceMode === "membership_tiers" ||
      v.audienceMode === "tiers_or_users"
        ? v.targetTierTypes
        : [],
    targetUserIds:
      v.audienceMode === "specific_users" || v.audienceMode === "tiers_or_users"
        ? v.targetUserIds
        : [],
    tiers: v.tiers.map((row) => ({
      durationDays: parseInt(row.durationDays, 10) || 1,
      minAmount: amountOrZero(row.minAmount),
      maxAmount: amountOrNull(row.maxAmount),
      price: amountOrZero(row.price),
      campaignPrice: amountOrNull(row.campaignPrice),
      campaignStartsAt: row.campaignStartsAt
        ? new Date(row.campaignStartsAt).toISOString()
        : null,
      campaignEndsAt: row.campaignEndsAt
        ? new Date(row.campaignEndsAt + "T23:59:59").toISOString()
        : null,
      isActive: row.isActive,
    })),
  };
}
