/**
 * LANSMAN seed'i — canlıya çıkılacak asgari veri.
 *
 * `seed-production.ts` yalnız iskeleti kurar (uygulama açılsın diye); iş
 * değerlerinin tek kaynağı burasıdır: `prisma/data/launch/*.json`. Demo/staging
 * seed'inden (`seed.ts` + `seed-demo-config.ts`) TAMAMEN bağımsızdır ve öyle
 * kalmalıdır — `src/common/seed-independence.spec.ts` bunu CI'da doğrular.
 *
 * Yazdıkları: onaylanmış iş değerleri (üyelik/vergi/tarife/ayarlar), katalog
 * (kategori, marka, model, üretici, özellik), ACTIVE komisyon kural seti,
 * kurumsal satıcı + üyeliği, süper admin adresi (= depo adresi) ve GÖRSELSİZ,
 * `inactive` durumdaki lansman ilanları.
 *
 * Operasyonel veri (sipariş, takas, ödeme) bilinçli olarak YOKTUR.
 * Tekrar çalıştırılabilir: her adım doğal anahtarı üzerinden upsert eder.
 */
import {
  AdminRole,
  BusinessStatus,
  CommissionRuleSetStatus,
  CommissionSellerType,
  MembershipTierType,
  Prisma,
  PrismaClient,
  ProductCondition,
  ProductKind,
  ProductStatus,
  SellerType,
  ShippingPackageTierCode,
  ShippingTariffStatus,
  SubscriptionStatus,
} from "@prisma/client";
import * as bcrypt from "bcrypt";
import { readFileSync } from "fs";
import { join } from "path";
import { productShippingTierData } from "../src/modules/product/helpers/product-shipping-tier.helper";
import {
  PRODUCTION_REFERENCE_IDS,
  SEED_COMMISSION_RULE_SET_IDS,
} from "./seed-ids";

const prisma = new PrismaClient();

// ts-node'da `prisma/`, derlenmişte `dist-seed/prisma/` — build:seed veriyi
// ikisinde de aynı göreli yola kopyalar.
const DATA_DIR = join(__dirname, "data", "launch");
const load = <T>(file: string): T =>
  JSON.parse(readFileSync(join(DATA_DIR, file), "utf8")) as T;

const log = (message: string) => console.log(`[launch-seed] ${message}`);

/** Veri dosyalarındakiyle AYNI kural — slug'lar orada üretilmişti. */
const slugify = (value: string): string =>
  value
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase("tr")
    .replace(/ı/g, "i")
    .replace(/ş/g, "s")
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

// ───────────────────────── veri tipleri ─────────────────────────

interface AddressData {
  title: string;
  fullName: string;
  phone: string;
  city: string;
  district: string;
  address: string;
  zipCode: string | null;
  isDefault: boolean;
}

interface Accounts {
  superAdmin: { displayName: string; address: AddressData };
  corporateSeller: {
    email: string;
    displayName: string;
    companyName: string;
    taxId: string;
    taxOffice: string;
    companyType: string;
    companyCity: string;
    companyDistrict: string;
    phone: string;
    membership: { periodYears: number };
    address: AddressData;
  };
}

interface BusinessConfig {
  shippingTariff: {
    provider: string;
    name: string;
    version: number;
    currency: string;
    freeShippingEnabled: boolean;
    freeShippingThreshold: number;
    effectiveFrom: string;
    packageTiers: Array<{
      code: ShippingPackageTierCode;
      label: string;
      minDesi: number;
      maxDesi: number | null;
      amount: number;
      sampleWidth: number | null;
      sampleHeight: number | null;
      sampleLength: number | null;
      sortOrder: number;
    }>;
  };
  tax: {
    region: { name: string; countryCode: string; isDefault: boolean };
    rates: Array<{
      key: string;
      name: string;
      rate: number;
      isDefault: boolean;
      sortOrder: number;
    }>;
    defaultRuleRateKey: string;
  };
  membershipTiers: Array<
    Record<string, unknown> & { type: MembershipTierType }
  >;
  platformSettings: Array<{
    key: string;
    value: string;
    type: string;
    description: string;
  }>;
}

