import { describe, expect, it } from "vitest";
import {
  buyerOrderSummaryOf,
  sellerOrderSummaryOf,
  type OrderDetail,
} from "./types";

/**
 * Sipariş özeti satırları — KDV dağıtımı ve mutabakat.
 *
 * Bu ekran bir dönem KDV'yi kalemlere kendi dağıtıyordu (kargonunki kargo
 * satırına) ve aynı sipariş checkout'ta başka, sipariş detayında başka bir
 * kırılım gösteriyordu. Kural artık backend'in `pricing.summary`'siyle aynı:
 * kargo KDV'siz, hizmet KDV'sinin tamamı hizmet bedeli satırında.
 */

// Referans sipariş: ürün 1000, alıcı kargo payı 100, alıcı ücreti 50,
// %20 hizmet KDV'si → (100 + 50) × 0,20 = 30. Toplam 1000+100+50+30 = 1180.
const ORDER = {
  totalAmount: 1180,
  pricing: {
    subtotal: 1000,
    shippingAmount: 100,
    buyerFeeAmount: 50,
    sellerFeeAmount: 80,
    commissionAmount: 0,
    taxAmount: 0,
    buyerServiceTaxAmount: 30,
    sellerServiceTaxAmount: 24,
    sellerShippingAmount: 40,
    withholdingTaxAmount: 10,
    serviceVatRate: 20,
    totalAmount: 1180,
    sellerNetAmount: 846,
  },
} as unknown as OrderDetail;

describe("buyerOrderSummaryOf", () => {
  it("kargo satırını KDV'siz, hizmet KDV'sinin tamamını hizmet bedelinde gösterir", () => {
    const s = buyerOrderSummaryOf(ORDER);

    expect(s.productAmount).toBe(1000);
    // Kargo KDV'si (100 × 0,20 = 20) bu satıra EKLENMEZ.
    expect(s.shippingAmount).toBe(100);
    // Ücret + hizmet KDV'sinin tamamı (kargonunki dahil): 50 + 30.
    expect(s.serviceFeeAmount).toBe(80);
  });

  it("satırların toplamı ödenen tutarı birebir verir", () => {
    const s = buyerOrderSummaryOf(ORDER);

    expect(s.productAmount + s.shippingAmount + s.serviceFeeAmount).toBe(
      s.paidAmount,
    );
  });

  it("pricing yokken de satırlar ödenen tutarı verir", () => {
    const legacy = {
      totalAmount: 1180,
      shippingCost: 100,
      buyerFeeAmount: 50,
    } as unknown as OrderDetail;
    const s = buyerOrderSummaryOf(legacy);

    expect(s.productAmount + s.shippingAmount + s.serviceFeeAmount).toBe(1180);
  });

  it("pricing yokken satıcı ürün bedeli alıcı toplamına DÜŞMEZ", () => {
    // Regresyon: taban ham totalAmount'a düştüğünde satıcı, ürün bedelini
    // kargo + alıcı ücreti kadar şişik görüyordu (1180 yerine 1030 olmalı).
    const legacy = {
      totalAmount: 1180,
      shippingCost: 100,
      buyerFeeAmount: 50,
      sellerFeeAmount: 80,
    } as unknown as OrderDetail;
    const s = sellerOrderSummaryOf(legacy);

    expect(s.productAmount).toBe(1030);
    expect(s.payout).toBe(1030 - 80);
  });
});

describe("sellerOrderSummaryOf", () => {
  it("kargo kesintisini KDV'siz, hizmet KDV'sinin tamamını hizmet kesintisinde gösterir", () => {
    const s = sellerOrderSummaryOf(ORDER);

    expect(s.productAmount).toBe(1000);
    // Kargo KDV'si (40 × 0,20 = 8) bu satıra EKLENMEZ.
    expect(s.shippingDeduction).toBe(40);
    // Ücret + satıcı hizmet KDV'sinin tamamı: 80 + 24.
    expect(s.serviceFeeDeduction).toBe(104);
    expect(s.withholdingTax).toBe(10);
  });

  it("kesintilerin toplamı satıcı kazancını birebir verir", () => {
    const s = sellerOrderSummaryOf(ORDER);

    expect(
      s.productAmount -
        s.shippingDeduction -
        s.serviceFeeDeduction -
        s.withholdingTax,
    ).toBe(s.payout);
  });
});
