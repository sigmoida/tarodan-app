import {
  refundableAmountFor,
  tradePaymentRefundableAmountFor,
  tradeRefundExcludesShipping,
  tradeServiceFeeOf,
} from "./trade-refund-policy";

/**
 * TAKAS İADE MATRİSİ.
 *
 * Önce kusur sorulur: takas bu tarafın kusuru OLMADAN bozulduysa
 * (`fullRefundEntitled`) tahsil edilenin tamamı iade edilir. Aksi halde hizmet
 * bedeli hiçbir iptalde iade edilmez ve kargo yalnız fiilen kullanıldıysa
 * (kargoya verildikten sonra) iade dışıdır; nakit fark her durumda iade edilir.
 *
 * Takas TAMAMLANDIKTAN sonra iade süreci yoktur (yalnız dispute); bu politika
 * iptal/red/return yollarında geçerlidir.
 */
describe("takas iade politikası", () => {
  const line = { totalAmount: 295, shippingAmount: 60, tradeFeeAmount: 35 };

  describe("tradeRefundExcludesShipping", () => {
    it("hiçbir ürün kargoya verilmediyse kargo da iade edilir", () => {
      expect(tradeRefundExcludesShipping(line, { handedToCargo: false })).toBe(
        false,
      );
    });

    it("ürün kargoya verildiyse kargo iade DIŞIDIR", () => {
      expect(tradeRefundExcludesShipping(line, { handedToCargo: true })).toBe(
        true,
      );
    });

    it("kusursuz tarafta kargo da iade edilir (ürün yola çıkmış olsa bile)", () => {
      expect(
        tradeRefundExcludesShipping(
          { ...line, fullRefundEntitled: true },
          { handedToCargo: true },
        ),
      ).toBe(false);
    });
  });

  describe("tradeServiceFeeOf", () => {
    it("v2 satırında sabit hizmet bedelini döndürür", () => {
      expect(
        tradeServiceFeeOf({
          totalAmount: 295,
          shippingAmount: 60,
          tradeFeeAmount: 35,
        }),
      ).toBe(35);
    });

    it("v1 satırında komisyon + KDV'sini döndürür", () => {
      expect(
        tradeServiceFeeOf({
          totalAmount: 210,
          shippingAmount: 0,
          commissionAmount: 8,
          commissionTaxAmount: 1.6,
        }),
      ).toBe(9.6);
    });

    it("alan yoksa 0 döndürür", () => {
      expect(tradeServiceFeeOf({ totalAmount: 100, shippingAmount: 20 })).toBe(
        0,
      );
    });
  });

  describe("refundableAmountFor", () => {
    const payment = {
      totalAmount: 295, // 35 hizmet bedeli + 60 kargo + 200 fark
      shippingAmount: 60,
      tradeFeeAmount: 35,
    };

    it("kargoya verilmeden iptalde hizmet bedeli DÜŞÜLÜR, kargo + fark iade edilir", () => {
      expect(refundableAmountFor(payment, { handedToCargo: false })).toBe(260);
    });

    it("kargoya verildikten sonra hizmet bedeli VE kargo düşülür", () => {
      expect(refundableAmountFor(payment, { handedToCargo: true })).toBe(200);
    });

    it("v1 ödemesinde komisyon + KDV düşülür (kargo kalemi yoktur)", () => {
      expect(
        refundableAmountFor(
          {
            totalAmount: 210,
            shippingAmount: 0,
            commissionAmount: 8,
            commissionTaxAmount: 1.6,
          },
          { handedToCargo: true },
        ),
      ).toBe(200.4);
    });

    it("ödenenin tamamı hizmet bedeli + kargoysa iade 0'dır (negatife düşmez)", () => {
      expect(
        refundableAmountFor(
          { totalAmount: 95, shippingAmount: 60, tradeFeeAmount: 35 },
          { handedToCargo: true },
        ),
      ).toBe(0);
    });

    it("KUSURSUZ tarafta tahsil edilenin TAMAMI iade edilir", () => {
      // Karşı taraf ödemedi / kargolamadı / ürünü kontrolden geçmedi: bu taraf
      // hizmet bedelini de kargosunu da kaybetmez.
      expect(
        refundableAmountFor(
          { ...payment, fullRefundEntitled: true },
          { handedToCargo: true },
        ),
      ).toBe(295);
      expect(
        refundableAmountFor(
          { ...payment, fullRefundEntitled: true },
          { handedToCargo: false },
        ),
      ).toBe(295);
    });

    it("kuruşlu tutarlarda kuruş hassasiyetini korur", () => {
      expect(
        refundableAmountFor(
          { totalAmount: 95.55, shippingAmount: 60.33, tradeFeeAmount: 10.11 },
          { handedToCargo: true },
        ),
      ).toBe(25.11);
    });
  });

  describe("tradePaymentRefundableAmountFor", () => {
    const candidate = {
      paymentStatus: "completed",
      provider: "paytr",
      releasedAt: null,
      refundedAt: null,
      totalAmount: 95, // 20 hizmet bedeli + 25 kargo + 50 fark
      shippingAmount: 25,
      tradeFeeAmount: 20,
    };

    it("yalnız tamamlanmış ve bırakılmamış PayTR ödemesini uygun sayar", () => {
      expect(
        tradePaymentRefundableAmountFor(candidate, { handedToCargo: false }),
      ).toBe(75);
      expect(
        tradePaymentRefundableAmountFor(
          { ...candidate, releasedAt: new Date() },
          { handedToCargo: false },
        ),
      ).toBe(0);
      expect(
        tradePaymentRefundableAmountFor(
          { ...candidate, paymentStatus: "failed" },
          { handedToCargo: false },
        ),
      ).toBe(0);
      expect(
        tradePaymentRefundableAmountFor(
          { ...candidate, provider: "other" },
          { handedToCargo: false },
        ),
      ).toBe(0);
    });

    it("kusursuz tarafta uygunluk guard'ları hâlâ geçerlidir", () => {
      // Tam iade hakkı, iade edilmiş ya da escrow'u bırakılmış satırı yeniden
      // iade edilebilir yapmaz.
      expect(
        tradePaymentRefundableAmountFor(
          { ...candidate, fullRefundEntitled: true },
          { handedToCargo: true },
        ),
      ).toBe(95);
      expect(
        tradePaymentRefundableAmountFor(
          { ...candidate, fullRefundEntitled: true, refundedAt: new Date() },
          { handedToCargo: true },
        ),
      ).toBe(0);
    });

    it("kargoya teslimden sonra yalnız iade edilebilir bakiyeyi döndürür", () => {
      expect(
        tradePaymentRefundableAmountFor(candidate, { handedToCargo: true }),
      ).toBe(50);
      expect(
        tradePaymentRefundableAmountFor(
          { ...candidate, totalAmount: 45 },
          { handedToCargo: true },
        ),
      ).toBe(0);
    });
  });
});
