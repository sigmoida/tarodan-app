import { BadRequestException, HttpException } from "@nestjs/common";
import { OfferStatus, ProductStatus } from "@prisma/client";
import { OfferService } from "./offer.service";
import { userBlockServiceStub } from "../user-block/user-block.testing";

/**
 * The ceiling of an offer amount is the listing's CURRENT sale price
 * (`resolveSalePrice`), read when the amount is proposed and again when it is
 * accepted. The buyer (offer and buyer counter) stays strictly below it, the
 * seller counter may reach it. A pending offer the price dropped under is
 * refused at accept with a 409 instead of being charged above the price.
 * The pure rule is pinned in `helpers/offer-price-ceiling-policy.spec.ts`.
 */

const HOUR = 3_600_000;

type ProductOverrides = Partial<{
  price: number;
  oldPrice: number | null;
  saleStartDate: Date | null;
  saleEndDate: Date | null;
}>;

const product = (overrides: ProductOverrides = {}) => ({
  id: "p1",
  title: "Product",
  sellerId: "s1",
  categoryId: "cat-1",
  status: ProductStatus.active,
  quantity: 5,
  reservedQuantity: 0,
  shippingDesi: 2,
  price: 1000,
  oldPrice: null as number | null,
  saleStartDate: null as Date | null,
  saleEndDate: null as Date | null,
  images: [],
  seller: { id: "s1", displayName: "S" },
  ...overrides,
});

/** A sale (price 800, list price 1000) whose window already closed: sells at 1000. */
const closedSale = {
  price: 800,
  oldPrice: 1000,
  saleEndDate: new Date(Date.now() - HOUR),
};
/** The same sale while its window is open: sells at 800. */
const openSale = {
  price: 800,
  oldPrice: 1000,
  saleStartDate: new Date(Date.now() - HOUR),
  saleEndDate: new Date(Date.now() + HOUR),
};

const i18nKeyOf = (error: unknown) =>
  (error as { response?: { i18nKey?: string } } | undefined)?.response?.i18nKey;

