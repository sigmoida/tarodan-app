import { CommissionSellerType, CommissionTaxpayerType } from "@prisma/client";
import { findMatchingCommissionRule } from "../order/order-commission.helper";
import {
  calculatePackageDesi,
  resolvePackageTier,
  type OutboundTariffLike,
} from "../shipping/shipping-tariff.helper";

/** Takas yalnız kademeleri kullanır: ücretsiz-kargo eşiği takasta uygulanmaz. */
type TradeTariff = Pick<OutboundTariffLike, "packageTiers">;

/**
 * TAKAS FİYATLAMA (v2) — TEK kaynak.
 *
 * Eski model bir ARACILIK KOMİSYONUYDU: yalnız nakit farkı varsa, yalnız farkı
 * ödeyen taraftan farkın yüzdesi alınırdı. Kafa kafaya takasta platform hiçbir
 * gelir elde etmezken dört kargo bacağının maliyetini üstleniyordu.
 *
 * Yeni model — HER İKİ taraf kendi ödemesini yapar:
 *
 *   takas hizmet bedeli + (2 × kargo) + (fark ödeyense fark)
 *
 * ÜCRET: ürün başına komisyon kuralından okunur ve TOPLANIR. Bir taraf, KENDİ
 * verdiği ürünlerin "satıcı" ücretini + KARŞIDAN aldığı ürünlerin "alıcı"
 * ücretini öder. Tutarlar admin'in girdiği KDV DAHİL sabitlerdir: burada oran
 * ya da KDV hesabı YAPILMAZ (sipariş ücretlerinden bilinçli fark — bkz.
 * `order-breakdown.ts`, orada matrah + KDV ayrıdır).
 *
 * KARGO: taraf başına 2 bacak (kullanıcı→depo, depo→karşı kullanıcı). Kademe,
 * tarafın ürünlerinin BİRLEŞİK desisinden çözülür — siparişlerdeki paket
 * mantığının aynısı (`calculatePackageDesi` + `resolvePackageTier`).
 *
 * EKRANDA hizmet bedeli TEK satır gösterilir; `feeLines` yalnız denetim/döküm
 * içindir.
 */

export type TradeSide = "initiator" | "receiver";

/** Kuralın takas için okunan alanları (eşleşme eksenleri + iki sabit ücret). */
export interface TradeFeeRule {
  id: string;
  categoryId: string | null;
  sellerType: CommissionSellerType | null;
  taxpayerType: CommissionTaxpayerType | null;
  minAmount?: number | string | { toString(): string } | null;
  maxAmount?: number | string | { toString(): string } | null;
  appliesTo?: unknown;
  priority?: number;
  /** Ürünü takasta VEREN tarafın ödediği sabit (₺, KDV dahil). */
  tradeFeeSellerAmount?: number | string | { toString(): string } | null;
  /** Ürünü takasta ALAN tarafın ödediği sabit (₺, KDV dahil). */
  tradeFeeBuyerAmount?: number | string | { toString(): string } | null;
}

export interface TradePricingItem {
  productId: string;
  side: TradeSide;
  categoryId: string | null;
  /** Ürünün takastaki değeri — kuralın tutar aralığı bununla eşleşir. */
  value: number;
  quantity: number;
  shippingDesi: number;
}

export interface TradeFeeLine {
  productId: string;
  /** `seller`: bu ürünü veren taraf; `buyer`: alan taraf. */
  role: "seller" | "buyer";
  amount: number;
}

export interface TradePartyPricing {
  /** Ürün başına ücretlerin toplamı — ekranda TEK satır. */
  serviceFee: number;
  /** 2 × kademe tutarı. */
  shipping: number;
  /** Yalnız farkı ödeyen tarafta > 0. */
  cashDifference: number;
  total: number;
  feeLines: TradeFeeLine[];
}

export interface TradePricingInput {
  items: TradePricingItem[];
  rules: TradeFeeRule[];
  tariff: TradeTariff;
  cash?: { amount: number; payerSide: TradeSide } | null;
}

export interface TradePricing {
  initiator: TradePartyPricing;
  receiver: TradePartyPricing;
}

/** Kargo bacağı sayısı: kullanıcı→depo + depo→karşı kullanıcı. */
export const TRADE_SHIPPING_LEGS = 2;

const round2 = (value: number): number =>
  Math.round((value + Number.EPSILON) * 100) / 100;

const amountOf = (
  value: number | string | { toString(): string } | null | undefined,
): number => {
  if (value == null) return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
};

const other = (side: TradeSide): TradeSide =>
  side === "initiator" ? "receiver" : "initiator";

/**
 * Bir ürüne uygulanacak kural. Eksenler siparişlerle AYNI motordan çözülür
 * (kategori özgüllüğü, tutar aralığı, priority); fark: takasta taraflar
 * alıcı/satıcı HESABI değildir, bu yüzden satıcı tipi ve mükellefiyet eksenleri
 * joker geçilir — yalnız bu eksenlerde joker olan kurallar eşleşir.
 */
function matchRule(
  rules: TradeFeeRule[],
  item: TradePricingItem,
): TradeFeeRule | null {
  return findMatchingCommissionRule(rules as never, {
    categoryId: item.categoryId,
    sellerType: CommissionSellerType.ALL,
    taxpayerType: CommissionTaxpayerType.all,
    amount: item.value,
  }) as TradeFeeRule | null;
}

/** Tarafın 2 bacaklık kargo bedeli — ürünlerinin birleşik desisinden. */
function shippingFor(items: TradePricingItem[], tariff: TradeTariff): number {
  if (items.length === 0) return 0;
  const desi = calculatePackageDesi(
    items.map((i) => ({ shippingDesi: i.shippingDesi, quantity: i.quantity })),
  );
  const tier = resolvePackageTier(tariff, desi);
  return round2(Number(tier.amount) * TRADE_SHIPPING_LEGS);
}

function partyPricing(
  side: TradeSide,
  input: TradePricingInput,
): TradePartyPricing {
  const ownItems = input.items.filter((i) => i.side === side);
  const incomingItems = input.items.filter((i) => i.side === other(side));

  // Kendi verdiği ürünler → satıcı ücreti; karşıdan aldıkları → alıcı ücreti.
  const feeLines: TradeFeeLine[] = [
    ...ownItems.map((i) => ({
      productId: i.productId,
      role: "seller" as const,
      amount: amountOf(matchRule(input.rules, i)?.tradeFeeSellerAmount),
    })),
    ...incomingItems.map((i) => ({
      productId: i.productId,
      role: "buyer" as const,
      amount: amountOf(matchRule(input.rules, i)?.tradeFeeBuyerAmount),
    })),
  ];

  const serviceFee = round2(
    feeLines.reduce((total, line) => total + line.amount, 0),
  );
  const shipping = shippingFor(ownItems, input.tariff);
  const cashDifference =
    input.cash && input.cash.payerSide === side
      ? round2(Math.abs(input.cash.amount))
      : 0;

  return {
    serviceFee,
    shipping,
    cashDifference,
    total: round2(serviceFee + shipping + cashDifference),
    feeLines,
  };
}

export function buildTradePricing(input: TradePricingInput): TradePricing {
  return {
    initiator: partyPricing("initiator", input),
    receiver: partyPricing("receiver", input),
  };
}
