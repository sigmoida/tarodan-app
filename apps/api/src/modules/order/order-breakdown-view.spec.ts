/**
 * Ekranların gösterdiği kırılım, API'nin sakladığı tutarlarla AYNI olmalı.
 *
 * `buildOrderBreakdown` ekranlar için ayrı bir hesap yapmaz; siparişte duran
 * kalemleri listeler. Yine de KDV'yi kalem bazında kendisi türettiği için
 * (siparişte yalnız taraf toplamı saklanır) yuvarlamanın API'nin
 * `calculateServiceTax`'i ile kuruşu kuruşuna örtüştüğü burada sabitlenir —
 * aksi halde admin ekranındaki toplam, ödenen tutardan sapar.
 */
import { buildOrderBreakdown } from "@tarodan/shared";
import { calculateServiceTax } from "./order-service-tax.helper";
import { sellerNetAmountOf } from "./order-net.helper";
import { buyerTotalOf } from "./order-total.helper";

/** Referans tablo: 1000 TL, %6/%5 satıcı, %4/%5 alıcı, 100 TL kargo 50/50. */
const REFERENCE = {
  subtotal: 1000,
  sellerCommissionAmount: 60,
  sellerPlatformFeeAmount: 50,
  sellerShippingAmount: 50,
  buyerCommissionAmount: 40,
  buyerServiceFeeAmount: 50,
  buyerShippingAmount: 50,
  withholdingTaxAmount: 10,
  serviceVatRate: 20,
};