/** counter / buyerCounter stop at the first write after the price gates. */
describe("OfferService counters against the current price", () => {
  const STOP = new Error("stop");

  const build = (current: ProductOverrides, offer: Record<string, unknown>) => {
    const tx = {
      offer: {
        findUnique: jest.fn().mockResolvedValue({
          id: "o1",
          productId: "p1",
          buyerId: "b1",
          sellerId: "s1",
          status: OfferStatus.pending,
          buyerMustAccept: false,
          expiresAt: new Date(Date.now() + HOUR),
          product: product(current),
          ...offer,
        }),
        update: jest.fn().mockRejectedValue(STOP),
      },
    };
    const prisma = {
      $transaction: jest.fn((fn: any) => fn(tx)),
      platformSetting: { findUnique: jest.fn().mockResolvedValue(null) },
    };
    const service = new OfferService(
      prisma as any,
      { del: jest.fn(), delByPattern: jest.fn() } as any,
      { get: () => "24" } as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      undefined as any,
      {} as any,
      userBlockServiceStub() as any,
    );
    return { service, tx };
  };

  describe("buyer counter", () => {
    // The seller countered at 1000 when the listing was 1000; it is 800 now.
    const sellerCounter = { buyerMustAccept: true, amount: 1000 };

    it.each([800, 900, 999.99])(
      "refuses %p (below the seller counter, not below the new 800 TL price)",
      async (amount) => {
        const { service, tx } = build({ price: 800 }, sellerCounter);

        const error = await service
          .buyerCounter("o1", "b1", { amount })
          .catch((e: unknown) => e);

        expect(error).toBeInstanceOf(BadRequestException);
        expect(i18nKeyOf(error)).toBe("server.offer.offerMustBeBelowPrice");
        expect(tx.offer.update).not.toHaveBeenCalled();
      },
    );

    it("accepts 799.99 below the new 800 TL price", async () => {
      const { service, tx } = build({ price: 800 }, sellerCounter);

      const error = await service
        .buyerCounter("o1", "b1", { amount: 799.99 })
        .catch((e: unknown) => e);

      expect(error).toBe(STOP);
      expect(tx.offer.update).toHaveBeenCalled();
    });

    it("keeps refusing an amount at or above the seller counter first", async () => {
      const { service } = build(
        { price: 1000 },
        { ...sellerCounter, amount: 900 },
      );

      const error = await service
        .buyerCounter("o1", "b1", { amount: 900 })
        .catch((e: unknown) => e);

      expect(i18nKeyOf(error)).toBe("server.offer.buyerCounterMustBeLower");
    });

    it("refuses an amount at the seller counter as not lower before the price check", async () => {
      // Price dropped to 800 under a 1000 counter: 1000 breaks both rules,
      // the counter rule answers first.
      const { service, tx } = build({ price: 800 }, sellerCounter);

      const error = await service
        .buyerCounter("o1", "b1", { amount: 1000 })
        .catch((e: unknown) => e);

      expect(i18nKeyOf(error)).toBe("server.offer.buyerCounterMustBeLower");
      expect(tx.offer.update).not.toHaveBeenCalled();
    });

    it("is unchanged when the price did not move", async () => {
      const { service } = build(
        { price: 1000 },
        { ...sellerCounter, amount: 950 },
      );

      const error = await service
        .buyerCounter("o1", "b1", { amount: 900 })
        .catch((e: unknown) => e);

      expect(error).toBe(STOP);
    });

    it("bounds by the list price once the sale window closed", async () => {
      // Raw price 800 but the listing sells at 1000: 900 is below the price.
      const { service } = build(closedSale, sellerCounter);

      const error = await service
        .buyerCounter("o1", "b1", { amount: 900 })
        .catch((e: unknown) => e);

      expect(error).toBe(STOP);
    });

    it("bounds by the sale price while the window is open", async () => {
      const { service } = build(openSale, sellerCounter);

      const error = await service
        .buyerCounter("o1", "b1", { amount: 900 })
        .catch((e: unknown) => e);

      expect(i18nKeyOf(error)).toBe("server.offer.offerMustBeBelowPrice");
    });
  });

  describe("seller counter", () => {
    // The buyer offered 600 when the listing was 1000; it is 800 now.
    const buyerOffer = { buyerMustAccept: false, amount: 600 };

    it("may reach the new price", async () => {
      const { service, tx } = build({ price: 800 }, buyerOffer);

      const error = await service
        .counter("o1", "s1", { amount: 800 })
        .catch((e: unknown) => e);

      expect(error).toBe(STOP);
      expect(tx.offer.update).toHaveBeenCalled();
    });

    it.each([800.01, 1000])(
      "refuses %p above the new 800 TL price (the old price no longer counts)",
      async (amount) => {
        const { service, tx } = build({ price: 800 }, buyerOffer);

        const error = await service
          .counter("o1", "s1", { amount })
          .catch((e: unknown) => e);

        expect(error).toBeInstanceOf(BadRequestException);
        expect(i18nKeyOf(error)).toBe("server.offer.counterCannotExceedPrice");
        expect(tx.offer.update).not.toHaveBeenCalled();
      },
    );

    it("bounds by the list price once the sale window closed", async () => {
      const { service } = build(closedSale, buyerOffer);

      const error = await service
        .counter("o1", "s1", { amount: 1000 })
        .catch((e: unknown) => e);

      expect(error).toBe(STOP);
    });

    it("bounds by the sale price while the window is open", async () => {
      const { service } = build(openSale, buyerOffer);

      const error = await service
        .counter("o1", "s1", { amount: 900 })
        .catch((e: unknown) => e);

      expect(i18nKeyOf(error)).toBe("server.offer.counterCannotExceedPrice");
    });
  });
});

