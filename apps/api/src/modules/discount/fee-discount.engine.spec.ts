import { DiscountTarget, DiscountType } from "@prisma/client";
import {
  applyFeeDiscounts,
  automaticBudgetEntriesOf,
  isBuyerFeeTarget,
  isFeeTarget,
  remainingDiscountAllowanceFor,
  MAX_TOTAL_DISCOUNT_PERCENT,
} from "./fee-discount.engine";
import type { FeeDiscountCandidate } from "./fee-discount.engine";

/**
 * Bedel indirimi motorunun kuralları (indirim-teknik §2, §10). Temel sipariş:
 * alıcı komisyonu 40, alıcı koruma bedeli 20, alıcı kargo payı 100,
 * satıcı komisyonu 80, satıcı platform hizmet bedeli 20.
 */
describe("applyFeeDiscounts", () => {
  const amounts = {
    [DiscountTarget.buyer_commission]: 40,
    [DiscountTarget.buyer_service_fee]: 20,
    [DiscountTarget.buyer_shipping]: 100,
    [DiscountTarget.seller_commission]: 80,
    [DiscountTarget.seller_platform_fee]: 20,
    [DiscountTarget.seller_shipping]: 0,
  };

  const candidate = (
    over: Partial<FeeDiscountCandidate> & { target: DiscountTarget },
  ): FeeDiscountCandidate => ({
    id: over.id ?? `d-${over.target}`,
    name: over.name ?? "Kampanya",
    type: over.type ?? DiscountType.percentage,
    value: over.value ?? 50,
    ...over,
  });

  it("yüzde indirimi yalnız hedef kaleme uygular", () => {
    const result = applyFeeDiscounts({
      candidates: [
        candidate({ target: DiscountTarget.buyer_commission, value: 100 }),
      ],
      amounts,
    });

    expect(result.amounts[DiscountTarget.buyer_commission]).toBe(0);
    expect(result.amounts[DiscountTarget.buyer_service_fee]).toBe(20);
    expect(result.buyerTotal).toBe(40);
    // Satıcının hak edişi bu kampanyadan etkilenmez.
    expect(result.sellerTotal).toBe(0);
  });

  it("satıcı tarafı indirimi alıcının ödediğini değiştirmez", () => {
    const result = applyFeeDiscounts({
      candidates: [
        candidate({ target: DiscountTarget.seller_commission, value: 25 }),
      ],
      amounts,
    });

    expect(result.amounts[DiscountTarget.seller_commission]).toBe(60);
    expect(result.sellerTotal).toBe(20);
    expect(result.buyerTotal).toBe(0);
  });

  it("aynı kaleme tek indirim uygular — alan tarafın lehine olanı", () => {
    const result = applyFeeDiscounts({
      candidates: [
        candidate({
          id: "herkes",
          target: DiscountTarget.buyer_commission,
          value: 20,
        }),
        candidate({
          id: "premium",
          target: DiscountTarget.buyer_commission,
          value: 30,
        }),
      ],
      amounts,
    });

    expect(result.applied).toHaveLength(1);
    expect(result.applied[0].discountId).toBe("premium");
    expect(result.amounts[DiscountTarget.buyer_commission]).toBe(28);
  });

  it("farklı kalemlere gelen indirimler birikir", () => {
    const result = applyFeeDiscounts({
      candidates: [
        candidate({ target: DiscountTarget.buyer_commission, value: 100 }),
        candidate({ target: DiscountTarget.buyer_shipping, value: 100 }),
      ],
      amounts,
    });

    expect(result.buyerTotal).toBe(140);
    expect(result.applied).toHaveLength(2);
  });

  it("sabit tutar kalemi eksiye düşüremez", () => {
    const result = applyFeeDiscounts({
      candidates: [
        candidate({
          target: DiscountTarget.buyer_service_fee,
          type: DiscountType.fixed_amount,
          value: 500,
        }),
      ],
      amounts,
    });

    expect(result.applied[0].amount).toBe(20);
    expect(result.amounts[DiscountTarget.buyer_service_fee]).toBe(0);
  });

  it("maksimum indirim tutarı tavanına uyar", () => {
    const result = applyFeeDiscounts({
      candidates: [
        candidate({
          target: DiscountTarget.buyer_shipping,
          value: 100,
          maxDiscountAmount: 30,
        }),
      ],
      amounts,
    });

    expect(result.applied[0].amount).toBe(30);
    expect(result.amounts[DiscountTarget.buyer_shipping]).toBe(70);
  });

  it("kampanyanın kalan bütçesi indirimi sınırlar", () => {
    const result = applyFeeDiscounts({
      candidates: [
        candidate({
          target: DiscountTarget.buyer_shipping,
          value: 100,
          budgetRemaining: 12.5,
        }),
      ],
      amounts,
    });

    expect(result.applied[0].amount).toBe(12.5);
  });

  it("adet koşulu sağlanmadan devreye girmez", () => {
    const input = {
      candidates: [
        candidate({
          target: DiscountTarget.buyer_commission,
          value: 100,
          minQuantity: 3,
        }),
      ],
      amounts,
    };

    expect(applyFeeDiscounts({ ...input, quantity: 2 }).applied).toHaveLength(
      0,
    );
    expect(applyFeeDiscounts({ ...input, quantity: 3 }).applied).toHaveLength(
      1,
    );
  });

  it("bedeli 0 olan kaleme indirim yazılmaz", () => {
    const result = applyFeeDiscounts({
      candidates: [
        candidate({ target: DiscountTarget.seller_shipping, value: 100 }),
      ],
      amounts,
    });

    expect(result.applied).toHaveLength(0);
    expect(result.total).toBe(0);
  });

  it("toplam tavanı aşan indirimi sondan geriye kırpar", () => {
    // Alıcı komisyonu 40 + kargo 100 = 140 talep; kalan pay 60.
    const result = applyFeeDiscounts({
      candidates: [
        candidate({ target: DiscountTarget.buyer_commission, value: 100 }),
        candidate({ target: DiscountTarget.buyer_shipping, value: 100 }),
      ],
      amounts,
      remainingDiscountAllowance: 60,
    });

    expect(result.total).toBe(60);
    // Kırpma sondan başlar: komisyon tam, kargo kısmi.
    const byTarget = Object.fromEntries(
      result.applied.map((line) => [line.target, line.amount]),
    );
    expect(byTarget[DiscountTarget.buyer_commission]).toBe(40);
    expect(byTarget[DiscountTarget.buyer_shipping]).toBe(20);
  });

  it("tavan sıfırsa hiçbir indirim uygulanmaz", () => {
    const result = applyFeeDiscounts({
      candidates: [
        candidate({ target: DiscountTarget.buyer_commission, value: 100 }),
      ],
      amounts,
      remainingDiscountAllowance: 0,
    });

    expect(result.applied).toHaveLength(0);
    expect(result.amounts[DiscountTarget.buyer_commission]).toBe(40);
  });

  it("ürün fiyatı hedefli indirim bu motorda yok sayılır", () => {
    const result = applyFeeDiscounts({
      candidates: [
        candidate({ target: DiscountTarget.product_price, value: 50 }),
      ],
      amounts,
    });

    expect(result.applied).toHaveLength(0);
  });
});