describe("buildOrderBreakdown", () => {
  it("referans tablonun her satırını üretir", () => {
    const b = buildOrderBreakdown(REFERENCE);

    expect(b.seller.lines).toEqual([
      { key: "sellerCommission", amount: 60, vat: 12 },
      { key: "sellerShipping", amount: 50, vat: 10 },
      { key: "sellerPlatformFee", amount: 50, vat: 10 },
    ]);
    expect(b.buyer.lines).toEqual([
      { key: "buyerCommission", amount: 40, vat: 8 },
      { key: "buyerShipping", amount: 50, vat: 10 },
      { key: "buyerServiceFee", amount: 50, vat: 10 },
    ]);
  });

  it("taraf toplamlarını tabloyla aynı verir", () => {
    const b = buildOrderBreakdown(REFERENCE);

    expect(b.seller.vatTotal).toBe(32);
    expect(b.seller.withholding).toBe(10);
    expect(b.seller.deductionTotal).toBe(202);
    expect(b.seller.net).toBe(798);

    expect(b.buyer.vatTotal).toBe(28);
    expect(b.buyer.addedTotal).toBe(168);
    expect(b.buyer.payable).toBe(1168);
  });

  it("API'nin sakladığı hizmet KDV'si ile birebir örtüşür", () => {
    const stored = calculateServiceTax(
      {
        buyerCommissionAmount: REFERENCE.buyerCommissionAmount,
        buyerServiceFeeAmount: REFERENCE.buyerServiceFeeAmount,
        buyerShippingAmount: REFERENCE.buyerShippingAmount,
        sellerCommissionAmount: REFERENCE.sellerCommissionAmount,
        sellerPlatformFeeAmount: REFERENCE.sellerPlatformFeeAmount,
        sellerShippingAmount: REFERENCE.sellerShippingAmount,
      },
      REFERENCE.serviceVatRate,
    );
    const view = buildOrderBreakdown(REFERENCE);

    expect(view.seller.vatTotal).toBe(stored.sellerServiceTaxAmount);
    expect(view.buyer.vatTotal).toBe(stored.buyerServiceTaxAmount);
  });

  it("alıcı toplamını API'nin ORTAK formülüyle aynı verir", () => {
    // Alıcı toplamı beş ayrı yerde elle yazılmıştı (direkt alım, sepet, misafir,
    // teklif ve checkout quote'u) ve quote hizmet KDV'sini atlıyordu: ekranda
    // görülen tutar tahsil edilenden düşüktü. Hepsi artık buyerTotalOf'a bağlı;
    // bu test ekran ile tahsilatın aynı sayıyı ürettiğini sabitler.
    const view = buildOrderBreakdown(REFERENCE);
    const charged = buyerTotalOf({
      subtotal: REFERENCE.subtotal,
      buyerShippingAmount: REFERENCE.buyerShippingAmount,
      buyerFeeAmount:
        REFERENCE.buyerCommissionAmount + REFERENCE.buyerServiceFeeAmount,
      buyerServiceTaxAmount: 28,
    });

    expect(charged).toBe(1168);
    expect(view.buyer.payable).toBe(charged);
  });

  it("net hak edişi API'nin payout formülüyle aynı verir", () => {
    const view = buildOrderBreakdown(REFERENCE);
    const payout = sellerNetAmountOf({
      subtotal: REFERENCE.subtotal,
      productTaxAmount: 0,
      sellerFeeAmount:
        REFERENCE.sellerCommissionAmount + REFERENCE.sellerPlatformFeeAmount,
      withholdingTaxAmount: REFERENCE.withholdingTaxAmount,
      sellerShippingAmount: REFERENCE.sellerShippingAmount,
      sellerServiceTaxAmount: 32,
    });

    expect(view.seller.net).toBe(payout);
  });

  it("kuruşlu tutarlarda da saklanan KDV ile örtüşür", () => {
    // Kalem bazında yuvarlanmazsa bu senaryoda 1 kuruş sapar.
    const odd = {
      ...REFERENCE,
      sellerCommissionAmount: 33.33,
      sellerPlatformFeeAmount: 16.67,
      sellerShippingAmount: 0.01,
    };
    const stored = calculateServiceTax(
      {
        buyerCommissionAmount: odd.buyerCommissionAmount,
        buyerServiceFeeAmount: odd.buyerServiceFeeAmount,
        buyerShippingAmount: odd.buyerShippingAmount,
        sellerCommissionAmount: odd.sellerCommissionAmount,
        sellerPlatformFeeAmount: odd.sellerPlatformFeeAmount,
        sellerShippingAmount: odd.sellerShippingAmount,
      },
      odd.serviceVatRate,
    );

    expect(buildOrderBreakdown(odd).seller.vatTotal).toBe(
      stored.sellerServiceTaxAmount,
    );
  });

  describe("boş kalemler", () => {
    it("tanımsız kalemi gizlemez, 0 olarak listeler", () => {
      const b = buildOrderBreakdown({
        subtotal: 500,
        sellerCommissionAmount: 25,
        serviceVatRate: 20,
      });

      // Kural yalnız satıcı komisyonu tanımlamış olsa da altı satırın hepsi durur.
      expect(b.seller.lines.map((l) => l.key)).toEqual([
        "sellerCommission",
        "sellerShipping",
        "sellerPlatformFee",
      ]);
      expect(b.buyer.lines.every((l) => l.amount === 0 && l.vat === 0)).toBe(
        true,
      );
      expect(b.seller.lines[1]).toEqual({
        key: "sellerShipping",
        amount: 0,
        vat: 0,
      });
    });

    it("kargosuz senaryoda kargo satırı 0'dır", () => {
      const b = buildOrderBreakdown({
        ...REFERENCE,
        sellerShippingAmount: 0,
        buyerShippingAmount: 0,
      });

      expect(b.seller.lines[1].amount).toBe(0);
      expect(b.buyer.lines[1].amount).toBe(0);
      expect(b.platform.shipping).toBe(0);
      // Kargo yoksa satıcı 50 + 10 KDV kadar daha fazla alır.
      expect(b.seller.net).toBe(858);
    });

    it("hizmet KDV'si kapalıyken tüm KDV satırları 0'dır", () => {
      const b = buildOrderBreakdown({ ...REFERENCE, serviceVatRate: 0 });

      expect(b.seller.vatTotal).toBe(0);
      expect(b.buyer.vatTotal).toBe(0);
      expect(b.buyer.payable).toBe(1140); // 1000 + 40 + 50 + 50
    });

    it("bireysel satıcıda stopaj satırı 0'dır", () => {
      const b = buildOrderBreakdown({
        ...REFERENCE,
        withholdingTaxAmount: 0,
      });

      expect(b.seller.withholding).toBe(0);
      expect(b.seller.net).toBe(808);
    });
  });

  describe("paranın dağılımı", () => {
    it("Tarodan'a kalanı, vergiyi ve kargoyu ayırır", () => {
      const b = buildOrderBreakdown(REFERENCE);

      expect(b.platform.revenue).toBe(200); // 60 + 50 + 40 + 50
      expect(b.platform.tax).toBe(70); // 32 + 28 + 10
      expect(b.platform.shipping).toBe(100);
      expect(b.platform.takeRate).toBe(20);
    });

    it("alıcının ödediği ile satıcının aldığı arasındaki fark tam dağıtılır", () => {
      const b = buildOrderBreakdown(REFERENCE);
      const gap = b.buyer.payable - b.seller.net;

      expect(gap).toBe(370);
      expect(b.platform.revenue + b.platform.tax + b.platform.shipping).toBe(
        gap,
      );
    });
  });
});
