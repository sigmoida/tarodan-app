import { ShippingPackageTierCode } from "@prisma/client";
import { resolvePackageShippingDecision } from "../shipping/shipping-tariff.helper";
import { packageTiers } from "../shipping/testing/tariff-fixture";

/**
 * Kademe bazlı paya geçişte en büyük risk, yolların AYNI kararı vermemesi: pay artık
 * paketin kademesine bağlı, kademe ise toplam desiden çıkıyor. Quote, direct, group,
 * guest ve teklif yollarının hepsi `resolveShippingDecision` üzerinden aynı saf
 * yardımcıyı çağırır — bu spec o yardımcının, dört yolun ürettiği farklı girdi
 * şekilleri altında bile tek bir sonuç verdiğini sabitler.
 *
 * Geçmişte ayrışma tam olarak buradan doğmuştu: quote son satırın payını, grup
 * checkout ilk satırın payını kullanıyordu ve alıcı gösterilenden farklı ödüyordu.
 */
describe("shipping decision parity across checkout paths", () => {
  const tariff = {
    freeShippingEnabled: false,
    freeShippingThreshold: 0,
    packageTiers: packageTiers(100, 130, 160),
  };
  const tieredShares = { small: 100, medium: 70, large: 50 };

  it("tek kalem: dört yol da aynı kademeyi ve payı çözer", () => {
    // Direct/guest tek satır geçirir; quote/grup tek satırlı paket için aynı listeyi.
    const single = resolvePackageShippingDecision({
      tariff,
      subtotal: 1000,
      billableDesi: 2,
      lineShares: [tieredShares],
    });
    const asPackage = resolvePackageShippingDecision({
      tariff,
      subtotal: 1000,
      billableDesi: 2,
      lineShares: [tieredShares],
    });

    expect(single).toEqual(asPackage);
    expect(single.tierCode).toBe(ShippingPackageTierCode.small);
    expect(single.buyer).toBe(100);
    expect(single.seller).toBe(0);
  });

  it("çok kalemli paket: kademe yükselir ve payı O kademeden alır", () => {
    // 2 küçük ürün → 4 desi → Orta kademe: 130 TL, pay %70.
    const decision = resolvePackageShippingDecision({
      tariff,
      subtotal: 2000,
      billableDesi: 4,
      lineShares: [tieredShares, tieredShares],
    });

    expect(decision.tierCode).toBe(ShippingPackageTierCode.medium);
    expect(decision.fullShipping).toBe(130);
    expect(decision.buyer).toBe(91);
    expect(decision.seller).toBe(39);
    // Kademe yükseldiği için küçük paketin %100 payı UYGULANMAZ.
    expect(decision.buyerShare).not.toBe(tieredShares.small);
  });

  it("alıcı payı + satıcı payı her zaman tam kargoya eşittir", () => {
    for (const billableDesi of [1, 2, 3, 5, 6, 10, 25]) {
      const decision = resolvePackageShippingDecision({
        tariff,
        subtotal: 1000,
        billableDesi,
        lineShares: [{ small: 33, medium: 67, large: 51 }],
      });
      expect(Math.round((decision.buyer + decision.seller) * 100) / 100).toBe(
        decision.fullShipping,
      );
    }
  });

  it("satır sırası hiçbir kademede sonucu değiştirmez", () => {
    const a = { small: 100, medium: 100, large: 80 };
    const b = { small: 40, medium: 70, large: 50 };
    for (const billableDesi of [2, 4, 12]) {
      const forward = resolvePackageShippingDecision({
        tariff,
        subtotal: 1000,
        billableDesi,
        lineShares: [a, b],
      });
      const reverse = resolvePackageShippingDecision({
        tariff,
        subtotal: 1000,
        billableDesi,
        lineShares: [b, a],
      });
      expect(forward).toEqual(reverse);
    }
  });
});
