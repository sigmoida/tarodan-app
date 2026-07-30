import { Prisma } from "@prisma/client";

/**
 * Pure shipping-tariff math — the SINGLE source both the checkout pricing path and
 * the admin preview use, so a displayed quote can never diverge from what is charged.
 * All money is Decimal; the caller rounds once at the package level.
 */

const D = Prisma.Decimal;
type DecimalLike = Prisma.Decimal | number | string;

export interface OutboundTariffLike {
  provider?: string;
  outboundPackageFee: DecimalLike;
  freeShippingEnabled: boolean;
  freeShippingThreshold: DecimalLike;
  rates?: Array<{
    desi: number;
    amount: DecimalLike;
  }>;
}

export class ShippingDesiRateNotFoundError extends Error {
  constructor(desi: number) {
    super(`Active shipping tariff has no rate for ${desi} desi.`);
    this.name = "ShippingDesiRateNotFoundError";
  }
}

/**
 * Amount for a package's billable desi.
 *
 * An exact admin-defined row always wins. A missing row must NOT block checkout:
 * package desi is the sum of `shippingDesi × quantity` over the package's lines
 * and products allow a desi up to 1000, so the reachable desi set easily exceeds
 * the configured rows (4 items of desi 3 → 12). Requiring an exact match made the
 * whole cart unpurchasable with a 503. Resolution order, never undercharging:
 *
 *  1. exact row
 *  2. gap inside the table → the next HIGHER row (standard carrier bracketing)
 *  3. below the smallest row → the smallest row
 *  4. above the largest row → largest row + the tariff's own marginal step per
 *     extra desi (derived from the two largest rows; a single-row tariff uses its
 *     amount-per-desi)
 *
 * An empty rate table is still a hard configuration error and fails closed.
 */
export function shippingAmountForDesi(
  tariff: OutboundTariffLike,
  billableDesi: number,
): Prisma.Decimal {
  const rates = [...(tariff.rates ?? [])].sort((a, b) => a.desi - b.desi);
  if (rates.length === 0) throw new ShippingDesiRateNotFoundError(billableDesi);

  const exact = rates.find((row) => row.desi === billableDesi);
  if (exact) return new D(exact.amount);

  const nextHigher = rates.find((row) => row.desi > billableDesi);
  if (nextHigher) return new D(nextHigher.amount);

  const highest = rates[rates.length - 1];
  const extraDesi = billableDesi - highest.desi;
  const marginalStep =
    rates.length >= 2
      ? new D(highest.amount)
          .sub(new D(rates[rates.length - 2].amount))
          .div(highest.desi - rates[rates.length - 2].desi)
      : new D(highest.amount).div(highest.desi);
  return new D(highest.amount)
    .add(marginalStep.mul(extraDesi))
    .toDecimalPlaces(2);
}

export function calculatePackageDesi(
  lines: Array<{ shippingDesi: number; quantity: number }>,
): number {
  return lines.reduce((total, line) => {
    const desi = Number.isInteger(line.shippingDesi)
      ? Math.max(1, line.shippingDesi)
      : 1;
    const quantity = Number.isInteger(line.quantity)
      ? Math.max(1, line.quantity)
      : 1;
    return total + desi * quantity;
  }, 0);
}

/**
 * Full outbound shipping for ONE seller package at a given package subtotal.
 * Free when free-shipping is enabled and the subtotal reaches the threshold,
 * otherwise the exact admin-managed desi amount. Missing rows fail closed.
 */
export function outboundPackageShipping(
  tariff: OutboundTariffLike,
  subtotal: DecimalLike,
  billableDesi = 1,
): Prisma.Decimal {
  const sub = new D(subtotal);
  if (
    tariff.freeShippingEnabled &&
    sub.gte(new D(tariff.freeShippingThreshold))
  ) {
    return new D(0);
  }
  return shippingAmountForDesi(tariff, billableDesi);
}

/** Kargo payı her zaman 0–100 aralığında yorumlanır; tanımsız pay = alıcı öder. */
const DEFAULT_SHIPPING_BUYER_SHARE = 100;
const clampShare = (share: number) => Math.min(100, Math.max(0, share));

/**
 * Bir satıcı paketindeki satırların kargo paylarını TEK pakete indirger.
 *
 * Kargo, satıcı paketi başına bir kez tahsil edilir; ancak paketin satırları
 * farklı kategorilere (dolayısıyla farklı `shippingBuyerShare` taşıyan komisyon
 * kurallarına) düşebilir. Önizleme "son satır", tahsilat "ilk satır" payını
 * kullandığı için alıcı gösterilenden farklı ödeyebiliyordu. İndirgeme satır
 * sırasından BAĞIMSIZ olmalı: en düşük pay uygulanır — böylece alıcı, sepetinde
 * gördüğü sübvansiyonlu kalemin vaadinden daha fazlasını asla ödemez.
 */
export function resolvePackageShippingBuyerShare(
  shares: Array<number | null | undefined>,
): number {
  const valid = shares
    .filter((share): share is number => share != null && Number.isFinite(share))
    .map(clampShare);
  return valid.length ? Math.min(...valid) : DEFAULT_SHIPPING_BUYER_SHARE;
}

/**
 * Kargo tutarını alıcı/satıcı paylarına böler. Kuruş yuvarlaması alıcı tarafında
 * yapılır ve satıcı payı kalandan türetilir; böylece buyer + seller HER ZAMAN
 * tam kargoya eşittir (yuvarlama kaçağı olmaz). Quote, direct, guest ve grup
 * yolları bu tek fonksiyonu kullanır.
 */
export function splitShippingByBuyerShare(
  fullShipping: number,
  buyerShare: number | null | undefined,
): { buyer: number; seller: number } {
  const share = clampShare(
    buyerShare == null || !Number.isFinite(buyerShare)
      ? DEFAULT_SHIPPING_BUYER_SHARE
      : buyerShare,
  );
  const buyer = Math.round(fullShipping * (share / 100) * 100) / 100;
  const seller = Math.round((fullShipping - buyer) * 100) / 100;
  return { buyer, seller };
}