interface CommissionConfig {
  ruleSetName: string;
  sellerTypes: CommissionSellerType[];
  bands: Array<{
    key: string;
    label: string;
    minAmount: number;
    maxAmount: number | null;
    buyerCommissionRate: number;
    buyerServiceFeeRate: number;
    sellerCommissionRate: number;
    sellerPlatformFeeRate: number;
  }>;
  tradeFeeSellerAmount: number;
  tradeFeeBuyerAmount: number;
  shippingShares: Record<ShippingPackageTierCode, number>;
}

interface ProductData {
  ref: string;
  title: string;
  description: string | null;
  categorySlug: string;
  brandSlug: string | null;
  carModelSlug: string | null;
  manufacturerSlug: string | null;
  modelCode: string | null;
  condition: ProductCondition;
  color: string | null;
  isBoxed: boolean | null;
  price: number;
  salePrice: number | null;
  quantity: number | null;
  shippingPackageTier: ShippingPackageTierCode;
  isPreorder: boolean;
  isSet: boolean;
  bundleSize: number | null;
  releaseYear: number | null;
  attributeSlugs: string[];
  status: ProductStatus;
  kind: ProductKind;
  isTradeEnabled: boolean;
}

// ───────────────────────── guard ─────────────────────────

function assertProduction(): void {
  if (process.env.APP_ENV !== "production") {
    throw new Error(
      "Launch seed requires APP_ENV=production; it writes the live catalog.",
    );
  }
}

// ───────────────────────── iş değerleri ─────────────────────────

async function seedBusinessConfig(config: BusinessConfig): Promise<void> {
  for (const tier of config.membershipTiers) {
    const { type, ...rest } = tier;
    await prisma.membershipTier.upsert({
      where: { type },
      create: { type, ...rest } as Prisma.MembershipTierCreateInput,
      update: rest as Prisma.MembershipTierUpdateInput,
    });
  }
  log(`membership tiers: ${config.membershipTiers.length}`);

  // Vergi: seed-production'ın açtığı SATIRLARI günceller. Ayrı kimlikle ikinci
  // bir bölge/oran açmak iki `isDefault` doğurur ve hangisinin geçerli olduğu
  // belirsizleşir.
  const region = await prisma.taxRegion.upsert({
    where: { id: PRODUCTION_REFERENCE_IDS.taxRegion },
    create: {
      id: PRODUCTION_REFERENCE_IDS.taxRegion,
      name: config.tax.region.name,
      countryCode: config.tax.region.countryCode,
      isDefault: config.tax.region.isDefault,
      isActive: true,
    },
    update: {
      name: config.tax.region.name,
      countryCode: config.tax.region.countryCode,
      isDefault: config.tax.region.isDefault,
      isActive: true,
    },
  });

  const rateIdFor = (key: string) =>
    key === config.tax.defaultRuleRateKey
      ? PRODUCTION_REFERENCE_IDS.taxRateDefault
      : `launch-tax-rate-${key}`;

  for (const rate of config.tax.rates) {
    await prisma.taxRate.upsert({
      where: { id: rateIdFor(rate.key) },
      create: {
        id: rateIdFor(rate.key),
        taxRegionId: region.id,
        name: rate.name,
        rate: rate.rate,
        isDefault: rate.isDefault,
        sortOrder: rate.sortOrder,
        isActive: true,
      },
      update: {
        name: rate.name,
        rate: rate.rate,
        isDefault: rate.isDefault,
        sortOrder: rate.sortOrder,
        isActive: true,
      },
    });
  }
  await prisma.taxRule.upsert({
    where: { id: PRODUCTION_REFERENCE_IDS.taxRuleDefault },
    create: {
      id: PRODUCTION_REFERENCE_IDS.taxRuleDefault,
      taxRegionId: region.id,
      taxRateId: rateIdFor(config.tax.defaultRuleRateKey),
      scope: "default_rate",
      priority: 0,
      isActive: true,
    },
    update: {
      taxRateId: rateIdFor(config.tax.defaultRuleRateKey),
      isActive: true,
    },
  });
  log(`tax: 1 region, ${config.tax.rates.length} rates, 1 default rule`);

  const tariff = config.shippingTariff;
  const tierRows = tariff.packageTiers.map((tier) => ({
    code: tier.code,
    label: tier.label,
    minDesi: tier.minDesi,
    maxDesi: tier.maxDesi,
    amount: tier.amount,
    sampleWidth: tier.sampleWidth,
    sampleHeight: tier.sampleHeight,
    sampleLength: tier.sampleLength,
    sortOrder: tier.sortOrder,
  }));
  await prisma.shippingTariff.upsert({
    where: {
      provider_version: { provider: tariff.provider, version: tariff.version },
    },
    create: {
      provider: tariff.provider,
      name: tariff.name,
      status: ShippingTariffStatus.active,
      version: tariff.version,
      currency: tariff.currency,
      freeShippingEnabled: tariff.freeShippingEnabled,
      freeShippingThreshold: tariff.freeShippingThreshold,
      effectiveFrom: new Date(tariff.effectiveFrom),
      packageTiers: { create: tierRows },
    },
    update: {
      name: tariff.name,
      status: ShippingTariffStatus.active,
      currency: tariff.currency,
      freeShippingEnabled: tariff.freeShippingEnabled,
      freeShippingThreshold: tariff.freeShippingThreshold,
      effectiveFrom: new Date(tariff.effectiveFrom),
      packageTiers: { deleteMany: {}, create: tierRows },
    },
  });
  log(
    `shipping tariff "${tariff.name}": ${tierRows
      .map((tier) => `${tier.code}=${tier.amount}`)
      .join(
        ", ",
      )} (free shipping ${tariff.freeShippingEnabled ? "on" : "off"})`,
  );

  for (const setting of config.platformSettings) {
    await prisma.platformSetting.upsert({
      where: { settingKey: setting.key },
      create: {
        settingKey: setting.key,
        settingValue: setting.value,
        settingType: setting.type,
        description: setting.description,
      },
      update: {
        settingValue: setting.value,
        settingType: setting.type,
        description: setting.description,
      },
    });
  }
  log(`platform settings: ${config.platformSettings.length}`);
}

