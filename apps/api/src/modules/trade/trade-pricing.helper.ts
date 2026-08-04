import {
  calculatePackageDesi,
  resolvePackageTier,
  type OutboundTariffLike,
} from "../shipping/shipping-tariff.helper";
import {
  findMatchingCommissionRule,
  type CommissionRuleMatchable,
} from "../order/order-commission.helper";

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
 * ÜCRET: her ürün kategori + ürün sahibinin satıcı tipi + takas değeriyle tek
 * CommissionRule'a düşer. Bir taraf, kendi verdiği ürünlerin takas satıcı
 * bedelini ve karşıdan aldığı ürünlerin takas alıcı bedelini öder.
 *
 * KARGO: komisyon kuralının kargo payları takasta kullanılmaz. Taraf başına iki
 * bacak (kullanıcı→depo, depo→karşı kullanıcı) aktif paket tarifesinden alınır.
 * Kademe, tarafın ürünlerinin birleşik desisinden çözülür.
 *
 * EKRANDA hizmet bedeli TEK satır gösterilir; `feeLines` yalnız denetim/döküm
 * içindir.
 */

export type TradeSide = "initiator" | "receiver";

/** Normal komisyon kuralının takasta kullanılan iki sabit ücret alanı. */
export interface TradeCommissionRule extends CommissionRuleMatchable {
  /** Ürünü takasta VEREN tarafın ödediği sabit (₺, KDV dahil). */
  tradeFeeSellerAmount: number | string | { toString(): string };
  /** Ürünü takasta ALAN tarafın ödediği sabit (₺, KDV dahil). */
  tradeFeeBuyerAmount: number | string | { toString(): string };
}

export interface TradePricingItem {
  productId: string;
  side: TradeSide;
  categoryId: string | null;
  sellerType: CommissionRuleMatchable["sellerType"];
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

/** Ürün değerine göre tam olarak eşleşen komisyon kuralının denetim izi. */
export interface TradeRuleMatch {
  productId: string;
  side: TradeSide;
  ruleId: string;
  ruleSetId: string;
  ruleName: string;
  categoryId: string;
  sellerType: CommissionRuleMatchable["sellerType"];
  matchedAmount: number;
  minAmount: number;
  maxAmount: number | null;
  tradeFeeSellerAmount: number;
  tradeFeeBuyerAmount: number;
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
  rules: TradeCommissionRule[];
  tariff: TradeTariff;
  cash?: { amount: number; payerSide: TradeSide } | null;
}

export interface TradePricing {
  initiator: TradePartyPricing;
  receiver: TradePartyPricing;
  ruleMatches: TradeRuleMatch[];
}

/** Kargo bacağı sayısı: kullanıcı→depo + depo→karşı kullanıcı. */
export const TRADE_SHIPPING_LEGS = 2;

const round2 = (value: number): number =>
  Math.round((value + Number.EPSILON) * 100) / 100;

const amountOf = (value: number | string | { toString(): string }): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`Invalid trade fee amount: ${String(value)}`);
  }
  return parsed;
};

const other = (side: TradeSide): TradeSide =>
  side === "initiator" ? "receiver" : "initiator";

/**
 * Satışla aynı strict eşleşme kullanılır; wildcard, priority veya fallback yoktur.
 */
function matchRule(
  rules: TradeCommissionRule[],
  item: TradePricingItem,
): TradeCommissionRule {
  return findMatchingCommissionRule(rules, {
    categoryId: item.categoryId ?? "",
    sellerType: item.sellerType,
    amount: item.value,
  });
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
  matchedItems: Array<{
    item: TradePricingItem;
    rule: TradeCommissionRule;
  }>,
): TradePartyPricing {
  const ownItems = matchedItems.filter(({ item }) => item.side === side);
  const incomingItems = matchedItems.filter(
    ({ item }) => item.side === other(side),
  );

  // Kendi verdiği ürünler → satıcı ücreti; karşıdan aldıkları → alıcı ücreti.
  const feeLines: TradeFeeLine[] = [
    ...ownItems.map(({ item, rule }) => ({
      productId: item.productId,
      role: "seller" as const,
      amount: amountOf(rule.tradeFeeSellerAmount),
    })),
    ...incomingItems.map(({ item, rule }) => ({
      productId: item.productId,
      role: "buyer" as const,
      amount: amountOf(rule.tradeFeeBuyerAmount),
    })),
  ];

  const serviceFee = round2(
    feeLines.reduce((total, line) => total + line.amount, 0),
  );
  const shipping = shippingFor(
    ownItems.map(({ item }) => item),
    input.tariff,
  );
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
  // Eşleşmeyi ürün başına bir kez yap. Ücretler ve denetim snapshot'ı aynı
  // sonuçtan türesin; iki ayrı çözümleme yolu zamanla birbirinden sapmasın.
  const matchedItems = input.items.map((item) => ({
    item,
    rule: matchRule(input.rules, item),
  }));
  return {
    initiator: partyPricing("initiator", input, matchedItems),
    receiver: partyPricing("receiver", input, matchedItems),
    ruleMatches: matchedItems.map(({ item, rule }) => ({
      productId: item.productId,
      side: item.side,
      ruleId: rule.id,
      ruleSetId: rule.ruleSetId,
      ruleName: rule.name,
      categoryId: rule.categoryId,
      sellerType: rule.sellerType,
      matchedAmount: item.value,
      minAmount: Number(rule.minAmount),
      maxAmount: rule.maxAmount == null ? null : Number(rule.maxAmount),
      tradeFeeSellerAmount: amountOf(rule.tradeFeeSellerAmount),
      tradeFeeBuyerAmount: amountOf(rule.tradeFeeBuyerAmount),
    })),
  };
}
