import { calculateRefundFinancialsV2 } from "./refund-financial-policy-v2";

describe("refund financial policy v2", () => {
  const base = {
    productGrossAmount: 1000,
    productTaxAmount: 100,
    buyerShippingAmount: 60,
    sellerShippingAmount: 40,
    outboundFullShippingAmount: 100,
    buyerCommissionAmount: 30,
    buyerPlatformFeeAmount: 50,
    sellerCommissionAmount: 40,
    sellerPlatformFeeAmount: 60,
    serviceVatRate: 20,
    returnShippingAmount: 100,
    orderQuantity: 1,
    refundQuantity: 1,
    hasShipped: true,
  } as const;

  it("seller fault refunds buyer commission and platform fee but retains seller platform fee", () => {
    const result = calculateRefundFinancialsV2({
      ...base,
      faultParty: "seller",
    });

    expect(result.components).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          componentCode: "buyer_commission",
          treatment: "buyer_refund",
          netAmount: 30,
          taxAmount: 6,
          grossAmount: 36,
        }),
        expect.objectContaining({
          componentCode: "buyer_platform_fee",
          treatment: "buyer_refund",
        }),
        expect.objectContaining({
          componentCode: "seller_platform_fee",
          treatment: "platform_retain",
        }),
      ]),
    );
  });

  it("buyer fault retains the buyer platform fee and refunds the seller platform fee", () => {
    const result = calculateRefundFinancialsV2({
      ...base,
      faultParty: "buyer",
    });

    expect(result.components).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          componentCode: "buyer_platform_fee",
          treatment: "platform_retain",
        }),
        expect.objectContaining({
          componentCode: "seller_platform_fee",
          treatment: "seller_refund",
        }),
      ]),
    );
  });

  it.each(["carrier", "platform"] as const)(
    "%s fault refunds both platform fees and leaves shipping with platform",
    (faultParty) => {
      const result = calculateRefundFinancialsV2({ ...base, faultParty });

      expect(result.components).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            componentCode: "buyer_platform_fee",
            treatment: "buyer_refund",
          }),
          expect.objectContaining({
            componentCode: "seller_platform_fee",
            treatment: "seller_refund",
          }),
          expect.objectContaining({
            componentCode: "outbound_shipping",
            treatment: "platform_absorb",
          }),
          expect.objectContaining({
            componentCode: "return_shipping",
            treatment: "platform_absorb",
          }),
        ]),
      );
      expect(result.carrierClaimRequired).toBe(faultParty === "carrier");
    },
  );

  it("defers outbound shipping to the line-completing refund and settles the package once", () => {
    // K7: kısmi iade gidiş kargosuna DOKUNMAZ — koli kalan teslim adetlere
    // hizmet etmiştir (v1'deki tazmin ilkesiyle aynı).
    const partial = calculateRefundFinancialsV2({
      ...base,
      faultParty: "seller",
      orderQuantity: 2,
      refundQuantity: 1,
    });
    expect(
      partial.components.some((c) => c.componentCode === "outbound_shipping"),
    ).toBe(false);
    expect(partial.outboundSettlementRequired).toBe(false);

    // Satırı (önceki iadelerle birlikte) TAMAMLAYAN talep, kargo bileşenlerini
    // tam koli üzerinden tek seferde üretir.
    const completing = calculateRefundFinancialsV2({
      ...base,
      faultParty: "seller",
      orderQuantity: 2,
      refundQuantity: 1,
      completesLine: true,
    });
    expect(completing.components).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          componentCode: "outbound_shipping",
          treatment: "buyer_refund",
          netAmount: 60,
          quantityPortion: 1,
        }),
        expect.objectContaining({
          componentCode: "outbound_shipping",
          treatment: "seller_charge",
          netAmount: 100,
          quantityPortion: 1,
        }),
      ]),
    );
    expect(completing.outboundSettlementRequired).toBe(true);

    // Koli mutabakatı tek seferliktir: mutabakat düştükten sonra tekrar üretilmez.
    const afterSettled = calculateRefundFinancialsV2({
      ...base,
      faultParty: "seller",
      orderQuantity: 2,
      refundQuantity: 1,
      completesLine: true,
      outboundAlreadySettled: true,
    });
    expect(
      afterSettled.components.some(
        (c) =>
          c.componentCode === "outbound_shipping" &&
          c.treatment === "seller_charge",
      ),
    ).toBe(false);
    expect(afterSettled.outboundSettlementRequired).toBe(false);
  });

  describe("paket kargosu PAKET başına bir kez iade edilir", () => {
    // Aynı satıcıdan iki satırlık sepet = TEK koli, TEK kargo bedeli. Satır
    // tamamlansa bile kardeş satır hâlâ gidiyorsa kargo iade edilmez; yoksa
    // her satır iptalinde aynı koli bedeli yeniden iade edilirdi.
    const outbound = (result: ReturnType<typeof calculateRefundFinancialsV2>) =>
      result.components.filter((c) => c.componentCode === "outbound_shipping");

    it("kardeş satır hâlâ gidiyorsa gidiş kargosu ÜRETİLMEZ (kargo öncesi iptal)", () => {
      const result = calculateRefundFinancialsV2({
        ...base,
        faultParty: "buyer",
        hasShipped: false,
        completesLine: true,
        closesPackageShipping: false,
      });

      expect(outbound(result)).toHaveLength(0);
      expect(result.outboundSettlementRequired).toBe(false);
    });

    it("paketi KAPATAN iptal kargoyu bir kez iade eder ve mutabakat ister", () => {
      const result = calculateRefundFinancialsV2({
        ...base,
        faultParty: "buyer",
        hasShipped: false,
        completesLine: true,
        closesPackageShipping: true,
      });

      expect(outbound(result)).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ treatment: "buyer_refund", netAmount: 60 }),
          expect.objectContaining({
            treatment: "seller_refund",
            netAmount: 40,
          }),
        ]),
      );
      // Kargo öncesi yolda da TEK SEFERLİK koli mutabakatı yazılır — eskiden
      // yazılmadığı için ikinci iptal kargoyu yeniden iade ettirebiliyordu.
      expect(result.outboundSettlementRequired).toBe(true);
    });

    it("mutabakat düşmüşse ikinci iptal kargoyu TEKRAR iade etmez", () => {
      const result = calculateRefundFinancialsV2({
        ...base,
        faultParty: "buyer",
        hasShipped: false,
        completesLine: true,
        closesPackageShipping: true,
        outboundAlreadySettled: true,
      });

      expect(outbound(result)).toHaveLength(0);
      expect(result.outboundSettlementRequired).toBe(false);
    });

    it("kargolanmış pakette de kardeş satır varsa gidiş kargosu üretilmez", () => {
      const result = calculateRefundFinancialsV2({
        ...base,
        faultParty: "seller",
        hasShipped: true,
        completesLine: true,
        closesPackageShipping: false,
      });

      expect(outbound(result)).toHaveLength(0);
      expect(result.outboundSettlementRequired).toBe(false);
    });

    it("paket alanı verilmezse davranış completesLine ile aynıdır (tek satırlık sipariş)", () => {
      const result = calculateRefundFinancialsV2({
        ...base,
        faultParty: "buyer",
        hasShipped: false,
        completesLine: true,
      });

      expect(outbound(result).length).toBeGreaterThan(0);
    });
  });

  describe("satıcı kusurunda satıcının kargo payı hold'da kalmaz", () => {
    // Alıcı ödediğinin TAMAMINI (T = ürün + alıcı kargo payı + alıcı ücretleri)
    // geri alır; satıcının kargo payı T'de değil, satıcının hak edişinden
    // düşülmüştür. Bu pay `seller_refund` olarak tazmin edilirse hold'da
    // `amount − refundedAmount` kalıntısı doğar; satıcı kusurlu olduğu için o
    // para kimseye ödenemez ve escrow'da süresiz kilitli kalırdı.
    const sellerShippingRetention = (
      result: ReturnType<typeof calculateRefundFinancialsV2>,
    ) =>
      result.components.filter(
        (c) =>
          c.componentCode === "outbound_shipping" &&
          c.treatment === "seller_refund",
      );
    const buyerPaid =
      base.productGrossAmount +
      base.buyerShippingAmount * 1.2 +
      base.buyerCommissionAmount * 1.2 +
      base.buyerPlatformFeeAmount * 1.2;

    it("kargo öncesi satıcı kusurlu iptal: alıcıya T, satıcı payı tazmin edilmez", () => {
      const result = calculateRefundFinancialsV2({
        ...base,
        faultParty: "seller",
        hasShipped: false,
        returnShippingAmount: 0,
      });

      expect(sellerShippingRetention(result)).toHaveLength(0);
      expect(result.components).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            componentCode: "outbound_shipping",
            treatment: "buyer_refund",
            netAmount: 60,
            taxAmount: 12,
          }),
        ]),
      );
      // Taşıma doğmadı: satıcıya gidiş kargosu borcu da yazılmaz.
      expect(
        result.components.some((c) => c.treatment === "seller_charge"),
      ).toBe(false);
      // Alıcı ödediği her kuruşu geri alır, fazlasını değil.
      expect(result.buyerRefundAmount).toBeCloseTo(buyerPaid, 2);
      // Koli mutabakatı yine tek seferlik yazılır.
      expect(result.outboundSettlementRequired).toBe(true);
    });

    it("satıcı kusurlu iade (kargolanmış): satıcı payı tazmin edilmez, tam kargo satıcıya borç", () => {
      const result = calculateRefundFinancialsV2({
        ...base,
        faultParty: "seller",
        hasShipped: true,
      });

      expect(sellerShippingRetention(result)).toHaveLength(0);
      expect(result.components).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            componentCode: "outbound_shipping",
            treatment: "buyer_refund",
            netAmount: 60,
          }),
          expect.objectContaining({
            componentCode: "outbound_shipping",
            treatment: "seller_charge",
            netAmount: 100,
          }),
        ]),
      );
      expect(result.buyerRefundAmount).toBeCloseTo(buyerPaid, 2);
    });

    it.each(["buyer", "carrier", "platform"] as const)(
      "kargo öncesi %s kusurunda satıcı payı AYNEN tazmin edilir (davranış değişmez)",
      (faultParty) => {
        const result = calculateRefundFinancialsV2({
          ...base,
          faultParty,
          hasShipped: false,
          returnShippingAmount: 0,
        });

        expect(sellerShippingRetention(result)).toEqual([
          expect.objectContaining({
            netAmount: 40,
            taxAmount: 8,
            grossAmount: 48,
            quantityPortion: 1,
          }),
        ]);
      },
    );
  });

  describe("an earlier seller-fault refund forfeits the seller's share (D20)", () => {
    const sellerShare = (
      result: ReturnType<typeof calculateRefundFinancialsV2>,
    ) =>
      result.components.filter(
        (c) =>
          c.componentCode === "outbound_shipping" &&
          c.treatment === "seller_refund",
      );

    it("buyer fault, shipped: no share for the seller and no charge of it to the buyer", () => {
      const forfeited = calculateRefundFinancialsV2({
        ...base,
        faultParty: "buyer",
        hasShipped: true,
        sellerShareForfeited: true,
      });
      const normal = calculateRefundFinancialsV2({
        ...base,
        faultParty: "buyer",
        hasShipped: true,
      });
      const outboundBuyerCharge = (
        result: ReturnType<typeof calculateRefundFinancialsV2>,
      ) =>
        result.components.filter(
          (c) =>
            c.componentCode === "outbound_shipping" &&
            c.treatment === "buyer_charge",
        );

      expect(sellerShare(forfeited)).toHaveLength(0);
      expect(outboundBuyerCharge(normal)).toHaveLength(1);
      // The seller paid the share from the hold: the buyer is not charged it
      // too, so the buyer gets the 48 back that the normal case deducts.
      expect(outboundBuyerCharge(forfeited)).toHaveLength(0);
      expect(forfeited.buyerRefundAmount).toBeCloseTo(
        normal.buyerRefundAmount + 48,
        2,
      );
      // The buyer still bears their own outbound share (platform_retain).
      expect(forfeited.components).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            componentCode: "outbound_shipping",
            treatment: "platform_retain",
            netAmount: 60,
          }),
        ]),
      );
    });

    it.each([
      ["carrier, shipped", "carrier", true],
      ["platform, shipped", "platform", true],
      ["buyer, before shipment", "buyer", false],
    ] as const)(
      "%s: no seller_refund share, buyer side unchanged",
      (_n, faultParty, hasShipped) => {
        const forfeited = calculateRefundFinancialsV2({
          ...base,
          faultParty,
          hasShipped,
          sellerShareForfeited: true,
        });
        const normal = calculateRefundFinancialsV2({
          ...base,
          faultParty,
          hasShipped,
        });

        expect(sellerShare(normal)).toHaveLength(1);
        expect(sellerShare(forfeited)).toHaveLength(0);
        expect(forfeited.buyerRefundAmount).toBe(normal.buyerRefundAmount);
        expect(forfeited.sellerNetEffectAmount).toBeCloseTo(
          normal.sellerNetEffectAmount - 48,
          2,
        );
      },
    );
  });

  it.each([0, 10, 20])(
    "keeps net + tax = gross at %s service VAT",
    (serviceVatRate) => {
      const result = calculateRefundFinancialsV2({
        ...base,
        faultParty: "seller",
        serviceVatRate,
      });
      for (const component of result.components) {
        expect(component.netAmount + component.taxAmount).toBeCloseTo(
          component.grossAmount,
          2,
        );
      }
    },
  );

  it("does not leak buyer service tax into the product amount", () => {
    const result = calculateRefundFinancialsV2({
      ...base,
      faultParty: "seller",
    });
    const product = result.components.find(
      (component) => component.componentCode === "product",
    );

    expect(product).toMatchObject({
      netAmount: 900,
      taxAmount: 100,
      grossAmount: 1000,
    });
  });

  it("caps buyer charges at refundable gross and preserves the amount invariant", () => {
    const result = calculateRefundFinancialsV2({
      ...base,
      productGrossAmount: 50,
      productTaxAmount: 0,
      buyerShippingAmount: 0,
      sellerShippingAmount: 0,
      outboundFullShippingAmount: 0,
      buyerCommissionAmount: 0,
      buyerPlatformFeeAmount: 0,
      sellerCommissionAmount: 0,
      sellerPlatformFeeAmount: 0,
      returnShippingAmount: 100,
      faultParty: "buyer",
    });
    const buyerImpact = result.components.reduce((sum, component) => {
      if (component.treatment === "buyer_refund") {
        return sum + component.grossAmount;
      }
      if (component.treatment === "buyer_charge") {
        return sum - component.grossAmount;
      }
      return sum;
    }, 0);

    expect(result.buyerRefundAmount).toBe(0);
    expect(buyerImpact).toBe(0);
  });
});
