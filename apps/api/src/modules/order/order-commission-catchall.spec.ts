import {
  calculateCommissionFromRules,
  isCatchAllCommissionRule,
} from "./order-commission.helper";
import {
  CommissionAppliesTo,
  CommissionRuleType,
  CommissionSellerType,
  CommissionTaxpayerType,
} from "@prisma/client";

/**
 * BLOCKER: fail-closed guard'ı `ruleId`'ye bakıyordu ve `ruleId =
 * sellerMatch ?? buyerMatch` olduğundan YALNIZCA alıcı-taraflı bir kural
 * eşleştiğinde sipariş `sellerFeeAmount = 0` ile sessizce geçiyordu (platform
 * gelir kaybı, alarm yok). Motorun hangi tarafın eşleştiğini ayrı ayrı
 * bildirmesi gerekir ki çağıran satıcı tarafını zorunlu tutabilsin.
 */
describe("commission engine — per-side match reporting", () => {
  const baseRule = (over: Partial<any> = {}): any => ({
    id: "r1",
    name: "Rule",
    ruleType: CommissionRuleType.default,
    appliesTo: CommissionAppliesTo.BOTH,
    categoryId: null,
    sellerType: CommissionSellerType.ALL,
    taxpayerType: CommissionTaxpayerType.all,
    minAmount: null,
    maxAmount: null,
    priority: 0,
    isActive: true,
    percentage: null,
    sellerRate: 10,
    buyerRate: 2,
    ...over,
  });

  const ctx = {
    categoryId: null,
    sellerType: CommissionSellerType.FREE,
    taxpayerType: CommissionTaxpayerType.individual,
    amount: 100,
  };

  it("yalnız alıcı tarafı eşleşirse sellerRuleId null döner (çağıran fail-closed yapabilir)", () => {
    const buyerOnly = baseRule({
      id: "buyer-only",
      appliesTo: CommissionAppliesTo.BUYER,
    });

    const result = calculateCommissionFromRules(100, [buyerOnly], ctx);

    expect(result.buyerRuleId).toBe("buyer-only");
    expect(result.sellerRuleId).toBeNull();
    // Eski davranış: ruleId dolu olduğu için guard geçiyordu.
    expect(result.ruleId).toBe("buyer-only");
    expect(result.sellerFeeAmount).toBe(0);
  });

  it("satıcı tarafı eşleşirse sellerRuleId dolu döner", () => {
    const result = calculateCommissionFromRules(100, [baseRule()], ctx);

    expect(result.sellerRuleId).toBe("r1");
    expect(result.buyerRuleId).toBe("r1");
    expect(result.sellerFeeAmount).toBeGreaterThan(0);
  });
});

/**
 * BLOCKER: "aktif catch-all kural" dağıtım önkoşulu hiçbir yerde zorlanmıyordu.
 * Catch-all tanımı tek kaynaktan gelmeli (health check + silme guard'ı aynı
 * tanımı kullanır).
 */
describe("isCatchAllCommissionRule", () => {
  const rule = (over: Partial<any> = {}): any => ({
    categoryId: null,
    sellerType: CommissionSellerType.ALL,
    taxpayerType: CommissionTaxpayerType.all,
    minAmount: null,
    maxAmount: null,
    appliesTo: CommissionAppliesTo.BOTH,
    ...over,
  });

  it("her eksene wildcard + sınırsız aralık + BOTH → catch-all", () => {
    expect(isCatchAllCommissionRule(rule())).toBe(true);
  });

  it("sellerType null (legacy wildcard) da catch-all sayılır", () => {
    expect(isCatchAllCommissionRule(rule({ sellerType: null }))).toBe(true);
  });

  it("kategoriye bağlı kural catch-all DEĞİLDİR", () => {
    expect(isCatchAllCommissionRule(rule({ categoryId: "cat-1" }))).toBe(false);
  });

  it("tutar aralığı sınırlı kural catch-all DEĞİLDİR", () => {
    expect(isCatchAllCommissionRule(rule({ minAmount: 100 }))).toBe(false);
    expect(isCatchAllCommissionRule(rule({ maxAmount: 500 }))).toBe(false);
  });

  it("yalnız alıcı/satıcı tarafına uygulanan kural catch-all DEĞİLDİR", () => {
    // Tek taraflı kural, karşı tarafı açıkta bırakır → dağıtım önkoşulunu karşılamaz.
    expect(
      isCatchAllCommissionRule(rule({ appliesTo: CommissionAppliesTo.BUYER })),
    ).toBe(false);
    expect(
      isCatchAllCommissionRule(rule({ appliesTo: CommissionAppliesTo.SELLER })),
    ).toBe(false);
  });

  it("belirli mükellef tipine bağlı kural catch-all DEĞİLDİR", () => {
    expect(
      isCatchAllCommissionRule({
        ...rule(),
        taxpayerType: CommissionTaxpayerType.corporate,
      }),
    ).toBe(false);
  });
});