describe("OfferService.accept against the current price", () => {
  const offerPricing = {
    commission: {
      commissionAmount: 30,
      buyerFeeAmount: 10,
      sellerFeeAmount: 20,
      buyerCommissionAmount: 4,
      buyerServiceFeeAmount: 6,
      sellerCommissionAmount: 15,
      sellerPlatformFeeAmount: 5,
    },
    fullShippingAmount: 80,
    buyerShippingAmount: 80,
    sellerShippingAmount: 0,
    taxAmount: 0,
    withholdingTaxAmount: 0,
    totalAmount: 1090,
  };

  const build = (current: ProductOverrides, offer: Record<string, unknown>) => {
    const listing = product(current);
    const row = {
      id: "offer-1",
      status: OfferStatus.pending,
      amount: 1000,
      buyerMustAccept: false,
      buyerId: "buyer-1",
      sellerId: "s1",
      productId: "p1",
      version: 1,
      expiresAt: new Date(Date.now() + HOUR),
      product: listing,
      buyer: { id: "buyer-1", displayName: "B", email: "b@x.test" },
      seller: { id: "s1", displayName: "S", email: "s@x.test" },
      ...offer,
    };
    const tx: any = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: "offer-1" }]),
      offer: {
        findUnique: jest.fn().mockResolvedValue({ ...row, order: null }),
        update: jest.fn().mockResolvedValue({ ...row }),
      },
      order: {
        create: jest
          .fn()
          .mockImplementation((arg: any) =>
            Promise.resolve({ id: "order-1", ...arg.data }),
          ),
      },
    };
    const prisma = {
      $transaction: jest.fn().mockImplementation((fn: any) => fn(tx)),
      offer: { findUnique: jest.fn().mockResolvedValue({ ...row }) },
      platformSetting: { findUnique: jest.fn().mockResolvedValue(null) },
    };
    const checkoutCommon = {
      resolveOfferOrderSnapshots: jest.fn().mockResolvedValue({
        shippingTariff: { tariffId: "t1", tariffVersion: 1, tariff: {} },
        commissionRuleSet: { id: "rs-1" },
      }),
      resolveOfferOrderPricing: jest.fn().mockResolvedValue(offerPricing),
      generateOrderNumber: jest.fn().mockResolvedValue("ORD-TEST000001"),
      createSingleSellerPackage: jest
        .fn()
        .mockResolvedValue({ id: "pkg-1", packageNumber: "PKG-TEST000001" }),
      buildOfferFinancialSnapshot: jest.fn().mockReturnValue({ version: 2 }),
    };
    // The price is read only from the row the product lock returns.
    const productLock = {
      lockProductForUpdate: jest.fn().mockResolvedValue(listing),
    };
    const feeDiscounts = {
      spendBudgets: jest.fn().mockResolvedValue(undefined),
    };
    const events = { emitOfferAccepted: jest.fn() };
    const service = new OfferService(
      prisma as any,
      { del: jest.fn(), delByPattern: jest.fn() } as any,
      { get: () => undefined } as any,
      events as any,
      {
        notifyOfferAccepted: jest.fn(),
        notifyOfferCounterAccepted: jest.fn(),
      } as any,
      {} as any,
      productLock as any,
      feeDiscounts as any,
      checkoutCommon as any,
      userBlockServiceStub() as any,
    );
    return { service, tx, checkoutCommon, productLock, feeDiscounts, events };
  };

  const refusal = (error: unknown) => ({
    status: error instanceof HttpException ? error.getStatus() : undefined,
    response: error instanceof HttpException ? error.getResponse() : error,
  });

  describe("a buyer offer accepted by the seller", () => {
    it.each([
      [1000, "1000.00"],
      [900, "900.00"],
    ])(
      "is refused with 409 when the price dropped to %p",
      async (price, shown) => {
        const { service, tx } = build({ price }, { amount: 1000 });

        const error = await service
          .accept("offer-1", "s1")
          .catch((e: unknown) => e);

        expect(refusal(error)).toEqual({
          status: 409,
          response: {
            i18nKey: "server.offer.priceChangedSinceOffer",
            i18nParams: { price: shown },
          },
        });
        expect(tx.offer.update).not.toHaveBeenCalled();
        expect(tx.order.create).not.toHaveBeenCalled();
      },
    );

    it("writes nothing when refused: no offer, order, package or budget", async () => {
      const { service, tx, checkoutCommon, productLock, feeDiscounts, events } =
        build({ price: 1000 }, { amount: 1000 });

      const error = await service
        .accept("offer-1", "s1")
        .catch((e: unknown) => e);

      expect(i18nKeyOf(error)).toBe("server.offer.priceChangedSinceOffer");
      // The refused price is the one read under the product row lock.
      expect(productLock.lockProductForUpdate).toHaveBeenCalledWith(tx, "p1");
      expect(tx.offer.update).not.toHaveBeenCalled();
      expect(checkoutCommon.resolveOfferOrderPricing).not.toHaveBeenCalled();
      expect(checkoutCommon.generateOrderNumber).not.toHaveBeenCalled();
      expect(checkoutCommon.createSingleSellerPackage).not.toHaveBeenCalled();
      expect(tx.order.create).not.toHaveBeenCalled();
      expect(feeDiscounts.spendBudgets).not.toHaveBeenCalled();
      expect(events.emitOfferAccepted).not.toHaveBeenCalled();
    });

    it("reads the price from the locked row, not the offer read before it", async () => {
      // The offer read carries a stale 1200 listing; the locked row is 1000.
      const { service, tx } = build({ price: 1000 }, { amount: 1000 });
      tx.offer.findUnique.mockResolvedValue({
        ...(await tx.offer.findUnique()),
        product: product({ price: 1200 }),
      });

      const error = await service
        .accept("offer-1", "s1")
        .catch((e: unknown) => e);

      expect(i18nKeyOf(error)).toBe("server.offer.priceChangedSinceOffer");
    });

    it("accepts 0.01 below the price", async () => {
      const { service, tx } = build({ price: 1000.01 }, { amount: 1000 });

      await service.accept("offer-1", "s1");

      expect(tx.order.create).toHaveBeenCalledTimes(1);
    });

    it("is accepted when the price stayed above it, freezing that price", async () => {
      const { service, tx, checkoutCommon } = build(
        { price: 1200 },
        { amount: 1000 },
      );

      await service.accept("offer-1", "s1");

      expect(tx.order.create).toHaveBeenCalledTimes(1);
      expect(checkoutCommon.buildOfferFinancialSnapshot).toHaveBeenCalledWith(
        expect.objectContaining({ amount: 1000, listingUnitPrice: 1200 }),
      );
    });

    it("bounds by the list price once the sale window closed", async () => {
      // Raw price 800, sells at 1000: a 900 offer is still below the price,
      // and the frozen listing price is the 1000 it sells at.
      const { service, tx, checkoutCommon } = build(closedSale, {
        amount: 900,
      });

      await service.accept("offer-1", "s1");

      expect(tx.order.create).toHaveBeenCalledTimes(1);
      expect(checkoutCommon.buildOfferFinancialSnapshot).toHaveBeenCalledWith(
        expect.objectContaining({ listingUnitPrice: 1000 }),
      );
    });

    it("is refused while a sale window brings the price to the offer", async () => {
      const { service, tx } = build(openSale, { amount: 900 });

      const error = await service
        .accept("offer-1", "s1")
        .catch((e: unknown) => e);

      expect(i18nKeyOf(error)).toBe("server.offer.priceChangedSinceOffer");
      expect(tx.order.create).not.toHaveBeenCalled();
    });
  });

  describe("a seller counter accepted by the buyer", () => {
    const counter = { buyerMustAccept: true, amount: 1000 };

    it("is accepted at exactly the price (the seller may reach it)", async () => {
      const { service, tx } = build({ price: 1000 }, counter);

      await service.accept("offer-1", "buyer-1");

      expect(tx.order.create).toHaveBeenCalledTimes(1);
      expect(tx.order.create.mock.calls[0][0].data.unitPrice).toBe(1000);
    });

    it("is refused with 409 when the price dropped below it", async () => {
      const { service, tx } = build({ price: 999.99 }, counter);

      const error = await service
        .accept("offer-1", "buyer-1")
        .catch((e: unknown) => e);

      expect(refusal(error)).toEqual({
        status: 409,
        response: {
          i18nKey: "server.offer.priceChangedSinceOffer",
          i18nParams: { price: "999.99" },
        },
      });
      expect(tx.offer.update).not.toHaveBeenCalled();
      expect(tx.order.create).not.toHaveBeenCalled();
    });
  });
});

