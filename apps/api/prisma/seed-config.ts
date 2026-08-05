import { CommissionSellerType, ShippingPackageTierCode } from "@prisma/client";

/**
 * Seeded rule-set ids still obey the schema/API UUID-v4 contract. Keeping them
 * deterministic preserves idempotent upserts without weakening checkout DTO
 * validation to accept arbitrary strings.
 */
export const SEED_COMMISSION_RULE_SET_IDS = {
  local: "8d9fe2c4-a82e-4fc2-8b6d-5a4d1e9f1001",
  production: "8d9fe2c4-a82e-4fc2-8b6d-5a4d1e9f1002",
  test: "8d9fe2c4-a82e-4fc2-8b6d-5a4d1e9f1003",
} as const;

/** Comprehensive local seed intentionally exposes a single marketplace category. */
export const SEED_CATEGORY_DEFINITIONS = [
  {
    name: "Araba",
    slug: "araba",
    description: "Binek ve spor arabalar",
    sortOrder: 1,
  },
] as const;

export type SeedCommissionProfile = {
  key: string;
  label: string;
  sellerType: CommissionSellerType;
  minAmount: number;
  maxAmount: number | null;
  buyerCommissionRate: number;
  buyerCommissionMin: number;
  buyerCommissionMax: number;
  buyerServiceFeeRate: number;
  buyerServiceFeeMin: number;
  buyerServiceFeeMax: number;
  sellerCommissionRate: number;
  sellerCommissionMin: number;
  sellerCommissionMax: number;
  sellerPlatformFeeRate: number;
  sellerPlatformFeeMin: number;
  sellerPlatformFeeMax: number;
  tradeFeeSellerAmount: number;
  tradeFeeBuyerAmount: number;
  shippingShares: Record<ShippingPackageTierCode, number>;
};

/** Üst sınırlar runtime eşleştiricisiyle aynı biçimde hariçtir: [min, max). */
export const SEED_COMMISSION_PRICE_BANDS = [
  {
    key: "0-999",
    label: "0-999 TL",
    minAmount: 0,
    maxAmount: 1_000,
    sample: 499,
  },
  {
    key: "1000-9999",
    label: "1.000-9.999 TL",
    minAmount: 1_000,
    maxAmount: 10_000,
    sample: 4_999,
  },
  {
    key: "10000-24999",
    label: "10.000-24.999 TL",
    minAmount: 10_000,
    maxAmount: 25_000,
    sample: 14_999,
  },
  {
    key: "25000-plus",
    label: "25.000 TL ve üzeri",
    minAmount: 25_000,
    maxAmount: null,
    sample: 34_999,
  },
] as const;

const BAND_FEE_LIMITS = [
  {
    buyerCommission: [1, 10],
    buyerService: [2, 20],
    sellerCommission: [3, 60],
    sellerPlatform: [1, 15],
  },
  {
    buyerCommission: [4, 40],
    buyerService: [8, 80],
    sellerCommission: [50, 550],
    sellerPlatform: [8, 80],
  },
  {
    buyerCommission: [15, 100],
    buyerService: [30, 200],
    sellerCommission: [250, 1_250],
    sellerPlatform: [25, 250],
  },
  {
    buyerCommission: [30, 250],
    buyerService: [60, 500],
    sellerCommission: [600, 3_000],
    sellerPlatform: [50, 500],
  },
] as const;