describe("remainingDiscountAllowanceFor (MAX_TOTAL_DISCOUNT_PERCENT)", () => {
  it("tavan %50'dir ve kupon öncesi satır tabanından hesaplanır", () => {
    expect(MAX_TOTAL_DISCOUNT_PERCENT).toBe(50);
    expect(remainingDiscountAllowanceFor({ lineBase: 1000 })).toBe(500);
  });

  it("satıra verilmiş kupon indirimi payı düşürür", () => {
    expect(
      remainingDiscountAllowanceFor({ lineBase: 1000, couponDiscount: 300 }),
    ).toBe(200);
  });

  it("kupon tek başına tavanı aşarsa bedel kampanyalarına pay kalmaz", () => {
    expect(
      remainingDiscountAllowanceFor({ lineBase: 1000, couponDiscount: 600 }),
    ).toBe(0);
  });

  it("negatif/sıfır taban 0 pay verir", () => {
    expect(remainingDiscountAllowanceFor({ lineBase: 0 })).toBe(0);
    expect(remainingDiscountAllowanceFor({ lineBase: -10 })).toBe(0);
  });

  it("motor bu payı tavan olarak uygular: kupon + kampanya toplamı tabanın yarısını aşamaz", () => {
    // 1000 TL satır, 450 TL kupon → bedel kampanyalarına 50 TL pay kalır.
    const allowance = remainingDiscountAllowanceFor({
      lineBase: 1000,
      couponDiscount: 450,
    });
    const result = applyFeeDiscounts({
      candidates: [
        candidateGlobal({
          target: DiscountTarget.buyer_commission,
          type: DiscountType.fixed_amount,
          value: 40,
        }),
        candidateGlobal({
          target: DiscountTarget.buyer_shipping,
          type: DiscountType.fixed_amount,
          value: 100,
        }),
      ],
      amounts: {
        [DiscountTarget.buyer_commission]: 40,
        [DiscountTarget.buyer_shipping]: 100,
      },
      remainingDiscountAllowance: allowance,
    });
    expect(result.total).toBe(50);
    // Kırpma SONDAN geriye: kargo indirimi kırpılır, komisyon indirimi yaşar.
    expect(
      result.applied.find((l) => l.target === DiscountTarget.buyer_commission)
        ?.amount,
    ).toBe(40);
    expect(
      result.applied.find((l) => l.target === DiscountTarget.buyer_shipping)
        ?.amount,
    ).toBe(10);
  });
});

const candidateGlobal = (
  over: Partial<FeeDiscountCandidate> & { target: DiscountTarget },
): FeeDiscountCandidate => ({
  id: over.id ?? `d-${over.target}`,
  name: over.name ?? "Kampanya",
  type: over.type ?? DiscountType.percentage,
  value: over.value ?? 50,
  ...over,
});

describe("automaticBudgetEntriesOf", () => {
  it("kodsuz satırları kampanya başına toplar, kuponlu satırları dışlar", () => {
    expect(
      automaticBudgetEntriesOf([
        { discountId: "a", discountCode: null, amount: 30 },
        { discountId: "a", discountCode: null, amount: 20.5 },
        { discountId: "b", discountCode: "YAZ10", amount: 15 },
        { discountId: "c", discountCode: null, amount: 0 },
      ]),
    ).toEqual([{ discountId: "a", amount: 50.5 }]);
  });

  it("bozuk/boş snapshot'ta boş liste döner", () => {
    expect(automaticBudgetEntriesOf(null)).toEqual([]);
    expect(automaticBudgetEntriesOf("x")).toEqual([]);
    expect(automaticBudgetEntriesOf([{ amount: 5 }])).toEqual([]);
  });
});

describe("hedef kalem sınıflandırması", () => {
  it("ürün fiyatı bedel kalemi değildir", () => {
    expect(isFeeTarget(DiscountTarget.product_price)).toBe(false);
    expect(isFeeTarget(DiscountTarget.seller_shipping)).toBe(true);
  });

  it("alıcı ve satıcı kalemleri ayrışır", () => {
    expect(isBuyerFeeTarget(DiscountTarget.buyer_shipping)).toBe(true);
    expect(isBuyerFeeTarget(DiscountTarget.seller_shipping)).toBe(false);
  });
});