// ───────────────────────── katalog ─────────────────────────

interface CategoryData {
  name: string;
  slug: string;
  description: string | null;
  sortOrder: number;
  isActive: boolean;
  parentSlug: string | null;
}
interface BrandData {
  name: string;
  slug: string;
  country: string | null;
  foundedYear: number | null;
  website: string | null;
  description: string | null;
  sortOrder: number;
  isActive: boolean;
}
interface CarModelData {
  brandSlug: string;
  name: string;
  slug: string;
  yearStart: number | null;
  yearEnd: number | null;
  sortOrder: number;
  isActive: boolean;
}
interface AttributeGroupData {
  name: string;
  slug: string;
  isRequired: boolean;
  sortOrder: number;
  isActive: boolean;
  values: Array<{
    value: string;
    slug: string;
    displayValue: string | null;
    sortOrder: number;
    isActive: boolean;
  }>;
}

async function seedCatalog(): Promise<void> {
  const categories = load<CategoryData[]>("categories.json");
  const brands = load<BrandData[]>("brands.json");
  const carModels = load<CarModelData[]>("car-models.json");
  const manufacturers = load<BrandData[]>("manufacturers.json");
  const attributeGroups = load<AttributeGroupData[]>("attribute-groups.json");

  // Üst kategoriler önce yazılır ki `parentSlug` çözülebilsin.
  const ordered = [
    ...categories.filter((category) => !category.parentSlug),
    ...categories.filter((category) => category.parentSlug),
  ];
  for (const category of ordered) {
    const parent = category.parentSlug
      ? await prisma.category.findUnique({
          where: { slug: category.parentSlug },
          select: { id: true },
        })
      : null;
    if (category.parentSlug && !parent) {
      throw new Error(
        `Category "${category.slug}" references unknown parent "${category.parentSlug}"`,
      );
    }
    const data = {
      name: category.name,
      description: category.description,
      sortOrder: category.sortOrder,
      isActive: category.isActive,
      parentId: parent?.id ?? null,
    };
    await prisma.category.upsert({
      where: { slug: category.slug },
      create: { slug: category.slug, ...data },
      update: data,
    });
  }
  log(`categories: ${categories.length}`);

  for (const manufacturer of manufacturers) {
    const data = {
      name: manufacturer.name,
      country: manufacturer.country,
      foundedYear: manufacturer.foundedYear,
      website: manufacturer.website,
      description: manufacturer.description,
      sortOrder: manufacturer.sortOrder,
      isActive: manufacturer.isActive,
    };
    await prisma.manufacturer.upsert({
      where: { slug: manufacturer.slug },
      create: { slug: manufacturer.slug, ...data },
      update: data,
    });
  }
  log(`manufacturers: ${manufacturers.length}`);

  for (const brand of brands) {
    const data = {
      name: brand.name,
      country: brand.country,
      foundedYear: brand.foundedYear,
      website: brand.website,
      description: brand.description,
      sortOrder: brand.sortOrder,
      isActive: brand.isActive,
    };
    await prisma.brand.upsert({
      where: { slug: brand.slug },
      create: { slug: brand.slug, ...data },
      update: data,
    });
  }
  log(`brands: ${brands.length}`);

  for (const model of carModels) {
    const brand = await prisma.brand.findUnique({
      where: { slug: model.brandSlug },
      select: { id: true },
    });
    if (!brand) {
      throw new Error(
        `Car model "${model.slug}" references unknown brand "${model.brandSlug}"`,
      );
    }
    const data = {
      brandId: brand.id,
      name: model.name,
      yearStart: model.yearStart,
      yearEnd: model.yearEnd,
      sortOrder: model.sortOrder,
      isActive: model.isActive,
    };
    await prisma.carModel.upsert({
      where: { slug: model.slug },
      create: { slug: model.slug, ...data },
      update: data,
    });
  }
  log(`car models: ${carModels.length}`);

  let valueCount = 0;
  for (const group of attributeGroups) {
    const groupData = {
      name: group.name,
      isRequired: group.isRequired,
      sortOrder: group.sortOrder,
      isActive: group.isActive,
    };
    const saved = await prisma.attributeGroup.upsert({
      where: { slug: group.slug },
      create: { slug: group.slug, ...groupData },
      update: groupData,
    });
    for (const value of group.values) {
      const valueData = {
        value: value.value,
        displayValue: value.displayValue,
        sortOrder: value.sortOrder,
        isActive: value.isActive,
      };
      await prisma.attribute.upsert({
        where: { groupId_slug: { groupId: saved.id, slug: value.slug } },
        create: { groupId: saved.id, slug: value.slug, ...valueData },
        update: valueData,
      });
      valueCount += 1;
    }
  }
  log(`attribute groups: ${attributeGroups.length} (${valueCount} values)`);
}

