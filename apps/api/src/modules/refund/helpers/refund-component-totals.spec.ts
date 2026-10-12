import {
  refundComponentTotals,
  refundedSalesCommissionNet,
} from "./refund-component-totals";
import { calculateRefundFinancialsV2 } from "./refund-financial-policy-v2";

/**
 * Admin iade detayının taraf başına toplamları. Satırlar DB'den Decimal
 * (string) gelir; toplam kuruş kaybı olmadan hesaplanır.
 */
describe("refundComponentTotals", () => {
  it("totals a buyer-fault full return per side (rows as persisted)", () => {
    // 500 TL ürün, gidiş kargosu alıcı 30 + satıcı 30 (+%20 KDV), dönüş 50+KDV.
    const rows = [
      { componentCode: "product", treatment: "buyer_refund", grossAmount: "500.00" },
      { componentCode: "buyer_commission", treatment: "buyer_refund", grossAmount: "24.00" },
      { componentCode: "seller_commission", treatment: "seller_refund", grossAmount: "48.00" },
      { componentCode: "buyer_platform_fee", treatment: "platform_retain", grossAmount: "12.00" },
      { componentCode: "seller_platform_fee", treatment: "seller_refund", grossAmount: "6.00" },
      { componentCode: "outbound_shipping", treatment: "platform_retain", grossAmount: "36.00" },
      { componentCode: "outbound_shipping", treatment: "seller_refund", grossAmount: "36.00" },
      { componentCode: "outbound_shipping", treatment: "buyer_charge", grossAmount: "36.00" },
      { componentCode: "return_shipping", treatment: "buyer_charge", grossAmount: "60.00" },
    ];

    expect(refundComponentTotals(rows)).toEqual({
      buyerRefund: 524,
      buyerCharge: 96,
      buyerNet: 428,
      sellerRefund: 90,
      sellerCharge: 0,
      sellerNet: 90,
      platformRetain: 48,
      platformRefund: 0,
      platformNet: 48,
      shippingRefund: 0,
    });
  });

  it("keeps cents exact where float addition would drift", () => {
    const rows = [
      { componentCode: "product", treatment: "buyer_refund", grossAmount: "0.10" },
      { componentCode: "buyer_commission", treatment: "buyer_refund", grossAmount: "0.20" },
    ];
    expect(refundComponentTotals(rows).buyerRefund).toBe(0.3);
  });

  it.each(["seller", "carrier", "platform", "buyer"] as const)(
    "agrees with the v2 calculator's own buyer and seller figures (%s fault)",
    (faultParty) => {
      const result = calculateRefundFinancialsV2({
        productGrossAmount: 1250,
        productTaxAmount: 208.33,
        buyerShippingAmount: 42.5,
        sellerShippingAmount: 42.5,
        outboundFullShippingAmount: 85,
        buyerCommissionAmount: 37.5,
        buyerPlatformFeeAmount: 10,
        sellerCommissionAmount: 100,
        sellerPlatformFeeAmount: 15,
        serviceVatRate: 20,
        returnShippingAmount: 64.9,
        orderQuantity: 1,
        refundQuantity: 1,
        faultParty,
        hasShipped: true,
      });

      const totals = refundComponentTotals(result.components);

      // `RefundRequest.amount` = buyer_refund − buyer_charge
      expect(totals.buyerNet).toBe(result.buyerRefundAmount);
      expect(totals.sellerNet).toBe(result.sellerNetEffectAmount);
      // the shipping refund is the buyer's outbound line, nothing else
      const outboundToBuyer = result.components
        .filter(
          (c) =>
            c.componentCode === "outbound_shipping" &&
            c.treatment === "buyer_refund",
        )
        .reduce((n, c) => n + c.grossAmount, 0);
      expect(totals.shippingRefund).toBe(outboundToBuyer);
    },
  );

  it("is all zeros for a request without components (legacy v1)", () => {
    expect(Object.values(refundComponentTotals([]))).toEqual(
      new Array(10).fill(0),
    );
  });
});

/**
 * Admin İadeler ekranının "iade edilecek komisyon"u: yalnız satış komisyonu
 * bileşenleri (alıcı + satıcı), KDV hariç, sahibine geri dönen muamelelerle.
 */
describe("refundedSalesCommissionNet", () => {
  it("sums the buyer and seller commission returned to their owners (net)", () => {
    const rows = [
      { componentCode: "product", treatment: "buyer_refund", netAmount: "500.00" },
      { componentCode: "buyer_commission", treatment: "buyer_refund", netAmount: "20.00" },
      { componentCode: "seller_commission", treatment: "seller_refund", netAmount: "40.00" },
      { componentCode: "buyer_platform_fee", treatment: "buyer_refund", netAmount: "10.00" },
      { componentCode: "seller_platform_fee", treatment: "platform_retain", netAmount: "5.00" },
    ];
    expect(refundedSalesCommissionNet(rows)).toBe(60);
  });

  it("ignores commission that is retained or charged instead of returned", () => {
    const rows = [
      { componentCode: "seller_commission", treatment: "platform_retain", netAmount: "40.00" },
      { componentCode: "buyer_commission", treatment: "buyer_charge", netAmount: "20.00" },
    ];
    expect(refundedSalesCommissionNet(rows)).toBe(0);
  });

  it("keeps cents exact", () => {
    const rows = [
      { componentCode: "buyer_commission", treatment: "buyer_refund", netAmount: "0.10" },
      { componentCode: "seller_commission", treatment: "seller_refund", netAmount: "0.20" },
    ];
    expect(refundedSalesCommissionNet(rows)).toBe(0.3);
  });

  it("is zero without components (provisional / legacy request)", () => {
    expect(refundedSalesCommissionNet([])).toBe(0);
  });
});
