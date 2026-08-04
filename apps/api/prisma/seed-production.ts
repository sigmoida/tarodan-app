import {
  CommissionRuleSetStatus,
  MembershipTierType,
  PrismaClient,
  SellerType,
  ShippingTariffStatus,
  SubscriptionStatus,
} from "@prisma/client";
import * as bcrypt from "bcrypt";
import { randomUUID } from "crypto";
import { SHIPPING_PACKAGE_TIER_DEFAULTS } from "../src/modules/shipping/shipping-package-tier";
import {
  SEED_COMMISSION_PROFILES,
  SEED_COMMISSION_RULE_SET_IDS,
} from "./seed-config";

const prisma = new PrismaClient();

const membershipTiers = [
  {
    type: MembershipTierType.free,
    name: "Free",
    description: "Core marketplace access",
    monthlyPrice: 0,
    yearlyPrice: 0,
    maxFreeListings: 5,
    maxTotalListings: 10,
    maxImagesPerListing: 3,
    canCreateCollections: false,
    canTrade: false,
    isAdFree: false,
    featuredListingSlots: 0,
    commissionDiscount: 0,
    sortOrder: 0,
  },
  {
    type: MembershipTierType.basic,
    name: "Basic",
    description: "Expanded listings and trading",
    monthlyPrice: 49.99,
    yearlyPrice: 479.99,
    maxFreeListings: 15,
    maxTotalListings: 50,
    maxImagesPerListing: 6,
    canCreateCollections: true,
    canTrade: true,
    isAdFree: false,
    featuredListingSlots: 2,
    commissionDiscount: 0.005,
    sortOrder: 1,
  },
  {
    type: MembershipTierType.premium,
    name: "Premium",
    description: "Professional collector features",
    monthlyPrice: 99.99,
    yearlyPrice: 959.99,
    maxFreeListings: 50,
    maxTotalListings: 200,
    maxImagesPerListing: 10,
    canCreateCollections: true,
    canTrade: true,
    isAdFree: true,
    featuredListingSlots: 10,
    commissionDiscount: 0.01,
    sortOrder: 2,
  },
  {
    type: MembershipTierType.business,
    name: "Business",
    description: "Business seller features",
    monthlyPrice: 249.99,
    yearlyPrice: 2399.99,
    maxFreeListings: 200,
    maxTotalListings: 1000,
    maxImagesPerListing: 15,
    canCreateCollections: true,
    canTrade: true,
    isAdFree: true,
    featuredListingSlots: 50,
    commissionDiscount: 0.015,
    sortOrder: 3,
  },
] as const;

async function seedMembershipTiers(): Promise<void> {
  for (const tier of membershipTiers) {
    await prisma.membershipTier.upsert({
      where: { type: tier.type },
      create: tier,
      update: {},
    });
  }
}

async function seedCommissionRule(): Promise<void> {
  const categories = await prisma.category.findMany({
    where: { isActive: true },
  });
  if (categories.length === 0) {
    console.log(
      "No active categories found; skipping strict commission rule set seed.",
    );
    return;
  }
  const set = await prisma.commissionRuleSet.upsert({
    where: { id: SEED_COMMISSION_RULE_SET_IDS.production },
    create: {
      id: SEED_COMMISSION_RULE_SET_IDS.production,
      name: "Production strict commission v1",
      version: 1,
      status: CommissionRuleSetStatus.ACTIVE,
      publishedAt: new Date(),
      publishedBy: "production-seed",
    },
    update: {},
  });
  for (const category of categories) {
    for (const profile of SEED_COMMISSION_PROFILES) {
      const id = `production-rule-${category.id}-${profile.key}`;
      const data = {
        name: `${category.name} / ${profile.label}`,
        categoryId: category.id,
        sellerType: profile.sellerType,
        minAmount: profile.minAmount,
        maxAmount: profile.maxAmount,
        buyerCommissionRate: profile.buyerCommissionRate,
        buyerCommissionMin: profile.buyerCommissionMin,
        buyerCommissionMax: profile.buyerCommissionMax,
        buyerServiceFeeRate: profile.buyerServiceFeeRate,
        buyerServiceFeeMin: profile.buyerServiceFeeMin,
        buyerServiceFeeMax: profile.buyerServiceFeeMax,
        sellerCommissionRate: profile.sellerCommissionRate,
        sellerCommissionMin: profile.sellerCommissionMin,
        sellerCommissionMax: profile.sellerCommissionMax,
        sellerPlatformFeeRate: profile.sellerPlatformFeeRate,
        sellerPlatformFeeMin: profile.sellerPlatformFeeMin,
        sellerPlatformFeeMax: profile.sellerPlatformFeeMax,
        tradeFeeSellerAmount: profile.tradeFeeSellerAmount,
        tradeFeeBuyerAmount: profile.tradeFeeBuyerAmount,
        shippingBuyerShare: profile.shippingShares.small,
      };
      await prisma.commissionRule.upsert({
        where: { id },
        create: {
          id,
          ruleSetId: set.id,
          ...data,
          shippingShares: {
            create: Object.entries(profile.shippingShares).map(
              ([tierCode, buyerShare]) => ({
                tierCode: tierCode as keyof typeof profile.shippingShares,
                buyerShare,
              }),
            ),
          },
        },
        update: {
          ...data,
          shippingShares: {
            deleteMany: {},
            create: Object.entries(profile.shippingShares).map(
              ([tierCode, buyerShare]) => ({
                tierCode: tierCode as keyof typeof profile.shippingShares,
                buyerShare,
              }),
            ),
          },
        },
      });
    }
  }
}

