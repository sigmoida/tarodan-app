import {
  refundableAmountFor,
  tradeRefundExcludesShipping,
} from "./trade-refund-policy";

/**
 * TAKAS İADE MATRİSİ (v2) — kargo iade edilmez, hizmet bedeli ve fark edilir.
 *
 * v2'de ödemenin içinde KARGO da var. Ürün kargoya verildikten sonra iptal
 * olursa platform bacakların maliyetini gerçekten ödemiştir: o tutar iade
 * edilmez. Henüz hiçbir ürün kargoya verilmemişken iptal olursa hizmet
 * alınmamıştır → TAM iade (müşteriden kullanılmamış hizmetin bedeli tutulmaz).
 *
 * Takas TAMAMLANDIKTAN sonra iade süreci yoktur (yalnız dispute); bu politika
 * iptal/red/return yollarında geçerlidir.
 */
describe("takas iade politikası", () => {
  describe("tradeRefundExcludesShipping", () => {
    it("hiçbir ürün kargoya verilmediyse kargo da iade edilir", () => {
      expect(tradeRefundExcludesShipping({ handedToCargo: false })).toBe(false);
    });

    it("ürün kargoya verildiyse kargo iade DIŞIDIR", () => {
      expect(tradeRefundExcludesShipping({ handedToCargo: true })).toBe(true);
    });
  });

  describe("refundableAmountFor", () => {
    const payment = {
      totalAmount: 295, // 35 ücret + 60 kargo + 200 fark
      shippingAmount: 60,
    };

    it("kargoya verilmeden iptalde ödenenin tamamını iade eder", () => {
      expect(refundableAmountFor(payment, { handedToCargo: false })).toBe(295);
    });

    it("kargoya verildikten sonra kargo bedelini düşer", () => {
      expect(refundableAmountFor(payment, { handedToCargo: true })).toBe(235);
    });

    it("v1 ödemesinde kargo kalemi olmadığı için tam iade eder", () => {
      // v1 satırlarında shippingAmount 0'dır; eski davranış (tam iade) korunur.
      expect(
        refundableAmountFor(
          { totalAmount: 210, shippingAmount: 0 },
          { handedToCargo: true },
        ),
      ).toBe(210);
    });

    it("kargo bedeli ödenenin tamamıysa iade 0'dır (negatife düşmez)", () => {
      expect(
        refundableAmountFor(
          { totalAmount: 60, shippingAmount: 60 },
          { handedToCargo: true },
        ),
      ).toBe(0);
    });

    it("kuruşlu tutarlarda kuruş hassasiyetini korur", () => {
      expect(
        refundableAmountFor(
          { totalAmount: 95.55, shippingAmount: 60.33 },
          { handedToCargo: true },
        ),
      ).toBe(35.22);
    });
  });
});
