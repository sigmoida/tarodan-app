/**
 * Production REFERANS verisi — her API açılışında koşar (entrypoint.sh).
 *
 * Kapsamı bilinçli olarak dar: uygulamanın açılabilmesi için satırı VAR olması
 * gereken, kendisi bir iş kararı OLMAYAN kayıtlar. Fiyat/oran gibi iş değerleri
 * lansman seed'ine (`seed-launch.ts` + `data/launch/*.json`) aittir ve bu dosya
 * onları asla ezmez — bütün upsert'lerin `update` dalı boştur.
 *
 * Komisyon kuralları buradan KALDIRILDI. Eskiden demo config'in (yerel "Araba"
 * senaryosu) oranlarını her aktif kategoriye ACTIVE olarak yayınlıyordu; yani
 * kategoriler girildikten sonraki ilk redeploy'da canlı fiyatlandırma kimse
 * onaylamadan demo rakamlarına dönüyordu. Artık komisyonun tek kaynağı lansman
 * seed'i ya da adminin yayınladığı kural setidir; hiçbiri yoksa `/health/ready`
 * kırmızı kalır ve ilan oluşturma 503 döner — sessizce yanlış fiyat yerine.
 */
import {
  MembershipTierType,
  PrismaClient,
  SellerType,
  ShippingTariffStatus,
  SubscriptionStatus,
} from "@prisma/client";
import * as bcrypt from "bcrypt";
import { randomUUID } from "crypto";
import { SHIPPING_PACKAGE_TIER_DEFAULTS } from "../src/modules/shipping/helpers/shipping-package-tier";
import { PRODUCTION_REFERENCE_IDS } from "./seed-ids";

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

async function seedTaxReferences(): Promise<void> {
  const taxRegion = await prisma.taxRegion.upsert({
    where: { id: PRODUCTION_REFERENCE_IDS.taxRegion },
    create: {
      id: PRODUCTION_REFERENCE_IDS.taxRegion,
      name: "Turkiye",
      countryCode: "TR",
      isDefault: true,
      isActive: true,
    },
    update: {},
  });
  const taxRate = await prisma.taxRate.upsert({
    where: { id: PRODUCTION_REFERENCE_IDS.taxRateDefault },
    create: {
      id: PRODUCTION_REFERENCE_IDS.taxRateDefault,
      taxRegionId: taxRegion.id,
      name: "KDV 20%",
      rate: 20,
      isDefault: true,
      isActive: true,
    },
    update: {},
  });
  await prisma.taxRule.upsert({
    where: { id: PRODUCTION_REFERENCE_IDS.taxRuleDefault },
    create: {
      id: PRODUCTION_REFERENCE_IDS.taxRuleDefault,
      taxRegionId: taxRegion.id,
      taxRateId: taxRate.id,
      scope: "default_rate",
      priority: 0,
      isActive: true,
    },
    update: {},
  });
}

/**
 * TEK istisna: `update` dalı doludur. Platform servis hesabı bir iş kararı değil,
 * sistemin kendi kaydı — komisyon/ödeme akışları onun `sellerType=platform`
 * olmasına güvenir. Yanlışlıkla bozulursa kendini onarması istenen davranıştır;
 * bu dosyadaki "adminin girdiğini ezme" kuralı iş değerleri içindir.
 */
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
 * Bootstrap her açılışta koştuğu için yalnız İSKELET yazar: üç kademesi de olan
 * bir tarife satırı bulunsun ki checkout kargo fiyatı çözebilsin ve
 * `/health/ready` "eksik kademe" demesin. Gerçek fiyatlar lansman seed'inden
 * (`data/launch/business-config.json`) ya da adminden gelir; `update: {}` olduğu
 * için sonraki her açılış onlara dokunmaz.
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