async function seedTaxReferences(): Promise<void> {
  const taxRegion = await prisma.taxRegion.upsert({
    where: { id: "production-tax-region-tr" },
    create: {
      id: "production-tax-region-tr",
      name: "Turkiye",
      countryCode: "TR",
      isDefault: true,
      isActive: true,
    },
    update: {},
  });
  const taxRate = await prisma.taxRate.upsert({
    where: { id: "production-tax-rate-kdv-20" },
    create: {
      id: "production-tax-rate-kdv-20",
      taxRegionId: taxRegion.id,
      name: "KDV 20%",
      rate: 20,
      isDefault: true,
      isActive: true,
    },
    update: {},
  });
  await prisma.taxRule.upsert({
    where: { id: "production-tax-rule-default" },
    create: {
      id: "production-tax-rule-default",
      taxRegionId: taxRegion.id,
      taxRateId: taxRate.id,
      scope: "default_rate",
      priority: 0,
      isActive: true,
    },
    update: {},
  });
}

async function seedPlatformSeller(): Promise<void> {
  const passwordHash = await bcrypt.hash(randomUUID(), 12);
  const platformSeller = await prisma.user.upsert({
    where: { email: "platform@tarodan.com" },
    create: {
      email: "platform@tarodan.com",
      passwordHash,
      displayName: "Tarodan Platform",
      isVerified: true,
      isEmailVerified: true,
      isSeller: true,
      sellerType: SellerType.platform,
      companyName: "Tarodan Platform Ticaret A.Ş.",
      businessStatus: "approved",
      taxId: "9999999999",
      acceptsMarketingEmails: false,
    },
    update: {
      isVerified: true,
      isEmailVerified: true,
      isSeller: true,
      sellerType: SellerType.platform,
      companyName: "Tarodan Platform Ticaret A.Ş.",
      businessStatus: "approved",
      taxId: "9999999999",
      acceptsMarketingEmails: false,
    },
  });
  const businessTier = await prisma.membershipTier.findUniqueOrThrow({
    where: { type: MembershipTierType.business },
  });
  const periodStart = new Date();
  const periodEnd = new Date(periodStart);
  periodEnd.setFullYear(periodEnd.getFullYear() + 20);
  await prisma.userMembership.upsert({
    where: { userId: platformSeller.id },
    create: {
      userId: platformSeller.id,
      tierId: businessTier.id,
      status: SubscriptionStatus.active,
      currentPeriodStart: periodStart,
      currentPeriodEnd: periodEnd,
    },
    update: {
      tierId: businessTier.id,
      status: SubscriptionStatus.active,
      currentPeriodStart: periodStart,
      currentPeriodEnd: periodEnd,
    },
  });
}

/**
 * Production bootstrap container açılışında tekrar çalışır. Bu nedenle yalnız
 * ilk kurulum için güvenli başlangıç fiyatını yazar; adminin daha sonra girdiği
 * gerçek tarife fiyatlarını update dalında asla ezmez. Kapsamlı test seed'indeki
 * 100/130/160 TL senaryosu production bootstrap'tan bilinçli olarak ayrıdır.
 */
const LAUNCH_TARIFF_PACKAGE_FEE = 29.99;

async function seedShippingTariff(): Promise<void> {
  await prisma.shippingTariff.upsert({
    where: {
      provider_version: {
        provider: "surat",
        version: 1,
      },
    },
    create: {
      provider: "surat",
      name: "Surat Kargo v1",
      status: ShippingTariffStatus.active,
      version: 1,
      currency: "TRY",
      freeShippingEnabled: true,
      freeShippingThreshold: 500,
      effectiveFrom: new Date("2026-01-01T00:00:00.000Z"),
      packageTiers: {
        create: SHIPPING_PACKAGE_TIER_DEFAULTS.map((tier) => ({
          code: tier.code,
          label: tier.label,
          minDesi: tier.minDesi,
          maxDesi: tier.maxDesi,
          amount: LAUNCH_TARIFF_PACKAGE_FEE,
          sortOrder: tier.sortOrder,
        })),
      },
    },
    update: {},
  });
}

async function main(): Promise<void> {
  await seedMembershipTiers();
  await seedCommissionRule();
  await seedTaxReferences();
  await seedPlatformSeller();
  await seedShippingTariff();
  console.log("Production reference data is ready.");
}

main()
  .catch((error) => {
    console.error("Production reference bootstrap failed.", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
