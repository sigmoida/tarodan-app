import { DiscountType } from "@prisma/client";

/**
 * Adet koşullu SATICI kampanyalarının saf hesap katmanı (Ç1/Ç2 kararı).
 *
 * İki tür vardır ve ikisi de SATIR bazında çalışır (aynı üründen alınan adet;
 * sepetteki farklı ürünler birbirinin adedini tamamlamaz — İ7):
 *
 *  - `bogo`  — "X al Y bedava": her (buy+get) adetlik pakette `get` adet
 *    bedavadır. "2 al 1 öde" = buy 1, get 1; "3 al 2 öde" = buy 2, get 1.
 *  - `bulk_quantity` — "N adet ve üzerinde satıra %V indirim".
 *
 * İkisi de ürün fiyatı (satıcının cebi) kampanyasıdır: vitrin BİRİM fiyatını
 * değiştirmez, sepette satır tutarını düşürür; komisyon indirimli (tahsil
 * edilen) tabandan hesaplandığı için platform komisyonu da birlikte iner.
 */
export interface QuantityCampaignLike {
  id: string;
  name: string;
  type: DiscountType | string;
  /** bulk_quantity için yüzde; bogo'da kullanılmaz. */
  value: number | { toString(): string };
  minQuantity?: number | null;
  buyQuantity?: number | null;
  getQuantity?: number | null;
  maxDiscountAmount?: number | { toString(): string } | null;
}

const round2 = (value: number): number =>
  Math.round((value + Number.EPSILON) * 100) / 100;

const num = (value: unknown): number => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

/** Kampanyanın TEK satırda verdiği indirim; koşul sağlanmazsa 0. */
export function quantityCampaignDiscount(
  campaign: QuantityCampaignLike,
  unitPrice: number,
  quantity: number,
): number {
  if (!(unitPrice > 0) || !(quantity > 0)) return 0;
  const lineBase = unitPrice * quantity;

  let amount = 0;
  if (campaign.type === DiscountType.bogo) {
    const buy = num(campaign.buyQuantity);
    const get = num(campaign.getQuantity);
    if (buy < 1 || get < 1) return 0;
    const bundle = buy + get;
    const freeUnits = Math.floor(quantity / bundle) * get;
    amount = freeUnits * unitPrice;
  } else if (campaign.type === DiscountType.bulk_quantity) {
    const min = num(campaign.minQuantity);
    // Tek adet "adet koşulu" değildir; koşulsuz indirim ilan fiyatının işidir.
    if (min < 2 || quantity < min) return 0;
    const percent = num(campaign.value);
    if (!(percent > 0)) return 0;
    amount = lineBase * (Math.min(percent, 100) / 100);
  } else {
    return 0;
  }

  const cap = campaign.maxDiscountAmount;
  if (cap != null && amount > num(cap)) amount = num(cap);
  // Satır tabanını aşamaz (negatif tahsilat yok).
  return round2(Math.min(amount, lineBase));
}

/** Aynı satıra uyan kampanyalardan EN YÜKSEK indirimi vereni seç. */
export function bestQuantityCampaignDiscount(
  campaigns: QuantityCampaignLike[],
  unitPrice: number,
  quantity: number,
): { campaign: QuantityCampaignLike; amount: number } | null {
  let winner: { campaign: QuantityCampaignLike; amount: number } | null = null;
  for (const campaign of campaigns) {
    const amount = quantityCampaignDiscount(campaign, unitPrice, quantity);
    if (amount <= 0) continue;
    if (!winner || amount > winner.amount) winner = { campaign, amount };
  }
  return winner;
}
