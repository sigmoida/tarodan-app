/** @format */

import type {
  ListingLimits,
  Period,
  Tier,
  TierCapabilities,
  TierData,
  TierFeature,
  TierId,
  TierPrices,
} from "./types";

import type { Translate as TFn } from "@/types/i18n";

/** Fallback active-listing caps when the tier row is missing a value. */
const LIMIT_FALLBACK: Record<TierId, number> = {
  free: 10,
  basic: 50,
  premium: 200,
  business: 1000,
};

/**
 * Normalize the raw `/membership/tiers` payload into prices + limits. Fiyat ve
 * limitler TEK KAYNAKTAN (DB MembershipTier) — checkout + backend ödeme ile
 * birebir aynı. Runs on the server so the first paint already has the numbers.
 */
export function normalizeTierData(raw: unknown): TierData {
  const list: any[] = Array.isArray(raw)
    ? raw
    : Array.isArray((raw as any)?.data)
      ? (raw as any).data
      : [];
  const by = (type: string) => list.find((x) => x?.type === type);
  const free = by("free");
  const basic = by("basic");
  const premium = by("premium");
  const business = by("business");

  // Yıllık indirim % — tier fiyatlarından türetilir (monthly*12 vs yearly).
  const pct = (m?: number, y?: number) =>
    m && y && m * 12 > 0 ? Math.round((1 - y / (m * 12)) * 100) : undefined;

  const num = (v: unknown) => (v == null ? undefined : Number(v));

  const limits: ListingLimits = {
    free_listing_limit: free?.maxTotalListings,
    basic_listing_limit: basic?.maxTotalListings,
    premium_listing_limit: premium?.maxTotalListings,
    business_listing_limit: business?.maxTotalListings,
  };

  // Per-tier capabilities from the admin-driven tier row — the single source the
  // plan cards (page + checkout) derive their features from, so nothing drifts.
  const caps = (row: any): TierCapabilities => ({
    maxTotalListings: row?.maxTotalListings,
    maxImagesPerListing: row?.maxImagesPerListing,
    canTrade: row?.canTrade,
    canCreateCollections: row?.canCreateCollections,
  });
  const capabilities: Record<TierId, TierCapabilities> = {
    free: caps(free),
    basic: caps(basic),
    premium: caps(premium),
    business: caps(business),
  };

  const prices: TierPrices = {
    basic_monthly_price: num(basic?.monthlyPrice),
    basic_yearly_price: num(basic?.yearlyPrice),
    premium_monthly_price: num(premium?.monthlyPrice),
    premium_yearly_price: num(premium?.yearlyPrice),
    business_monthly_price: num(business?.monthlyPrice),
    business_yearly_price: num(business?.yearlyPrice),
    yearly_discount_percentage:
      pct(num(premium?.monthlyPrice), num(premium?.yearlyPrice)) ?? 20,
  };

  return { prices, limits, capabilities };
}

/**
 * Canonical plan-card features for a tier, derived ENTIRELY from the admin-driven
 * tier row (DB MembershipTier). The SINGLE source both the membership page and the
 * checkout page use, so the two never contradict and an admin toggle (limits /
 * images / canTrade / canCreateCollections) is reflected everywhere.
 * No hardcoded capability copy — the earlier drift (200 vs unlimited listings,
 * 10 vs 15 images, differing trade/collection flags) came from duplicating these.
 */
export function buildTierFeatures(
  caps: TierCapabilities,
  tierId: TierId,
  t: TFn,
): TierFeature[] {
  const cap = caps.maxTotalListings ?? LIMIT_FALLBACK[tierId];
  const listingText =
    cap === -1
      ? `${t("membership.unlimited")} ${t("membership.listingsLimit")}`
      : `${cap} ${t("membership.listingsLimit")}`;
  const images = caps.maxImagesPerListing;
  return [
    { text: listingText, included: true },
    ...(images
      ? [
          {
            text: t("membership.imagesPerListing", { count: images }),
            included: true,
          },
        ]
      : []),
    { text: t("nav.trades"), included: !!caps.canTrade },
    {
      text: t("collection.collections"),
      included: !!caps.canCreateCollections,
    },
    // "Reklamsız" avantajı DEVRE DIŞI: banner'lar herkese gösterilir, hiçbir
    // katman bu vaadi veremez.
  ];
}

/** Static marketing extras that are NOT membership entitlements (no DTO field). */
const TIER_EXTRAS: Partial<Record<TierId, (t: TFn) => TierFeature[]>> = {
  business: (t) => [
    { text: `24/7 ${t("membership.prioritySupport")}`, included: true },
    { text: "API", included: true },
  ],
};

/** Build all four display tiers from the normalized (admin-driven) tier data. */
export function buildTiers(data: TierData, t: TFn): Tier[] {
  const { prices, capabilities } = data;
  const featuresFor = (id: TierId): TierFeature[] => [
    ...buildTierFeatures(capabilities[id], id, t),
    ...(TIER_EXTRAS[id]?.(t) ?? []),
  ];
  return [
    {
      id: "free",
      name: t("membership.free"),
      price: 0,
      description: t("membership.subtitle"),
      popular: false,
      features: featuresFor("free"),
    },
    {
      id: "basic",
      name: "Temel",
      price: prices.basic_monthly_price ?? 49,
      description: "Koleksiyoncular için başlangıç",
      popular: false,
      features: featuresFor("basic"),
    },
    {
      id: "premium",
      name: t("membership.premium"),
      price: prices.premium_monthly_price ?? 99,
      description: t("membership.mostPopular"),
      popular: true,
      features: featuresFor("premium"),
    },
    {
      id: "business",
      name: t("membership.business"),
      price: prices.business_monthly_price ?? 499,
      description: t("membership.business"),
      popular: false,
      features: featuresFor("business"),
    },
  ];
}

/**
 * Which tiers to show: business accounts (or a current business membership) see
 * only the business plan; everyone else sees free/basic/premium.
 */
export function visibleTiers(
  all: Tier[],
  opts: { isBusinessAccount: boolean; currentTier: string | null },
): Tier[] {
  const isBusiness = opts.isBusinessAccount || opts.currentTier === "business";
  return isBusiness
    ? all.filter((tier) => tier.id === "business")
    : all.filter((tier) => tier.id !== "business");
}

/** The price to display for a tier at the selected billing period. */
export function displayPrice(
  tier: Tier,
  period: Period,
  prices: TierPrices,
): number {
  if (period !== "yearly" || tier.price === 0) return tier.price;
  if (tier.id === "premium" && prices.premium_yearly_price)
    return prices.premium_yearly_price;
  if (tier.id === "business" && prices.business_yearly_price)
    return prices.business_yearly_price;
  const discount = prices.yearly_discount_percentage ?? 20;
  return Math.round(tier.price * 12 * (1 - discount / 100) * 100) / 100;
}
