import { DiscountTarget, DiscountType } from "@prisma/client";

/**
 * BEDEL indirimlerinin saf hesap katmanı.
 *
 * Ürün fiyatı indirimi satıcının cebinden çıkar ve sipariş tabanını değiştirir;
 * bedel indirimi platformun cebinden çıkar ve KESİNTİ kalemlerini küçültür. İkisi
 * aynı fonksiyonda karışırsa taban ile kesinti birbirine girer, o yüzden bedel
 * tarafı burada tek başına durur: DB, para birimi dönüşümü, KDV yok — yalnız
 * "hangi kaleme, ne kadar" kararı.
 *
 * Kurallar (indirim-teknik §2, §10):
 *  - Aynı kaleme YALNIZ bir indirim uygulanır; alan tarafın lehine olan seçilir.
 *  - Hiçbir kalem eksiye düşmez; artan indirim başka kaleme taşınmaz.
 *  - Kampanya bütçesi kalanı, o kampanyanın verebileceği indirimi sınırlar.
 *  - Toplam indirim tavanı aşılırsa SON uygulanandan geriye doğru kırpılır
 *    (sıra sabittir → önizleme ile tahsilat aynı sonucu verir).
 */

/** Alıcının ödediğini düşüren kalemler. Kupon kodu YALNIZ bunlara bağlanabilir. */
export const BUYER_FEE_TARGETS = [
  DiscountTarget.buyer_commission,
  DiscountTarget.buyer_service_fee,
  DiscountTarget.buyer_shipping,
] as const;

/** Satıcının hak edişini yükselten kalemler. Koda bağlanamaz (satıcı kod yazmaz). */
export const SELLER_FEE_TARGETS = [
  DiscountTarget.seller_commission,
  DiscountTarget.seller_platform_fee,
  DiscountTarget.seller_shipping,
] as const;

/**
 * Uygulama sırası SABİTTİR: tavan kırpması bu sıranın sonundan başlar, dolayısıyla
 * aynı girdi her zaman aynı sonucu verir (quote = checkout).
 */
export const FEE_TARGETS = [
  ...BUYER_FEE_TARGETS,
  ...SELLER_FEE_TARGETS,
] as const;

export type FeeTarget = (typeof FEE_TARGETS)[number];

export const isFeeTarget = (target: DiscountTarget): target is FeeTarget =>
  (FEE_TARGETS as readonly DiscountTarget[]).includes(target);

export const isBuyerFeeTarget = (target: DiscountTarget): boolean =>
  (BUYER_FEE_TARGETS as readonly DiscountTarget[]).includes(target);

/** Bir kaleme aday kampanya. Kapsam/kitle eşleşmesi ÇAĞIRAN tarafta yapılır. */
export interface FeeDiscountCandidate {
  id: string;
  name: string;
  code?: string | null;
  target: DiscountTarget;
  type: DiscountType;
  value: number;
  maxDiscountAmount?: number | null;
  /** Adet koşulu: sepetteki adet bunun altındaysa kampanya devreye girmez. */
  minQuantity?: number | null;
  /** Kampanyanın kalan bütçesi; null = sınırsız. */
  budgetRemaining?: number | null;
}

/** Kalem bazında indirim ÖNCESİ bedeller. Eksik anahtar 0 sayılır. */
export type FeeAmounts = Partial<Record<FeeTarget, number>>;

export interface AppliedFeeDiscount {
  discountId: string;
  discountName: string;
  discountCode?: string | null;
  target: FeeTarget;
  type: DiscountType;
  value: number;
  amount: number;
  /** Alıcının ödediğini mi düşürüyor, satıcının hak edişini mi yükseltiyor? */
  side: "buyer" | "seller";
}

export interface FeeDiscountResult {
  applied: AppliedFeeDiscount[];
  /** İndirim SONRASI bedeller — sipariş kolonlarına bunlar yazılır. */
  amounts: FeeAmounts;
  buyerTotal: number;
  sellerTotal: number;
  total: number;
}

const round2 = (value: number): number =>
  Math.round((value + Number.EPSILON) * 100) / 100;

const positive = (value: number | null | undefined): number =>
  Number.isFinite(value) && (value as number) > 0 ? (value as number) : 0;