// ───────────────────────── komisyon ─────────────────────────

async function seedCommissionRuleSet(config: CommissionConfig): Promise<void> {
  const categories = await prisma.category.findMany({
    where: { isActive: true },
    select: { id: true, name: true },
  });
  if (categories.length === 0) {
    throw new Error(
      "No active categories; commission coverage cannot be published.",
    );
  }

  // Kısmi indeks tek ACTIVE sete izin verir. Admin kendi setini yayınladıysa
  // (ya da bu seed yeniden koşuyorsa) onu ARCHIVED'a çekmeyiz — bizimki DRAFT
  // kalır ve operatör kararını verir.
  const otherActive = await prisma.commissionRuleSet.findFirst({
    where: {
      id: { not: SEED_COMMISSION_RULE_SET_IDS.launch },
      status: CommissionRuleSetStatus.ACTIVE,
    },
    select: { id: true, name: true },
  });
  const status = otherActive
    ? CommissionRuleSetStatus.DRAFT
    : CommissionRuleSetStatus.ACTIVE;
  if (otherActive) {
    log(
      `WARNING: "${otherActive.name}" is already ACTIVE; launch rule set stays DRAFT.`,
    );
  }

  // `version` global olarak tekil. Bize ait olmayan bir sürüm işgal edilmişse
  // sıradaki boş sürümü alırız — çakışıp seed'i öldürmek yerine.
  const existing = await prisma.commissionRuleSet.findUnique({
    where: { id: SEED_COMMISSION_RULE_SET_IDS.launch },
    select: { version: true },
  });
  let version = existing?.version ?? 1;
  if (!existing) {
    const taken = await prisma.commissionRuleSet.findMany({
      select: { version: true },
    });
    const used = new Set(taken.map((row) => row.version));
    while (used.has(version)) version += 1;
  }

  const set = await prisma.commissionRuleSet.upsert({
    where: { id: SEED_COMMISSION_RULE_SET_IDS.launch },
    create: {
      id: SEED_COMMISSION_RULE_SET_IDS.launch,
      name: config.ruleSetName,
      version,
      status,
      publishedAt:
        status === CommissionRuleSetStatus.ACTIVE ? new Date() : null,
      publishedBy: "launch-seed",
    },
    update: { name: config.ruleSetName },
  });

  let ruleCount = 0;
  for (const category of categories) {
    for (const sellerType of config.sellerTypes) {
      for (const band of config.bands) {
        const data = {
          name: `${category.name} / ${sellerType} / ${band.label}`,
          categoryId: category.id,
          sellerType,
          minAmount: band.minAmount,
          maxAmount: band.maxAmount,
          buyerCommissionRate: band.buyerCommissionRate,
          buyerServiceFeeRate: band.buyerServiceFeeRate,
          sellerCommissionRate: band.sellerCommissionRate,
          sellerPlatformFeeRate: band.sellerPlatformFeeRate,
          tradeFeeSellerAmount: config.tradeFeeSellerAmount,
          tradeFeeBuyerAmount: config.tradeFeeBuyerAmount,
          shippingBuyerShare: config.shippingShares.small,
        };
        const shares = Object.entries(config.shippingShares).map(
          ([tierCode, buyerShare]) => ({
            tierCode: tierCode as ShippingPackageTierCode,
            buyerShare,
          }),
        );
        await prisma.commissionRule.upsert({
          where: {
            ruleSetId_categoryId_sellerType_minAmount: {
              ruleSetId: set.id,
              categoryId: category.id,
              sellerType,
              minAmount: band.minAmount,
            },
          },
          create: {
            ruleSetId: set.id,
            ...data,
            shippingShares: { create: shares },
          },
          update: {
            ...data,
            shippingShares: { deleteMany: {}, create: shares },
          },
        });
        ruleCount += 1;
      }
    }
  }
  log(
    `commission rule set "${config.ruleSetName}" v${set.version} [${status}]: ` +
      `${ruleCount} rules over ${categories.length} categories`,
  );
}

