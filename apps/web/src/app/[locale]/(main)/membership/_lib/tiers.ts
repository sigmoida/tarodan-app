/** @format */

import type {
  ListingLimits,
  Period,
  Tier,
  TierData,
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

  return { prices, limits };
}

/** "50 ilan" / "Sınırsız ilan" text for a tier's active-listing cap. */
export function listingLimitText(
  tierId: TierId,
  limits: ListingLimits,
  t: TFn,
): string {
  const key = `${tierId}_listing_limit` as keyof ListingLimits;
  const limit = limits[key] ?? LIMIT_FALLBACK[tierId];
  const suffix = t("membership.listingsLimit");
  return limit === -1
    ? `${t("membership.unlimited")} ${suffix}`
    : `${limit} ${suffix}`;
}

/** Build all four display tiers. Runs client-side (needs the i18n `t`). */
export function buildTiers(
  prices: TierPrices,
  limits: ListingLimits,
  t: TFn,
): Tier[] {
  return [
    {
      id: "free",
      name: t("membership.free"),
      price: 0,
      description: t("membership.subtitle"),
      popular: false,
      features: [
        { text: listingLimitText("free", limits, t), included: true },
        { text: t("search.search"), included: true },
        { text: t("message.messages"), included: true },
        { text: t("nav.trades"), included: false },
        { text: t("collection.collections"), included: false },
        { text: t("membership.noAds"), included: false },
      ],
    },
    {
      id: "basic",
      name: "Temel",
      price: prices.basic_monthly_price ?? 49,
      description: "Koleksiyoncular için başlangıç",
      popular: false,
      features: [
        { text: listingLimitText("basic", limits, t), included: true },
        { text: "6 resim/ilan", included: true },
        { text: t("nav.trades"), included: true },
        { text: t("collection.collections"), included: true },
        { text: t("membership.noAds"), included: false },
        { text: "2 öne çıkan ilan", included: true },
      ],
    },
    {
      id: "premium",
      name: t("membership.premium"),
      price: prices.premium_monthly_price ?? 99,
      description: t("membership.mostPopular"),
      popular: true,
      features: [
        { text: listingLimitText("premium", limits, t), included: true },
        { text: "10 resim/ilan", included: true },
        { text: t("nav.trades"), included: true },
        {
          text: `${t("membership.unlimited")} ${t("collection.collections")}`,
          included: true,
        },
        { text: t("membership.noAds"), included: true },
        { text: "10 öne çıkan ilan", included: true },
      ],
    },
    {
      id: "business",
      name: t("membership.business"),
      price: prices.business_monthly_price ?? 499,
      description: t("membership.business"),
      popular: false,
      features: [
        { text: listingLimitText("business", limits, t), included: true },
        { text: t("search.search"), included: true },
        { text: t("message.messages"), included: true },
        { text: t("nav.trades"), included: true },
        {
          text: `${t("membership.unlimited")} ${t("collection.collections")}`,
          included: true,
        },
        { text: t("membership.noAds"), included: true },
        { text: `24/7 ${t("membership.prioritySupport")}`, included: true },
        { text: "API", included: true },
      ],
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
