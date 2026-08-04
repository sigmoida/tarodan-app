import { readCommissionRuleSnapshot } from "./order-commission-snapshot";

/**
 * Sipariş ekranı "hangi komisyon kuralına düştü" sorusunu SNAPSHOT'tan
 * cevaplamalı. Canlı kural setinden yeniden eşleştirmek yanlış cevap verir:
 * eşleşme kategori, üyelik, satıcı tipi ve tutar aralığına bakar ve bunların
 * hepsi sipariş sonrası değişebilir.
 */
describe("sipariş komisyon kuralı snapshot'ı", () => {
  const snapshot = {
    version: 2,
    commission: {
      ruleSetId: "set-2",
      ruleId: "rule-1",
      ruleName: "Koleksiyon %6",
      matchedCategoryId: "category-1",
      matchedSellerType: "PREMIUM",
      matchedAmount: 999,
      effectiveMembershipTier: "PREMIUM",
      sellerFeeAmount: 59.94,
    },
  };

  it("eşleşen kuralı kimliği ve eksenleriyle döner", () => {
    expect(readCommissionRuleSnapshot(snapshot)).toEqual({
      id: "rule-1",
      ruleSetId: "set-2",
      name: "Koleksiyon %6",
      categoryId: "category-1",
      sellerType: "PREMIUM",
      matchedAmount: 999,
      membershipTier: "PREMIUM",
    });
  });

  it("kural adı yoksa kimlik yine döner", () => {
    expect(
      readCommissionRuleSnapshot({ commission: { ruleId: "rule-2" } }),
    ).toEqual({
      id: "rule-2",
      ruleSetId: null,
      name: null,
      categoryId: null,
      sellerType: null,
      matchedAmount: null,
      membershipTier: null,
    });
  });

  it("snapshot'ı olmayan eski siparişte null döner", () => {
    expect(readCommissionRuleSnapshot(null)).toBeNull();
    expect(readCommissionRuleSnapshot(undefined)).toBeNull();
    expect(readCommissionRuleSnapshot({})).toBeNull();
    expect(readCommissionRuleSnapshot({ commission: {} })).toBeNull();
  });

  it("kural eşleşmemişse (ruleId boş) null döner", () => {
    expect(
      readCommissionRuleSnapshot({ commission: { ruleId: null } }),
    ).toBeNull();
    expect(
      readCommissionRuleSnapshot({ commission: { ruleId: "" } }),
    ).toBeNull();
  });

  it("bozuk snapshot çökertmez", () => {
    expect(readCommissionRuleSnapshot("bozuk")).toBeNull();
    expect(readCommissionRuleSnapshot({ commission: "bozuk" })).toBeNull();
    expect(
      readCommissionRuleSnapshot({ commission: { ruleId: 42 } }),
    ).toBeNull();
  });
});