// ───────────────────────── hesaplar ─────────────────────────

/** Adresin doğal anahtarı yok; kullanıcı + başlık ikilisini anahtar sayıyoruz. */
async function upsertAddress(
  userId: string,
  data: AddressData,
): Promise<string> {
  const existing = await prisma.address.findFirst({
    where: { userId, title: data.title },
    select: { id: true },
  });
  const fields = {
    fullName: data.fullName,
    phone: data.phone,
    city: data.city,
    district: data.district,
    address: data.address,
    zipCode: data.zipCode,
    isDefault: data.isDefault,
  };
  if (existing) {
    await prisma.address.update({ where: { id: existing.id }, data: fields });
    return existing.id;
  }
  const created = await prisma.address.create({
    data: { userId, title: data.title, ...fields },
  });
  return created.id;
}

async function seedCorporateSeller(accounts: Accounts): Promise<string> {
  const seller = accounts.corporateSeller;
  const email = (process.env.LAUNCH_SELLER_EMAIL || seller.email)
    .trim()
    .toLowerCase();
  const password = process.env.LAUNCH_SELLER_PASSWORD?.trim();
  if (!password) {
    throw new Error("LAUNCH_SELLER_PASSWORD is required");
  }
  if (password.length < 16 || Buffer.byteLength(password, "utf8") > 72) {
    throw new Error("LAUNCH_SELLER_PASSWORD must be between 16 and 72 bytes");
  }
  if (email === "platform@tarodan.com") {
    throw new Error("Platform service account cannot be the launch seller");
  }

  const passwordHash = await bcrypt.hash(password, 12);
  // `SellerType` DOĞRULAMA tipidir (individual/verified/platform), kurumsallık
  // değil. "Kurumsal" olmak `businessStatus=approved` + companyName + taxId
  // üçlüsünden türer (order-commission.helper.ts resolveCommissionSellerType);
  // BUSINESS komisyon tipi ise üyelikten gelir.
  const identity = {
    displayName: seller.displayName,
    isVerified: true,
    isEmailVerified: true,
    isSeller: true,
    sellerType: SellerType.verified,
    businessStatus: BusinessStatus.approved,
    companyName: seller.companyName,
    taxId: seller.taxId,
    taxOffice: seller.taxOffice,
    companyType: seller.companyType,
    companyCity: seller.companyCity,
    companyDistrict: seller.companyDistrict,
    phone: seller.phone,
    acceptsMarketingEmails: false,
  };
  const user = await prisma.user.upsert({
    where: { email },
    create: { email, passwordHash, ...identity },
    update: { passwordHash, ...identity, isBanned: false, deletedAt: null },
  });

  // Hesap tipi kodu kurumsalı yansıtmalı: bireysel "B" yerine "K". Numara kalıcı
  // kimliktir, yalnız önek değişir (docs/CODE_SCHEME.md).
  if (user.adminCode?.startsWith("B")) {
    await prisma.user.update({
      where: { id: user.id },
      data: { adminCode: `K${user.adminCode.slice(1)}` },
    });
  }

  // `saleCapableSellerWhere` kurumsal satıcının ürünlerini vitrinde göstermek
  // için AKTİF ve süresi dolmamış BUSINESS üyelik arar. Süre biterse satıcı
  // satış yapamaz VE bütün ilanları katalogdan düşer — bu yüzden uzun dönem.
  const businessTier = await prisma.membershipTier.findUniqueOrThrow({
    where: { type: MembershipTierType.business },
  });
  const periodStart = new Date();
  const periodEnd = new Date(periodStart);
  periodEnd.setFullYear(
    periodEnd.getFullYear() + seller.membership.periodYears,
  );
  const membership = {
    tierId: businessTier.id,
    status: SubscriptionStatus.active,
    currentPeriodStart: periodStart,
    currentPeriodEnd: periodEnd,
  };
  await prisma.userMembership.upsert({
    where: { userId: user.id },
    create: { userId: user.id, ...membership },
    update: membership,
  });

  await upsertAddress(user.id, seller.address);
  log(
    `corporate seller ${email} (${seller.companyName}), business membership until ` +
      periodEnd.toISOString().slice(0, 10),
  );
  return user.id;
}