/** Bir adayın tek bir kalemde verebileceği indirim; taban ve tavanlarla sınırlı. */
const discountFor = (candidate: FeeDiscountCandidate, base: number): number => {
  if (base <= 0 || candidate.value <= 0) return 0;

  let amount =
    candidate.type === DiscountType.percentage
      ? base * (candidate.value / 100)
      : Math.min(candidate.value, base);

  const cap = candidate.maxDiscountAmount;
  if (cap != null && amount > cap) amount = cap;

  const budget = candidate.budgetRemaining;
  if (budget != null && amount > budget) amount = budget;

  // Kalem eksiye düşemez.
  return round2(Math.min(amount, base));
};

export interface ApplyFeeDiscountsInput {
  candidates: FeeDiscountCandidate[];
  amounts: FeeAmounts;
  /** Adet koşullu kampanyalar için sepetteki/satırdaki adet. */
  quantity?: number;
  /**
   * Toplam indirim tavanı (TL). Ürün fiyatı indirimi bu hesaba DAHİL edilerek
   * çağrılır: çağıran, kupon/kampanya indirimini de sayıp kalan payı geçirir.
   * null = tavan yok.
   */
  remainingDiscountAllowance?: number | null;
}

export function applyFeeDiscounts(
  input: ApplyFeeDiscountsInput,
): FeeDiscountResult {
  const quantity = Math.max(1, Math.floor(input.quantity ?? 1));
  const amounts: FeeAmounts = {};
  for (const target of FEE_TARGETS) {
    amounts[target] = round2(positive(input.amounts[target]));
  }

  const eligible = input.candidates.filter(
    (candidate) =>
      isFeeTarget(candidate.target) &&
      quantity >= Math.max(1, candidate.minQuantity ?? 1),
  );

  const applied: AppliedFeeDiscount[] = [];
  for (const target of FEE_TARGETS) {
    const base = amounts[target] ?? 0;
    if (base <= 0) continue;

    // Aynı kaleme tek indirim: en yüksek tutarı veren aday kazanır. Eşitlikte
    // aday sırası korunur (deterministik).
    let winner: { candidate: FeeDiscountCandidate; amount: number } | null =
      null;
    for (const candidate of eligible) {
      if (candidate.target !== target) continue;
      const amount = discountFor(candidate, base);
      if (amount <= 0) continue;
      if (!winner || amount > winner.amount) winner = { candidate, amount };
    }
    if (!winner) continue;

    applied.push({
      discountId: winner.candidate.id,
      discountName: winner.candidate.name,
      discountCode: winner.candidate.code ?? null,
      target,
      type: winner.candidate.type,
      value: winner.candidate.value,
      amount: winner.amount,
      side: isBuyerFeeTarget(target) ? "buyer" : "seller",
    });
  }

  // Tavan: SON uygulanandan geriye doğru kırp. Sıra `FEE_TARGETS` ile sabit
  // olduğu için önizleme ile tahsilat aynı satırları kırpar.
  const allowance = input.remainingDiscountAllowance;
  if (allowance != null) {
    let total = applied.reduce((sum, line) => sum + line.amount, 0);
    let excess = round2(total - Math.max(0, allowance));
    for (let i = applied.length - 1; i >= 0 && excess > 0; i--) {
      const trim = Math.min(applied[i].amount, excess);
      applied[i].amount = round2(applied[i].amount - trim);
      excess = round2(excess - trim);
    }
    total = applied.reduce((sum, line) => sum + line.amount, 0);
  }

  const survivors = applied.filter((line) => line.amount > 0);
  for (const line of survivors) {
    amounts[line.target] = round2((amounts[line.target] ?? 0) - line.amount);
  }

  const buyerTotal = round2(
    survivors
      .filter((line) => line.side === "buyer")
      .reduce((sum, line) => sum + line.amount, 0),
  );
  const sellerTotal = round2(
    survivors
      .filter((line) => line.side === "seller")
      .reduce((sum, line) => sum + line.amount, 0),
  );

  return {
    applied: survivors,
    amounts,
    buyerTotal,
    sellerTotal,
    total: round2(buyerTotal + sellerTotal),
  };
}
