import {
  CommissionAppliesTo,
  CommissionRuleType,
  CommissionSellerType,
  MembershipTierType,
  PrismaClient,
  SellerType,
  ShippingPackageTierCode,
  ShippingTariffStatus,
} from "@prisma/client";
import * as bcrypt from "bcrypt";
import { randomUUID } from "crypto";
import { SHIPPING_PACKAGE_TIER_DEFAULTS } from "../src/modules/shipping/shipping-package-tier";

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
  // appliesTo BOTH olmalı: isCatchAllCommissionRule (ve ona dayanan health check +
  // checkout fail-closed guard'ı) yalnız her iki tarafa uygulanan jokeri catch-all
  // sayar. SELLER olarak bırakıldığında checkBusinessConfig "catch-all kural yok"
  // diyerek uyarıyordu.
  await prisma.commissionRule.upsert({
    where: { id: "production-default-commission" },
    create: {
      id: "production-default-commission",
      name: "Default marketplace commission",
      ruleType: CommissionRuleType.default,
      sellerType: CommissionSellerType.ALL,
      appliesTo: CommissionAppliesTo.BOTH,
      sellerRate: 5,
      sellerCommissionRate: 5,
      percentage: 0.05,
      shippingBuyerShare: 100,
      priority: 0,
      isActive: true,
      // Paket boyutu başına kargo bölüşümü: küçük paketi alıcı öder, paket
      // büyüdükçe satıcı payı artar. Tutarlar tarifede, paylar burada.
      shippingShares: {
        create: [
          { tierCode: ShippingPackageTierCode.small, buyerShare: 100 },
          { tierCode: ShippingPackageTierCode.medium, buyerShare: 70 },
          { tierCode: ShippingPackageTierCode.large, buyerShare: 50 },
        ],
      },
    },
    update: { appliesTo: CommissionAppliesTo.BOTH },
  });
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
  await prisma.user.upsert({
    where: { email: "platform@tarodan.com" },
    create: {
      email: "platform@tarodan.com",
      passwordHash,
      displayName: "Tarodan Platform",
      isVerified: true,
      isEmailVerified: true,
      isSeller: true,
      sellerType: SellerType.platform,
      acceptsMarketingEmails: false,
    },
    update: {
      isVerified: true,
      isEmailVerified: true,
      isSeller: true,
      sellerType: SellerType.platform,
      acceptsMarketingEmails: false,
    },
  });
}

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
      outboundPackageFee: 29.99,
      freeShippingEnabled: true,
      freeShippingThreshold: 500,
      returnPackageFee: 29.99,
      tradeLegFee: 29.99,
      effectiveFrom: new Date("2026-01-01T00:00:00.000Z"),
      // Satıcıya gösterilen üç paket boyutu; kargo fiyatı bu satırlardan çözülür.
      packageTiers: {
        create: SHIPPING_PACKAGE_TIER_DEFAULTS.map((tier, index) => ({
          code: tier.code,
          label: tier.label,
          minDesi: tier.minDesi,
          maxDesi: tier.maxDesi,
          amount: [100, 130, 160][index],
          ...[
            { sampleWidth: 25, sampleHeight: 20, sampleLength: 12 },
            { sampleWidth: 40, sampleHeight: 30, sampleLength: 12 },
            { sampleWidth: 50, sampleHeight: 40, sampleLength: 15 },
          ][index],
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
