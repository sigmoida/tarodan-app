import { z } from "zod";
import type { useTranslations } from "next-intl";

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

const tierRowSchema = (t: T) =>
  z.object({
    durationDays: z
      .string()
      .min(1, t("admin.marketing.adPackages.validation.durationMin")),
    minAmount: z.string().default("0"),
    maxAmount: z.string().default(""),
    price: z
      .string()
      .min(1, t("admin.marketing.adPackages.validation.priceMin")),
    campaignPrice: z.string().default(""),
    campaignStartsAt: z.string().default(""),
    campaignEndsAt: z.string().default(""),
    isActive: z.boolean().default(true),
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
      minAmount: String(tier.minAmount),
      maxAmount: tier.maxAmount == null ? "" : String(tier.maxAmount),
      price: String(tier.price),
      campaignPrice:
        tier.campaignPrice == null ? "" : String(tier.campaignPrice),
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
      minAmount: parseFloat(row.minAmount) || 0,
      maxAmount: row.maxAmount.trim() ? parseFloat(row.maxAmount) : null,
      price: parseFloat(row.price) || 0,
      campaignPrice: row.campaignPrice.trim()
        ? parseFloat(row.campaignPrice)
        : null,
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