/**
 * Depo adresi süper adminin adresidir (lansman kararı). `resolveWarehouseAddressId`
 * önce `warehouse_address_id` ayarına bakıp aktif adminin ilk adresine düşüyor;
 * ayarı açıkça yazmak, ileride ikinci bir admin eklendiğinde deponun sessizce
 * değişmesini engeller.
 */
async function seedWarehouseAddress(accounts: Accounts): Promise<void> {
  const admin = await prisma.adminUser.findFirst({
    where: { isActive: true, role: AdminRole.super_admin },
    orderBy: { createdAt: "asc" },
    select: { userId: true },
  });
  if (!admin) {
    throw new Error(
      "No active super admin found; run bootstrap-production-admin first.",
    );
  }
  await prisma.user.update({
    where: { id: admin.userId },
    data: { displayName: accounts.superAdmin.displayName },
  });
  const addressId = await upsertAddress(
    admin.userId,
    accounts.superAdmin.address,
  );
  await prisma.platformSetting.upsert({
    where: { settingKey: "warehouse_address_id" },
    create: {
      settingKey: "warehouse_address_id",
      settingValue: addressId,
      settingType: "string",
      description: "Tarodan warehouse address ID for safe-trade escrow",
    },
    update: { settingValue: addressId },
  });
  log(`warehouse address: ${accounts.superAdmin.address.city} (${addressId})`);
}

