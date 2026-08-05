import { CommissionSellerType, ShippingPackageTierCode } from "@prisma/client";

/**
 * DEMO (yerel + staging) senaryosunun rakamları. Buradaki hiçbir değer canlıya
 * gitmez: lansman/production tarafı `prisma/data/launch/*.json`'dan okur.
 *
 * Bu dosya eskiden `seed-config.ts` adıyla iki tarafın ORTAK config'iydi ve
 * `seed-production.ts` komisyon oranlarını buradan alıyordu — yani yerel "Araba"
 * senaryosu için yazılmış oranlar canlıda her kategoriye ACTIVE olarak
 * yayınlanıyordu. `seed-independence.spec.ts` bu bağın geri kurulmasını engeller.
 */

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
  buyerCommissionMin: number | null;
  buyerCommissionMax: number | null;
  buyerServiceFeeRate: number;
  buyerServiceFeeMin: number | null;
  buyerServiceFeeMax: number | null;
  sellerCommissionRate: number;
  sellerCommissionMin: number | null;
  sellerCommissionMax: number | null;
  sellerPlatformFeeRate: number;
  sellerPlatformFeeMin: number | null;
  sellerPlatformFeeMax: number | null;
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

const SELLER_COMMISSION_CONFIGS = [
  {
    key: "free",
    label: "Free",
    sellerType: CommissionSellerType.FREE,
  },
  {
    key: "basic",
    label: "Basic",
    sellerType: CommissionSellerType.BASIC,
  },
  {
    key: "premium",
    label: "Premium",
    sellerType: CommissionSellerType.PREMIUM,
  },
  {
    key: "business",
    label: "İşletme",
    sellerType: CommissionSellerType.BUSINESS,
  },
] as const;

const BUYER_COMMISSION_RATES = [4, 4, 3, 0] as const;
const BUYER_SERVICE_FEE_RATES = [5, 6, 4, 5] as const;
const SELLER_COMMISSION_RATES = [6, 6, 6, 6] as const;
const SELLER_PLATFORM_FEE_RATES = [5, 5, 5, 0] as const;
const EQUAL_SHIPPING_SHARES = { small: 50, medium: 50, large: 50 } as const;
const TRADE_FEE_PER_SIDE = 100;

/**
 * Yerel Araba kategorisi için dört satıcı tipi × dört fiyat bandı. Her satıcı
 * tipi 0'dan sonsuza kadar tam, bitişik ve çakışmasız kapsanır.
 */
export const SEED_COMMISSION_PROFILES: SeedCommissionProfile[] =
  SELLER_COMMISSION_CONFIGS.flatMap((seller) =>
    SEED_COMMISSION_PRICE_BANDS.map((band, index) => ({
      key: `${seller.key}-${band.key}`,
      label: `${seller.label} / ${band.label}`,
      sellerType: seller.sellerType,
      minAmount: band.minAmount,
      maxAmount: band.maxAmount,
      buyerCommissionRate: BUYER_COMMISSION_RATES[index],
      buyerCommissionMin: null,
      buyerCommissionMax: null,
      buyerServiceFeeRate: BUYER_SERVICE_FEE_RATES[index],
      buyerServiceFeeMin: null,
      buyerServiceFeeMax: null,
      sellerCommissionRate: SELLER_COMMISSION_RATES[index],
      sellerCommissionMin: null,
      sellerCommissionMax: null,
      sellerPlatformFeeRate: SELLER_PLATFORM_FEE_RATES[index],
      sellerPlatformFeeMin: null,
      sellerPlatformFeeMax: null,
      tradeFeeSellerAmount: TRADE_FEE_PER_SIDE,
      tradeFeeBuyerAmount: TRADE_FEE_PER_SIDE,
      shippingShares: EQUAL_SHIPPING_SHARES,
    })),
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