/** The offer payload serves the same price the server bounds against. */
describe("OfferService offer payload price", () => {
  it("serves the current sale price, not the raw column", async () => {
    const offer = {
      id: "o1",
      amount: 700,
      status: OfferStatus.pending,
      buyerMustAccept: false,
      expiresAt: new Date(Date.now() + HOUR),
      product: product(closedSale),
      buyer: { id: "b1", displayName: "B" },
      seller: { id: "s1", displayName: "S" },
    };
    const service = new OfferService(
      {} as any,
      {} as any,
      { get: () => undefined } as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      undefined as any,
      {} as any,
      userBlockServiceStub() as any,
    );

    const payload = await (service as any).formatOfferResponse(offer);

    expect(payload.product.price).toBe(1000);
  });

  it("serves the discounted price while the sale window is open", async () => {
    const service = new OfferService(
      {} as any,
      {} as any,
      { get: () => undefined } as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      undefined as any,
      {} as any,
      userBlockServiceStub() as any,
    );

    const payload = await (service as any).formatOfferResponse({
      id: "o1",
      amount: 700,
      status: OfferStatus.pending,
      buyerMustAccept: false,
      expiresAt: new Date(Date.now() + HOUR),
      product: product(openSale),
      buyer: { id: "b1", displayName: "B" },
      seller: { id: "s1", displayName: "S" },
    });

    expect(payload.product.price).toBe(800);
  });
});
