import { Prisma } from "@prisma/client";
import { RefundService } from "./refund.service";

/**
 * computePartialRefundAmount, alıcıya iade edilecek tutarı kısmi iade
 * politikasına (4 boolean flag) göre hesaplar.
 *
 * Kritik invariant (gerçek checkout, order.service):
 *   totalAmount = discountedPrice + shippingCost + buyerFeeAmount
 *   subtotal    = originalPrice (indirim ÖNCESİ, alıcının ürüne ödediği DEĞİL)
 *
 * Bu yüzden "ürün tutarı" iadesi stored subtotal'dan değil,
 * alıcının ürüne fiilen ödediği tutardan (totalAmount - shipping - buyerFee)
 * türetilmelidir. Aksi halde:
 *   - subtotal NULL olan siparişlerde ürün tutarı iadeye eklenmez (eksik ödeme)
 *   - indirimli siparişlerde indirim öncesi fiyat iade edilir (fazla ödeme)
 */
describe("RefundService.computePartialRefundAmount", () => {
  // computePartialRefundAmount saf bir fonksiyon; bağımlılıkları kullanmaz.
  const service = new RefundService(
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
  );

  const compute = (policy: any, order: any): number =>
    Number((service as any).computePartialRefundAmount(policy, order));

  const D = (n: number) => new Prisma.Decimal(n);

  it("subtotal NULL iken ürün tutarını totalAmount - shipping - buyerFee ile türetir", () => {
    const order = {
      totalAmount: D(249.66),
      subtotal: null,
      shippingCost: D(30),
      buyerFeeAmount: D(0),
    };
    const amount = compute(
      {
        refundProductAmount: true,
        refundShippingFee: false,
        refundBuyerFee: false,
      },
      order,
    );
    expect(amount).toBeCloseTo(219.66, 2);
  });

  it("tüm flagler açıkken alıcının ödediği toplam tutarı iade eder", () => {
    const order = {
      totalAmount: D(249.66),
      subtotal: null,
      shippingCost: D(30),
      buyerFeeAmount: D(0),
    };
    const amount = compute(
      {
        refundProductAmount: true,
        refundShippingFee: true,
        refundBuyerFee: true,
      },
      order,
    );
    expect(amount).toBeCloseTo(249.66, 2);
  });

  it("indirimli siparişte indirim öncesi subtotal yerine ödenen ürün tutarını iade eder", () => {
    // originalPrice=500 (subtotal), kupon -100 => discountedPrice=400
    // totalAmount = 400 + 30 (kargo) + 20 (alıcı komisyonu) = 450
    const order = {
      totalAmount: D(450),
      subtotal: D(500),
      shippingCost: D(30),
      buyerFeeAmount: D(20),
    };
    const amount = compute(
      {
        refundProductAmount: true,
        refundShippingFee: false,
        refundBuyerFee: false,
      },
      order,
    );
    expect(amount).toBeCloseTo(400, 2); // 500 değil!
  });

  it("sadece kargo iadesi yalnızca shippingCost döner", () => {
    const order = {
      totalAmount: D(249.66),
      subtotal: null,
      shippingCost: D(30),
      buyerFeeAmount: D(0),
    };
    const amount = compute(
      {
        refundProductAmount: false,
        refundShippingFee: true,
        refundBuyerFee: false,
      },
      order,
    );
    expect(amount).toBeCloseTo(30, 2);
  });

  it("hiçbir flag açık değilse 0 döner", () => {
    const order = {
      totalAmount: D(249.66),
      subtotal: D(219.66),
      shippingCost: D(30),
      buyerFeeAmount: D(0),
    };
    const amount = compute(
      {
        refundProductAmount: false,
        refundShippingFee: false,
        refundBuyerFee: false,
      },
      order,
    );
    expect(amount).toBe(0);
  });

  it("A9/C5: kurumsal satıcı (KDV dahil) siparişte ürün iadesi KDV dahil döner — alıcı made-whole", () => {
    // Kurumsal: totalAmount = ürün(100) + kargo(30) + buyerFee(5) + KDV(18) = 153
    // productAmount = total - shipping - buyerFee = 118 = ürün(100) + KDV(18).
    // Bu KASITLI: alıcı ürüne KDV dahil ödedi → iade KDV dahil olmalı (satıcı iade
    // faturasıyla KDV'yi devletten geri alır). Tam iade de toplamı (KDV dahil) döner;
    // komponent iade bununla tutarlı. (B4 kararı: mevcut davranış doğru.)
    const order = {
      totalAmount: D(153),
      subtotal: null,
      shippingCost: D(30),
      buyerFeeAmount: D(5),
    };
    const amount = compute(
      {
        refundProductAmount: true,
        refundShippingFee: false,
        refundBuyerFee: false,
      },
      order,
    );
    expect(amount).toBeCloseTo(118, 2);
  });

  describe("A10: computeRefundAmount adet sınırlama (clamp)", () => {
    const refundAmount = (order: any, qty: number): number =>
      Number((service as any).computeRefundAmount(order, qty));

    it("refundQuantity > orderQuantity → tam tutara clamp (fazla iade yok)", () => {
      const order = { totalAmount: D(300), quantity: 3 };
      // 5 adet istense de sipariş 3 adet → en fazla tam tutar (300) iade edilir
      expect(refundAmount(order, 5)).toBeCloseTo(300, 2);
    });

    it("kısmi adet → orantılı tutar", () => {
      const order = { totalAmount: D(300), quantity: 3 };
      expect(refundAmount(order, 1)).toBeCloseTo(100, 2);
      expect(refundAmount(order, 2)).toBeCloseTo(200, 2);
    });

    it("tek adetlik siparişte daima tam tutar", () => {
      const order = { totalAmount: D(99.9), quantity: 1 };
      expect(refundAmount(order, 1)).toBeCloseTo(99.9, 2);
    });
  });
});
