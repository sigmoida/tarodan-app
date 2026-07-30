import {
  CommissionAppliesTo,
  CommissionSellerType,
  ShippingPackageTierCode,
} from "@prisma/client";
import { calculateCommissionFromRules } from "./order-commission.helper";
import { resolvePackageShippingBuyerShare } from "../shipping/shipping-tariff.helper";

/**
 * Kargo bölüşümü artık PAKET BOYUTUNA göre değişir: küçük paketi alıcı öder,
 * paket büyüdükçe satıcı payı artar. Komisyon kuralı üç kademenin payını birlikte
 * taşır; hangisinin uygulanacağını çağıran (paketin çözülmüş kademesi) seçer —
 * böylece saf komisyon fonksiyonu kargo kademesinden habersiz kalır.
 *
 * Kademe satırı olmayan kural, tek `shippingBuyerShare` kolonunu TÜM kademelere
 * uygular (kolaylık fallback'i): tek pay girmek isteyen admin üç satır doldurmak
 * zorunda kalmaz.
 */
describe("calculateCommissionFromRules — per-tier shipping share", () => {
  const ctx = { categoryId: null, sellerType: CommissionSellerType.ALL };

  const ruleWithTierShares = {
    id: "rule-tiered",
    name: "Tiered shipping",
    categoryId: null,
    sellerType: CommissionSellerType.ALL,
    appliesTo: CommissionAppliesTo.BOTH,
    sellerCommissionRate: 10,
    shippingBuyerShare: 100,
    shippingShares: [
      { tierCode: ShippingPackageTierCode.small, buyerShare: 100 },
      { tierCode: ShippingPackageTierCode.medium, buyerShare: 70 },
      { tierCode: ShippingPackageTierCode.large, buyerShare: 50 },
    ],
  };

  it("üç kademenin payını birlikte döndürür", () => {
    const result = calculateCommissionFromRules(
      1000,
      [ruleWithTierShares],
      ctx,
    );

    expect(result.shippingBuyerShares).toEqual({
      small: 100,
      medium: 70,
      large: 50,
    });
  });

  it("kademe satırı yoksa tek pay TÜM kademelere uygulanır", () => {
    const result = calculateCommissionFromRules(
      1000,
      [{ ...ruleWithTierShares, shippingShares: [], shippingBuyerShare: 40 }],
      ctx,
    );

    expect(result.shippingBuyerShares).toEqual({
      small: 40,
      medium: 40,
      large: 40,
    });
  });

  it("eksik kademe satırı tek paya geri düşer (kısmi yapılandırma)", () => {
    const result = calculateCommissionFromRules(
      1000,
      [
        {
          ...ruleWithTierShares,
          shippingBuyerShare: 80,
          shippingShares: [
            { tierCode: ShippingPackageTierCode.large, buyerShare: 50 },
          ],
        },
      ],
      ctx,
    );

    expect(result.shippingBuyerShares).toEqual({
      small: 80,
      medium: 80,
      large: 50,
    });
  });

  it("paylar 0–100 aralığına sıkıştırılır", () => {
    const result = calculateCommissionFromRules(
      1000,
      [
        {
          ...ruleWithTierShares,
          shippingShares: [
            { tierCode: ShippingPackageTierCode.small, buyerShare: 150 },
            { tierCode: ShippingPackageTierCode.medium, buyerShare: -20 },
          ],
        },
      ],
      ctx,
    );

    expect(result.shippingBuyerShares.small).toBe(100);
    expect(result.shippingBuyerShares.medium).toBe(0);
  });

  it("kuralsız eşleşmede varsayılan 100 (alıcı tüm kargoyu öder)", () => {
    const result = calculateCommissionFromRules(1000, [], ctx);

    expect(result.shippingBuyerShares).toEqual({
      small: 100,
      medium: 100,
      large: 100,
    });
  });

  it("kargo payı satıcı tarafı kuralından gelir, yoksa alıcı tarafından", () => {
    const buyerOnly = {
      ...ruleWithTierShares,
      id: "rule-buyer",
      appliesTo: CommissionAppliesTo.BUYER,
      shippingShares: [
        { tierCode: ShippingPackageTierCode.large, buyerShare: 20 },
      ],
    };
    const sellerOnly = {
      ...ruleWithTierShares,
      id: "rule-seller",
      appliesTo: CommissionAppliesTo.SELLER,
      shippingShares: [
        { tierCode: ShippingPackageTierCode.large, buyerShare: 60 },
      ],
    };

    // Satıcı kuralı önceliklidir.
    expect(
      calculateCommissionFromRules(1000, [buyerOnly, sellerOnly], ctx)
        .shippingBuyerShares.large,
    ).toBe(60);
    // Yalnız alıcı kuralı varsa onun payı kullanılır.
    expect(
      calculateCommissionFromRules(1000, [buyerOnly], ctx).shippingBuyerShares
        .large,
    ).toBe(20);
  });

  it("geriye uyum: shippingBuyerShare çözülmüş kademenin payını yansıtır", () => {
    // Tek alanlı eski çağıranlar bozulmasın diye alan korunur; değeri, paketin
    // kademesi bilinmediğinden en yaygın durum olan ilk kademenin payıdır.
    const result = calculateCommissionFromRules(
      1000,
      [ruleWithTierShares],
      ctx,
    );
    expect(result.shippingBuyerShare).toBe(100);
  });
});

/**
 * Paket indirgemesi: kademe seçildikten SONRA, paketteki satırların o kademeye ait
 * payları arasından en düşüğü uygulanır (alıcı, sepette gördüğü sübvansiyondan
 * fazlasını ödemez ve sonuç satır sırasından bağımsız kalır).
 */
describe("resolvePackageShippingBuyerShare — tier-aware", () => {
  it("aynı kademede farklı kategoriler → en düşük pay", () => {
    expect(resolvePackageShippingBuyerShare([70, 50])).toBe(50);
    expect(resolvePackageShippingBuyerShare([50, 70])).toBe(50);
  });
});