// ───────────────────────── ilanlar ─────────────────────────

async function seedProducts(sellerId: string): Promise<void> {
  const products = load<ProductData[]>("products.json");

  const categoryIds = new Map(
    (await prisma.category.findMany({ select: { id: true, slug: true } })).map(
      (row) => [row.slug, row.id],
    ),
  );
  const brandIds = new Map(
    (await prisma.brand.findMany({ select: { id: true, slug: true } })).map(
      (row) => [row.slug, row.id],
    ),
  );
  const modelIds = new Map(
    (await prisma.carModel.findMany({ select: { id: true, slug: true } })).map(
      (row) => [row.slug, row.id],
    ),
  );
  const manufacturerIds = new Map(
    (
      await prisma.manufacturer.findMany({ select: { id: true, slug: true } })
    ).map((row) => [row.slug, row.id]),
  );
  const attributeIds = new Map(
    (await prisma.attribute.findMany({ select: { id: true, slug: true } })).map(
      (row) => [row.slug, row.id],
    ),
  );

  const need = <T>(map: Map<string, T>, slug: string, what: string): T => {
    const value = map.get(slug);
    if (value === undefined) {
      throw new Error(
        `Unknown ${what} "${slug}" referenced by a launch product`,
      );
    }
    return value;
  };

  for (const item of products) {
    const slug = slugify(item.title);
    const data = {
      sellerId,
      categoryId: need(categoryIds, item.categorySlug, "category"),
      brandId: item.brandSlug ? need(brandIds, item.brandSlug, "brand") : null,
      carModelId: item.carModelSlug
        ? need(modelIds, item.carModelSlug, "car model")
        : null,
      manufacturerId: item.manufacturerSlug
        ? need(manufacturerIds, item.manufacturerSlug, "manufacturer")
        : null,
      title: item.title,
      description: item.description,
      price: item.price,
      salePrice: item.salePrice,
      condition: item.condition,
      kind: item.kind,
      status: item.status,
      isTradeEnabled: item.isTradeEnabled,
      modelCode: item.modelCode,
      color: item.color,
      isBoxed: item.isBoxed,
      isPreorder: item.isPreorder,
      isSet: item.isSet,
      bundleSize: item.bundleSize,
      quantity: item.quantity,
      releaseDate: item.releaseYear
        ? new Date(Date.UTC(item.releaseYear, 0, 1))
        : null,
      ...productShippingTierData(item.shippingPackageTier),
    };
    const product = await prisma.product.upsert({
      where: { slug },
      create: { slug, ...data },
      update: data,
    });

    await prisma.productAttribute.deleteMany({
      where: { productId: product.id },
    });
    if (item.attributeSlugs.length > 0) {
      await prisma.productAttribute.createMany({
        data: item.attributeSlugs.map((attributeSlug) => ({
          productId: product.id,
          attributeId: need(attributeIds, attributeSlug, "attribute"),
        })),
        skipDuplicates: true,
      });
    }
  }

  const byStatus = products.reduce<Record<string, number>>((acc, item) => {
    acc[item.status] = (acc[item.status] ?? 0) + 1;
    return acc;
  }, {});
  log(
    `products: ${products.length} (${Object.entries(byStatus)
      .map(([status, count]) => `${status}=${count}`)
      .join(", ")}), no images by design`,
  );
}

// ───────────────────────── main ─────────────────────────

async function main(): Promise<void> {
  assertProduction();

  const accounts = load<Accounts>("accounts.json");
  const businessConfig = load<BusinessConfig>("business-config.json");
  const commission = load<CommissionConfig>("commission.json");

  await seedBusinessConfig(businessConfig);
  await seedCatalog();
  await seedCommissionRuleSet(commission);
  const sellerId = await seedCorporateSeller(accounts);
  await seedWarehouseAddress(accounts);
  await seedProducts(sellerId);

  log("Launch data is ready.");
}

main()
  .catch((error) => {
    console.error("[launch-seed] failed.", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
