import {
  calculateRefundFinancials,
  resolveCancellationPolicy,
  resolveReturnPolicy,
} from "./refund-financial-policy";

describe("refund financial policy", () => {
  const orderAmounts = {
    totalAmount: 1180,
    buyerShippingAmount: 130,
    buyerFeeAmount: 50,
    buyerServiceFeeAmount: 50,
    sellerFeeAmount: 100,
    sellerCommissionAmount: 40,
    sellerPlatformFeeAmount: 60,
    returnShippingAmount: 180,
    sellerShippingAmount: 40,
    orderQuantity: 1,
    refundQuantity: 1,
  };

  it.each([
    "not_as_described",
    "wrong_item",
    "damaged",
    "missing_parts",
    "counterfeit",
    "defective",
  ])(
    "treats %s as seller fault requiring evidence and admin review",
    (reason) => {
      const decision = resolveReturnPolicy(reason);

      expect(decision).toMatchObject({
        policyCode: "seller_fault_return",
        returnShippingPayer: "seller",
        refundOutboundShipping: true,
        refundBuyerProtectionFee: true,
        refundSellerPlatformFee: false,
        requiresEvidence: true,
        requiresAdminReview: true,
      });
    },
  );

  it("flags wrong-item and counterfeit claims for non-monetary penalty review", () => {
    expect(resolveReturnPolicy("wrong_item").penaltyReviewRequired).toBe(true);
    expect(resolveReturnPolicy("counterfeit").penaltyReviewRequired).toBe(true);
    expect(resolveReturnPolicy("damaged").penaltyReviewRequired).toBe(false);
  });

  it("automatically accepts buyer-remorse returns at the buyer's shipping cost", () => {
    expect(resolveReturnPolicy("changed_mind")).toMatchObject({
      policyCode: "buyer_remorse_return",
      returnShippingPayer: "buyer",
      refundOutboundShipping: false,
      refundBuyerProtectionFee: false,
      refundSellerPlatformFee: true,
      requiresEvidence: false,
      requiresAdminReview: false,
    });
  });

  it("requires review for buyer-caused damage and charges return shipping to the buyer", () => {
    expect(resolveReturnPolicy("buyer_damaged")).toMatchObject({
      policyCode: "buyer_fault_return",
      returnShippingPayer: "buyer",
      refundOutboundShipping: false,
      refundBuyerProtectionFee: false,
      refundSellerPlatformFee: true,
      requiresEvidence: true,
      requiresAdminReview: true,
    });
  });

  it("refunds outbound shipping but retains buyer protection before handover", () => {
    expect(resolveCancellationPolicy("wrong_product_selected")).toMatchObject({
      policyCode: "buyer_remorse_cancellation",
      returnShippingPayer: null,
      refundOutboundShipping: true,
      refundBuyerProtectionFee: false,
      refundSellerPlatformFee: true,
      requiresAdminReview: false,
    });
  });

  it("retains seller platform fee for delivery-delay cancellation", () => {
    expect(resolveCancellationPolicy("delivery_delayed")).toMatchObject({
      policyCode: "seller_fault_cancellation",
      refundOutboundShipping: true,
      refundBuyerProtectionFee: true,
      refundSellerPlatformFee: false,
      requiresAdminReview: false,
    });
  });

  it("computes exact seller-fault return components", () => {
    const result = calculateRefundFinancials(
      resolveReturnPolicy("damaged"),
      orderAmounts,
    );

    expect(result).toEqual({
      productRefundAmount: 1000,
      outboundShippingRefundAmount: 130,
      buyerProtectionRefundAmount: 50,
      returnShippingAmount: 180,
      returnShippingChargeToBuyer: 0,
      returnShippingChargeToSeller: 180,
      buyerRefundAmount: 1180,
      sellerFeeRefundAmount: 40,
      sellerPlatformFeeRetainedAmount: 60,
      // Kusur satıcıda: kendi kargo payı iade edilmez, alıcıya geri ödenen
      // gidiş kargosu da satıcıya borç yazılır (Sürat maliyeti platformda kalmasın).
      sellerShippingCompensationAmount: 0,
      outboundShippingChargeToSeller: 130,
      quantityPortion: 1,
    });
  });

  it("compensates the seller's shipping share on a full buyer-remorse return", () => {
    const result = calculateRefundFinancials(
      resolveReturnPolicy("changed_mind"),
      orderAmounts,
    );

    // Kusur alıcıda: satıcı ürün bedelini alamaz ama kargo masrafına da girmez —
    // escrow'da kesilen kendi payı (40) tazmin edilir. Gidiş borcu yazılmaz.
    expect(result.sellerShippingCompensationAmount).toBe(40);
    expect(result.outboundShippingChargeToSeller).toBe(0);
  });

  it("compensates the seller's shipping share on a buyer-fault return", () => {
    const result = calculateRefundFinancials(
      resolveReturnPolicy("buyer_damaged"),
      orderAmounts,
    );

    expect(result.sellerShippingCompensationAmount).toBe(40);
    expect(result.outboundShippingChargeToSeller).toBe(0);
  });

  it("does not compensate seller shipping on a partial return", () => {
    // Kargo kalan adetlere de hizmet etti; kısmi iadede pay tazmini yok,
    // adet-oranlı mantık aynen korunur.
    const result = calculateRefundFinancials(
      resolveReturnPolicy("changed_mind"),
      {
        ...orderAmounts,
        orderQuantity: 2,
        refundQuantity: 1,
      },
    );

    expect(result.sellerShippingCompensationAmount).toBe(0);
  });

  it("prorates the outbound charge on a partial seller-fault return", () => {
    const result = calculateRefundFinancials(resolveReturnPolicy("damaged"), {
      ...orderAmounts,
      orderQuantity: 2,
      refundQuantity: 1,
    });

    // Alıcıya oranlı iade edilen gidiş kargosu kadar borç.
    expect(result.outboundShippingRefundAmount).toBe(65);
    expect(result.outboundShippingChargeToSeller).toBe(65);
    expect(result.sellerShippingCompensationAmount).toBe(0);
  });

  it.each(["wrong_product_selected", "delivery_delayed"])(
    "compensates seller shipping on %s cancellation without an outbound charge",
    (reason) => {
      // Gönderi taşıyıcıya hiç verilmedi: Sürat maliyeti yok → kimse kargo
      // ödemez. Satıcının escrow'da kesilen payı iade edilir, borç yazılmaz.
      const result = calculateRefundFinancials(
        resolveCancellationPolicy(reason),
        orderAmounts,
      );

      expect(result.sellerShippingCompensationAmount).toBe(40);
      expect(result.outboundShippingChargeToSeller).toBe(0);
    },
  );

  it("keeps manual-review flows fully conservative", () => {
    for (const policy of [
      resolveReturnPolicy("unknown_reason"),
      resolveCancellationPolicy("unknown_reason"),
    ]) {
      const result = calculateRefundFinancials(policy, orderAmounts);
      expect(result.sellerShippingCompensationAmount).toBe(0);
      expect(result.outboundShippingChargeToSeller).toBe(0);
    }
  });

  it("deducts buyer-paid return shipping from buyer-remorse refund", () => {
    const result = calculateRefundFinancials(
      resolveReturnPolicy("changed_mind"),
      orderAmounts,
    );

    expect(result).toMatchObject({
      productRefundAmount: 1000,
      outboundShippingRefundAmount: 0,
      buyerProtectionRefundAmount: 0,
      returnShippingChargeToBuyer: 180,
      returnShippingChargeToSeller: 0,
      buyerRefundAmount: 820,
      sellerFeeRefundAmount: 100,
      sellerPlatformFeeRetainedAmount: 0,
    });
  });

  it("charges one return shipment while prorating partial item components", () => {
    const result = calculateRefundFinancials(
      resolveReturnPolicy("changed_mind"),
      {
        ...orderAmounts,
        orderQuantity: 2,
        refundQuantity: 1,
      },
    );

    expect(result).toMatchObject({
      productRefundAmount: 500,
      returnShippingChargeToBuyer: 180,
      buyerRefundAmount: 320,
      sellerFeeRefundAmount: 50,
      quantityPortion: 0.5,
    });
  });

  describe("v2 buyer fee = buyerCommission + buyerServiceFee", () => {
    // Alıcı ücreti İKİ bileşenli: komisyon 30 + hizmet bedeli 50 = 80.
    // totalAmount = 1000 ürün + 130 kargo + 80 alıcı ücreti = 1210.
    const v2Amounts = {
      ...orderAmounts,
      totalAmount: 1210,
      buyerFeeAmount: 80,
      buyerServiceFeeAmount: 50,
    };

    it("seller-fault full return refunds the ENTIRE buyer fee — buyer is made whole", () => {
      const result = calculateRefundFinancials(
        resolveReturnPolicy("damaged"),
        v2Amounts,
      );

      // Ürün 1000 + kargo 130 + alıcı ücretinin TAMAMI 80 (komisyon dahil).
      expect(result.buyerProtectionRefundAmount).toBe(80);
      expect(result.buyerRefundAmount).toBe(1210);
    });

    it("seller-fault cancellation refunds the entire buyer fee too", () => {
      const result = calculateRefundFinancials(
        resolveCancellationPolicy("delivery_delayed"),
        v2Amounts,
      );

      expect(result.buyerProtectionRefundAmount).toBe(80);
      expect(result.buyerRefundAmount).toBe(1210);
    });

    it("prorates the full buyer fee on a partial seller-fault return", () => {
      const result = calculateRefundFinancials(resolveReturnPolicy("damaged"), {
        ...v2Amounts,
        orderQuantity: 2,
        refundQuantity: 1,
      });

      expect(result.buyerProtectionRefundAmount).toBe(40);
    });

    it("a rule with ONLY buyerCommissionRate (no service fee) still refunds it", () => {
      // buyerFee = 30 komisyon, hizmet bedeli 0 → totalAmount 1160.
      const result = calculateRefundFinancials(resolveReturnPolicy("damaged"), {
        ...v2Amounts,
        totalAmount: 1160,
        buyerFeeAmount: 30,
        buyerServiceFeeAmount: 0,
      });

      expect(result.buyerProtectionRefundAmount).toBe(30);
      expect(result.buyerRefundAmount).toBe(1160);
    });

    it("buyer-remorse keeps the whole buyer fee (no partial component refund)", () => {
      const result = calculateRefundFinancials(
        resolveReturnPolicy("changed_mind"),
        v2Amounts,
      );

      expect(result.buyerProtectionRefundAmount).toBe(0);
      // Ürün 1000 − dönüş kargosu 180.
      expect(result.buyerRefundAmount).toBe(820);
    });
  });

  it("never allows buyer-paid return shipping to make the refund negative", () => {
    const result = calculateRefundFinancials(
      resolveReturnPolicy("changed_mind"),
      {
        ...orderAmounts,
        totalAmount: 100,
        buyerShippingAmount: 0,
        buyerFeeAmount: 0,
        buyerServiceFeeAmount: 0,
        returnShippingAmount: 180,
      },
    );

    expect(result.buyerRefundAmount).toBe(0);
  });

  describe("iptal: kargo bedelini gönderi durumu belirler", () => {
    // Eskiden iptal politikası yalnız nedene bakıyordu: alıcının kargo payı geri
    // ödeniyor VE satıcının payı tazmin ediliyordu, yani taşıma maliyeti
    // PLATFORMDA kalıyordu. Gönderi yola çıktıysa maliyet gerçekleşmiştir ve
    // kusurlu tarafta kalmalıdır.
    it("alıcı caymasında paket yola çıkmadıysa iki taraf da tazmin edilir", () => {
      expect(
        resolveCancellationPolicy("changed_mind", { hasShipped: false }),
      ).toMatchObject({
        policyCode: "buyer_remorse_cancellation",
        refundOutboundShipping: true,
        compensateSellerShipping: true,
        // Koruma hizmet bedeli her hâlükârda kesilir.
        refundBuyerProtectionFee: false,
      });
    });

    it("alıcı caymasında paket yola çıktıysa kargoyu alıcı üstlenir", () => {
      expect(
        resolveCancellationPolicy("changed_mind", { hasShipped: true }),
      ).toMatchObject({
        policyCode: "buyer_remorse_cancellation",
        // Alıcının payı geri ÖDENMEZ → maliyeti alıcı üstlenir.
        refundOutboundShipping: false,
        compensateSellerShipping: false,
        refundBuyerProtectionFee: false,
      });
    });

    it("teslimat gecikmesinde paket yola çıktıysa kargo satıcıya yazılır", () => {
      expect(
        resolveCancellationPolicy("delivery_delayed", { hasShipped: true }),
      ).toMatchObject({
        policyCode: "seller_fault_cancellation",
        // Alıcı kargosunu geri alır; maliyet satıcıya borç yazılır.
        refundOutboundShipping: true,
        chargeSellerOutboundShipping: true,
        compensateSellerShipping: false,
        // Satıcı platform hizmet bedeli kesilir (iade edilmez).
        refundSellerPlatformFee: false,
      });
    });

    it("teslimat gecikmesinde paket yola çıkmadıysa taşıma maliyeti doğmaz", () => {
      expect(
        resolveCancellationPolicy("delivery_delayed", { hasShipped: false }),
      ).toMatchObject({
        chargeSellerOutboundShipping: false,
        compensateSellerShipping: true,
        refundSellerPlatformFee: false,
      });
    });

    it("gönderi durumu verilmezse yola çıkmamış sayılır (geriye-uyum)", () => {
      expect(resolveCancellationPolicy("changed_mind")).toMatchObject({
        refundOutboundShipping: true,
        compensateSellerShipping: true,
      });
    });
  });

  describe("iade: gecikmeli teslimat", () => {
    it("satıcı kusuru sayılır — manuel incelemeye düşmez", () => {
      // Kargoya verilmiş sipariş iptal EDİLEMEZ (iade talebine yönlendirilir),
      // bu yüzden geç teslimatın iade tarafında da karşılığı olmalı.
      expect(resolveReturnPolicy("delivery_delayed")).toMatchObject({
        policyCode: "seller_fault_return",
        returnShippingPayer: "seller",
        chargeSellerOutboundShipping: true,
        // Satıcı platform hizmet bedeli kesilir.
        refundSellerPlatformFee: false,
        // Alıcı koruma bedeli iade edilir — kusur alıcıda değil.
        refundBuyerProtectionFee: true,
      });
    });

    it("cezai işlem gerektirmez (yanlış ürün/sahte ürün gibi değil)", () => {
      expect(
        resolveReturnPolicy("delivery_delayed").penaltyReviewRequired,
      ).toBe(false);
    });
  });
});
