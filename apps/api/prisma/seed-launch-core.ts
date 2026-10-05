/**
 * Lansman (production) ve UAT (staging) seed'lerinin PAYLAŞTIĞI parçalar:
 * iş değerleri, katalog, komisyon kural seti, depo adresi ve ilan yazımı.
 *
 * `seed-launch.ts` ve `seed-uat.ts` bunları çağırır; ikisi de aynı veri
 * dosyalarını (`data/launch/*.json`) okur, yani referans verinin tek kaynağı
 * budur. Bu dosya yan etkisizdir (import edince hiçbir şey çalışmaz) ve
 * `PrismaClient`'ı çağıranın verdiği örnekten alır. Demo seed'ine bağlanmaz —
 * `src/common/helpers/seed-independence.spec.ts` bunu CI'da doğrular.
 */
import {
  AdminRole,
  CommissionRuleSetStatus,
  CommissionSellerType,
  MembershipTierType,
  Prisma,
  PrismaClient,
  ProductCondition,
  ProductKind,
  ProductStatus,
  ShippingPackageTierCode,
  ShippingTariffStatus,
} from "@prisma/client";
import { readFileSync } from "fs";
import { join } from "path";
import { productShippingTierData } from "../src/modules/product/helpers/product-shipping-tier.helper";
import {
  PRODUCTION_REFERENCE_IDS,
  SEED_COMMISSION_RULE_SET_IDS,
} from "./seed-ids";
import {
  COLOR_GROUP_SLUG,
  COLOR_LABEL_SEPARATOR,
  resolveColorsFromText,
} from "../src/common/helpers/attribute-groups";

// ts-node'da `prisma/`, derlenmişte `dist-seed/prisma/` — build:seed veriyi
// ikisinde de aynı göreli yola kopyalar.
export const loadJson = <T>(dir: string, file: string): T =>
  JSON.parse(readFileSync(join(__dirname, "data", dir, file), "utf8")) as T;

/** Lansman veri dosyalarını okur (`prisma/data/launch/`). */
export const load = <T>(file: string): T => loadJson<T>("launch", file);

export const log = (message: string) =>
  console.log(`[launch-seed] ${message}`);

/** Veri dosyalarındakiyle AYNI kural — slug'lar orada üretilmişti. */
export const slugify = (value: string): string =>
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

export interface AddressData {
  title: string;
  fullName: string;
  phone: string;
  city: string;
  district: string;
  address: string;
  zipCode: string | null;
  isDefault: boolean;
}

