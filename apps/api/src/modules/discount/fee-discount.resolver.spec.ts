import {
  DiscountAudience,
  DiscountScope,
  DiscountTarget,
  DiscountType,
} from "@prisma/client";
import { FeeDiscountResolver } from "./fee-discount.resolver";

/**
 * Aktif kampanyalar TEK sorguyla çekilir, uygunluk bellekte değerlendirilir:
 * kapsam (hangi ürün), hedef kitle (kim) ve bütçe (kalan var mı).
 */
describe("FeeDiscountResolver.selectFor", () => {
  const resolver = new FeeDiscountResolver({} as any);

  const row = (over: Partial<any> = {}): any => ({
    id: "d1",
    name: "Kampanya",
    type: DiscountType.percentage,
    value: 50,
    scope: DiscountScope.global,
    sellerId: null,
    categoryId: null,
    targetProductIds: [],
    target: DiscountTarget.buyer_commission,
    audience: DiscountAudience.everyone,
    maxDiscountAmount: null,
    minQuantity: null,
    usageLimitTotal: null,
    usedCount: 0,
    budgetLimit: null,
    budgetSpent: 0,
    priority: 0,
    targetTiers: [],
    targetUsers: [],
    ...over,
  });

  const context = {
    productId: "p1",
    categoryId: "c1",
    sellerId: "s1",
    buyerId: "b1",
    buyerTier: "premium",
    sellerTier: "basic",
  };

  it("kapsamı tutmayan kampanyayı eler", () => {
    const rows = [
      row({ scope: DiscountScope.category, categoryId: "baska-kategori" }),
    ];
    expect(resolver.selectFor(rows, context)).toHaveLength(0);
  });

  it("kapsamı tutan kampanyayı aday yapar", () => {
    const rows = [row({ scope: DiscountScope.category, categoryId: "c1" })];
    const candidates = resolver.selectFor(rows, context);
    expect(candidates).toHaveLength(1);
    expect(candidates[0].target).toBe(DiscountTarget.buyer_commission);
  });

  it("üyelik hedefi tutmayan kampanyayı eler", () => {
    const rows = [
      row({
        audience: DiscountAudience.membership_tiers,
        targetTiers: [{ tierType: "business" }],
      }),
    ];
    expect(resolver.selectFor(rows, context)).toHaveLength(0);
  });

  it("üyelik hedefi tutan kampanyayı aday yapar", () => {
    const rows = [
      row({
        audience: DiscountAudience.membership_tiers,
        targetTiers: [{ tierType: "premium" }],
      }),
    ];
    expect(resolver.selectFor(rows, context)).toHaveLength(1);
  });

  it("satıcı kalemi için satıcının katmanına bakar", () => {
    const rows = [
      row({
        target: DiscountTarget.seller_commission,
        audience: DiscountAudience.membership_tiers,
        targetTiers: [{ tierType: "basic" }],
      }),
    ];
    expect(resolver.selectFor(rows, context)).toHaveLength(1);
  });

  it("kullanım limiti dolmuş kampanyayı eler", () => {
    const rows = [row({ usageLimitTotal: 5, usedCount: 5 })];
    expect(resolver.selectFor(rows, context)).toHaveLength(0);
  });

  it("bütçesi bitmiş kampanyayı eler, kalanı adayın tavanı yapar", () => {
    expect(
      resolver.selectFor(
        [row({ budgetLimit: 100, budgetSpent: 100 })],
        context,
      ),
    ).toHaveLength(0);

    const candidates = resolver.selectFor(
      [row({ budgetLimit: 100, budgetSpent: 60 })],
      context,
    );
    expect(candidates[0].budgetRemaining).toBe(40);
  });

  it("bütçesiz kampanyada tavan yoktur", () => {
    const candidates = resolver.selectFor([row()], context);
    expect(candidates[0].budgetRemaining).toBeNull();
  });

  it("kişiye özel kampanya yalnız hedef alıcıya çıkar", () => {
    const rows = [
      row({
        audience: DiscountAudience.specific_buyers,
        targetUsers: [{ userId: "b9" }],
      }),
    ];
    expect(resolver.selectFor(rows, context)).toHaveLength(0);
    expect(
      resolver.selectFor(
        [
          row({
            audience: DiscountAudience.specific_buyers,
            targetUsers: [{ userId: "b1" }],
          }),
        ],
        context,
      ),
    ).toHaveLength(1);
  });
});
