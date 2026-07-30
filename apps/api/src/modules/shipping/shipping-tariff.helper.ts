import { Prisma, ShippingPackageTierCode } from "@prisma/client";

/**
 * Pure shipping-tariff math — the SINGLE source both the checkout pricing path and
 * the admin preview use, so a displayed quote can never diverge from what is charged.
 * All money is Decimal; the caller rounds once at the package level.
 */

const D = Prisma.Decimal;
type DecimalLike = Prisma.Decimal | number | string;

export interface PackageTierLike {
  code: ShippingPackageTierCode;
  minDesi: number;
  /** null = üst sınırsız (son kademe). */
  maxDesi: number | null;
  amount: DecimalLike;
}

export interface OutboundTariffLike {
  provider?: string;
  outboundPackageFee: DecimalLike;
  freeShippingEnabled: boolean;
  freeShippingThreshold: DecimalLike;
  packageTiers?: PackageTierLike[];
}

export class ShippingPackageTiersNotConfiguredError extends Error {
  constructor() {
    super("Active shipping tariff has no package tiers configured.");
    this.name = "ShippingPackageTiersNotConfiguredError";
  }
}

/**
 * Bir paketin faturalanabilir desisinin düştüğü kademe.
 *
 * Satıcı ilanda yalnız paket boyutu seçer; desi arka planda kalır çünkü kargo
 * satıcı paketi başına BİR kez alınır ve paketin desisi satırların toplamıdır
 * (Σ desi × adet). Toplam hangi aralığa düşerse o kademe uygulanır → 2 küçük ürün
 * (4 desi) Orta kademeye çıkar, eksik tahsil olmaz.
 *
 * Aralıklar yarı-açıktır: (minDesi, maxDesi]. Son kademenin `maxDesi`'si null
 * olduğundan HER desi bir kademeye düşer — eski desi tablosunun "satır yok" 503'ü
 * ortadan kalkar. Kademe tanımı hiç yoksa bu bir yapılandırma hatasıdır.
 */
export function resolvePackageTier(
  tariff: OutboundTariffLike,
  billableDesi: number,
): PackageTierLike {
  const tiers = [...(tariff.packageTiers ?? [])].sort(
    (a, b) => a.minDesi - b.minDesi,
  );
  if (tiers.length === 0) throw new ShippingPackageTiersNotConfiguredError();

  const match = tiers.find(
    (tier) => tier.maxDesi == null || billableDesi <= tier.maxDesi,
  );
  // En küçük kademenin altındaki desi ilk kademeyle ücretlenir; üstü son kademeyle.
  return match ?? tiers[tiers.length - 1];
}

/** Bir paketin faturalanabilir desisi için kademe tutarı. */
export function shippingAmountForDesi(
  tariff: OutboundTariffLike,
  billableDesi: number,
): Prisma.Decimal {
  return new D(resolvePackageTier(tariff, billableDesi).amount);
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

/** Paket boyutu başına alıcı kargo payı (%). */
export type ShippingBuyerShareByTier = Record<ShippingPackageTierCode, number>;

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

/**
 * Bir satıcı paketinin TÜM kargo kararı — dört checkout yolunun ve önizlemenin
 * TEK kaynağı.
 *
 * Sıra kritiktir ve bu fonksiyonun var olma sebebi budur: kargo payı artık paketin
 * KADEMESİNE bağlı, kademe ise toplam desiden çıkıyor. Dolayısıyla önce kademe
 * çözülmeli, pay ancak sonra o kademeden okunmalı. Yolların biri satırın payını,
 * diğeri kademenin payını kullanırsa önizleme ile tahsilat yeniden ayrışır — daha
 * önce sepette gösterilenden farklı tutar tahsil edilmesine yol açan hata buydu.
 *
 * `lineShares` paketteki her satırın kademe-payı haritasıdır; seçilen kademede en
 * DÜŞÜK pay uygulanır (alıcı, sepette gördüğü sübvansiyondan fazlasını ödemez ve
 * sonuç satır sırasından bağımsız kalır).
 */
export function resolvePackageShippingDecision(params: {
  tariff: OutboundTariffLike;
  subtotal: number;
  billableDesi: number;
  lineShares: Array<ShippingBuyerShareByTier | null | undefined>;
}): {
  tierCode: ShippingPackageTierCode;
  fullShipping: number;
  buyerShare: number;
  buyer: number;
  seller: number;
} {
  const { tariff, subtotal, billableDesi, lineShares } = params;
  const tier = resolvePackageTier(tariff, billableDesi);
  const fullShipping = outboundPackageShipping(
    tariff,
    subtotal,
    billableDesi,
  ).toNumber();
  const buyerShare = resolvePackageShippingBuyerShare(
    lineShares.map((shares) => shares?.[tier.code]),
  );
  const { buyer, seller } = splitShippingByBuyerShare(fullShipping, buyerShare);
  return { tierCode: tier.code, fullShipping, buyerShare, buyer, seller };
}