export interface Accounts {
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

export interface BusinessConfig {
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

export interface CommissionConfig {
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

export interface ProductData {
  ref: string;
  /** Verilmezse slug başlıktan türetilir (lansman ilanları böyle). */
  slug?: string;
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

// ───────────────────────── iş değerleri ─────────────────────────

export async function seedBusinessConfig(
  prisma: PrismaClient,
  config: BusinessConfig,
): Promise<void> {
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

export interface CategoryData {
  name: string;
  slug: string;
  description: string | null;
  sortOrder: number;
  isActive: boolean;
  parentSlug: string | null;
}
export interface BrandData {
  name: string;
  slug: string;
  country: string | null;
  foundedYear: number | null;
  website: string | null;
  description: string | null;
  sortOrder: number;
  isActive: boolean;
}
export interface CarModelData {
  brandSlug: string;
  name: string;
  slug: string;
  yearStart: number | null;
  yearEnd: number | null;
  sortOrder: number;
  isActive: boolean;
}
export interface AttributeGroupData {
  name: string;
  slug: string;
  isRequired: boolean;
  sortOrder: number;
  isActive: boolean;
  values: Array<{
    value: string;
    slug: string;
    displayValue: string | null;
    /** Renk grubunda swatch hex'i; diğer gruplarda yok. */
    color?: string | null;
    sortOrder: number;
    isActive: boolean;
  }>;
}

export async function seedCatalog(prisma: PrismaClient): Promise<void> {
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
        // Renk grubu swatch için hex taşır; diğer gruplarda alan boştur.
        color: value.color ?? null,
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

export async function seedCommissionRuleSet(
  prisma: PrismaClient,
  config: CommissionConfig,
): Promise<void> {
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

/** Adresin doğal anahtarı yok; kullanıcı + başlık ikilisini anahtar sayıyoruz. */
export async function upsertAddress(
  prisma: PrismaClient,
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

/**
 * Depo adresi süper adminin adresidir (lansman kararı). `resolveWarehouseAddressId`
 * önce `warehouse_address_id` ayarına bakıp aktif adminin ilk adresine düşüyor;
 * ayarı açıkça yazmak, ileride ikinci bir admin eklendiğinde deponun sessizce
 * değişmesini engeller.
 *
 * `renameAdmin`: lansman seed'i admin görünen adını da `accounts.json`'daki
 * değere çeker; UAT'te adminler gerçek kişilerdir, adlarına dokunulmaz.
 */
export async function seedWarehouseAddress(
  prisma: PrismaClient,
  accounts: Accounts,
  options: { renameAdmin: boolean },
): Promise<void> {
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
  if (options.renameAdmin) {
    await prisma.user.update({
      where: { id: admin.userId },
      data: { displayName: accounts.superAdmin.displayName },
    });
  }
  const addressId = await upsertAddress(
    prisma,
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

/** Katalog satırlarının slug → id eşlemeleri; ilan yazımında bir kez yüklenir. */
export interface ProductLookups {
  categoryIds: Map<string, string>;
  brandIds: Map<string, string>;
  modelIds: Map<string, string>;
  manufacturerIds: Map<string, string>;
  attributeIds: Map<string, string>;
  /** Renk, ilan verisinde serbest metindir; katalog renk seçenekleriyle eşleşir. */
  colorOptions: Array<{ slug: string; label: string }>;
}

export async function loadProductLookups(
  prisma: PrismaClient,
): Promise<ProductLookups> {
  const select = { id: true, slug: true } as const;
  const idsBySlug = (rows: Array<{ id: string; slug: string }>) =>
    new Map(rows.map((row) => [row.slug, row.id]));

  // Renk, ilan verisinde serbest metindir ("Altın/Kahverengi"); katalogdaki
  // renk seçenekleriyle eşleştirilip ProductAttribute olarak da bağlanır ki
  // renk filtresi seed verisini kapsasın.
  const colorOptions = (
    await prisma.attribute.findMany({
      where: { isActive: true, group: { slug: COLOR_GROUP_SLUG } },
      select: { slug: true, value: true, displayValue: true },
    })
  ).map((row) => ({ slug: row.slug, label: row.displayValue || row.value }));

  return {
    categoryIds: idsBySlug(await prisma.category.findMany({ select })),
    brandIds: idsBySlug(await prisma.brand.findMany({ select })),
    modelIds: idsBySlug(await prisma.carModel.findMany({ select })),
    manufacturerIds: idsBySlug(await prisma.manufacturer.findMany({ select })),
    attributeIds: idsBySlug(await prisma.attribute.findMany({ select })),
    colorOptions,
  };
}

const need = (map: Map<string, string>, slug: string, what: string): string => {
  const value = map.get(slug);
  if (value === undefined) {
    throw new Error(`Unknown ${what} "${slug}" referenced by a seed product`);
  }
  return value;
};

/** İlanın slug'ı: açıkça verilmişse o, yoksa başlıktan (lansman davranışı). */
export const productSlug = (item: ProductData): string =>
  item.slug ?? slugify(item.title);

/** Tek ilanı doğal anahtarı (slug) üzerinden upsert eder; özellikleri yeniden yazar. */
export async function upsertSeedProduct(
  prisma: PrismaClient,
  lookups: ProductLookups,
  sellerId: string,
  item: ProductData,
): Promise<void> {
  const slug = productSlug(item);
  const resolvedColors = item.color
    ? resolveColorsFromText(item.color, lookups.colorOptions)
    : { slugs: [], labels: [], unmatched: [] };
  const data = {
    sellerId,
    categoryId: need(lookups.categoryIds, item.categorySlug, "category"),
    brandId: item.brandSlug
      ? need(lookups.brandIds, item.brandSlug, "brand")
      : null,
    carModelId: item.carModelSlug
      ? need(lookups.modelIds, item.carModelSlug, "car model")
      : null,
    manufacturerId: item.manufacturerSlug
      ? need(lookups.manufacturerIds, item.manufacturerSlug, "manufacturer")
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
    // Tümü eşleştiyse kanonik adlar yazılır; eşleşmeyen varsa özgün metin
    // korunur (bilgi kaybolmasın).
    color:
      resolvedColors.labels.length && !resolvedColors.unmatched.length
        ? resolvedColors.labels.join(COLOR_LABEL_SEPARATOR)
        : item.color,
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
  const productAttributeSlugs = [
    ...new Set([...item.attributeSlugs, ...resolvedColors.slugs]),
  ];
  if (productAttributeSlugs.length > 0) {
    await prisma.productAttribute.createMany({
      data: productAttributeSlugs.map((attributeSlug) => ({
        productId: product.id,
        attributeId: need(lookups.attributeIds, attributeSlug, "attribute"),
      })),
      skipDuplicates: true,
    });
  }
}