const SELLER_COMMISSION_CONFIGS = [
  {
    key: "free",
    label: "Free",
    sellerType: CommissionSellerType.FREE,
    feeFactor: 1,
    buyerCommissionRates: [0.5, 0.4, 0.3, 0.2],
    buyerServiceRates: [1, 0.8, 0.6, 0.4],
    sellerCommissionRates: [6, 5.5, 5, 4.5],
    sellerPlatformRates: [1, 0.8, 0.6, 0.4],
    tradeFees: [20, 25, 30, 35],
    shippingShares: { small: 100, medium: 90, large: 80 },
  },
  {
    key: "basic",
    label: "Basic",
    sellerType: CommissionSellerType.BASIC,
    feeFactor: 0.85,
    buyerCommissionRates: [0.4, 0.3, 0.25, 0.15],
    buyerServiceRates: [0.8, 0.6, 0.5, 0.3],
    sellerCommissionRates: [5, 4.5, 4, 3.5],
    sellerPlatformRates: [0.75, 0.6, 0.5, 0.3],
    tradeFees: [18, 22, 27, 32],
    shippingShares: { small: 90, medium: 80, large: 70 },
  },
  {
    key: "premium",
    label: "Premium",
    sellerType: CommissionSellerType.PREMIUM,
    feeFactor: 0.65,
    buyerCommissionRates: [0.25, 0.2, 0.15, 0.1],
    buyerServiceRates: [0.5, 0.4, 0.3, 0.2],
    sellerCommissionRates: [3.5, 3.25, 3, 2.75],
    sellerPlatformRates: [0.4, 0.35, 0.3, 0.2],
    tradeFees: [15, 20, 25, 30],
    shippingShares: { small: 70, medium: 60, large: 50 },
  },
  {
    key: "business",
    label: "İşletme",
    sellerType: CommissionSellerType.BUSINESS,
    feeFactor: 0.5,
    buyerCommissionRates: [0.15, 0.12, 0.1, 0.08],
    buyerServiceRates: [0.3, 0.25, 0.2, 0.15],
    sellerCommissionRates: [2.5, 2.25, 2, 1.75],
    sellerPlatformRates: [0.25, 0.22, 0.2, 0.15],
    tradeFees: [12, 16, 20, 25],
    shippingShares: { small: 50, medium: 40, large: 30 },
  },
] as const;

const scaledMoney = (value: number, factor: number): number =>
  Math.round(value * factor * 100) / 100;

/**
 * Yerel Araba kategorisi için dört satıcı tipi × dört fiyat bandı. Her satıcı
 * tipi 0'dan sonsuza kadar tam, bitişik ve çakışmasız kapsanır.
 */
export const SEED_COMMISSION_PROFILES: SeedCommissionProfile[] =
  SELLER_COMMISSION_CONFIGS.flatMap((seller) =>
    SEED_COMMISSION_PRICE_BANDS.map((band, index) => {
      const limits = BAND_FEE_LIMITS[index];
      const scale = (pair: readonly [number, number]) =>
        pair.map((value) => scaledMoney(value, seller.feeFactor)) as [
          number,
          number,
        ];
      const [buyerCommissionMin, buyerCommissionMax] = scale(
        limits.buyerCommission,
      );
      const [buyerServiceFeeMin, buyerServiceFeeMax] = scale(
        limits.buyerService,
      );
      const [sellerCommissionMin, sellerCommissionMax] = scale(
        limits.sellerCommission,
      );
      const [sellerPlatformFeeMin, sellerPlatformFeeMax] = scale(
        limits.sellerPlatform,
      );

      return {
        key: `${seller.key}-${band.key}`,
        label: `${seller.label} / ${band.label}`,
        sellerType: seller.sellerType,
        minAmount: band.minAmount,
        maxAmount: band.maxAmount,
        buyerCommissionRate: seller.buyerCommissionRates[index],
        buyerCommissionMin,
        buyerCommissionMax,
        buyerServiceFeeRate: seller.buyerServiceRates[index],
        buyerServiceFeeMin,
        buyerServiceFeeMax,
        sellerCommissionRate: seller.sellerCommissionRates[index],
        sellerCommissionMin,
        sellerCommissionMax,
        sellerPlatformFeeRate: seller.sellerPlatformRates[index],
        sellerPlatformFeeMin,
        sellerPlatformFeeMax,
        tradeFeeSellerAmount: seller.tradeFees[index],
        tradeFeeBuyerAmount: seller.tradeFees[index],
        shippingShares: seller.shippingShares,
      };
    }),
  );

export const SEED_SHIPPING_TIERS = [
  {
    code: ShippingPackageTierCode.small,
    label: "Kucuk Paket",
    minDesi: 0,
    maxDesi: 2,
    amount: 100,
    sampleWidth: 20,
    sampleHeight: 10,
    sampleLength: 25,
    sortOrder: 0,
  },
  {
    code: ShippingPackageTierCode.medium,
    label: "Orta Paket",
    minDesi: 2,
    maxDesi: 5,
    amount: 130,
    sampleWidth: 35,
    sampleHeight: 20,
    sampleLength: 45,
    sortOrder: 1,
  },
  {
    code: ShippingPackageTierCode.large,
    label: "Buyuk Paket",
    minDesi: 5,
    maxDesi: null,
    amount: 160,
    sampleWidth: 60,
    sampleHeight: 40,
    sampleLength: 70,
    sortOrder: 2,
  },
] as const;
