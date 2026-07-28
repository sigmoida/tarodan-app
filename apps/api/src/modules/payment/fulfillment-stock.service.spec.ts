import { FulfillmentStockService } from "./fulfillment-stock.service";

/**
 * Karakterizasyon: stok düşümü + stockout kaskadı (god-service'ten çıkarılan mantık aynen).
 * - clamp'li düşüm (negatif stok yok), reserved düşümü
 * - kaskad yalnız FİZİKSEL quantity<=0'da (available q-r üzerinden DEĞİL)
 */
describe("FulfillmentStockService.decrementForOrder", () => {
  function makeTx(product: any, refreshed: any) {
    const update = jest.fn().mockResolvedValue({});
    return {
      tx: {
        $queryRaw: jest.fn().mockResolvedValue([]),
        product: {
          findUnique: jest
            .fn()
            .mockResolvedValueOnce(product) // ilk fetch
            .mockResolvedValueOnce(refreshed), // refreshed fetch
          update,
        },
      } as any,
      update,
    };
  }

  const lock = () => ({
    invalidatePendingOrdersForProduct: jest
      .fn()
      .mockResolvedValue({ cancelledOrders: [] }),
    invalidateRelatedOffers: jest
      .fn()
      .mockResolvedValue({ rejectedOffers: [] }),
  });

  it("stok kalınca (q=2→1) kaskad YOK, stockoutCategoryId undefined", async () => {
    const productLock = lock() as any;
    const { tx, update } = makeTx(
      { quantity: 2, reservedQuantity: 1 },
      { quantity: 1, reservedQuantity: 0, categoryId: "c1" },
    );
    const svc = new FulfillmentStockService(productLock);

    const r = await svc.decrementForOrder(tx, "p1", 1);

    expect(update).toHaveBeenCalledWith({
      where: { id: "p1" },
      data: expect.objectContaining({ quantity: 1 }),
    });
    expect(r.stockoutCategoryId).toBeUndefined();
    expect(
      productLock.invalidatePendingOrdersForProduct,
    ).not.toHaveBeenCalled();
    expect(r.cancelledOrders).toHaveLength(0);
  });

  it("stok bitince (q=1→0) kaskad ÇALIŞIR, stockoutCategoryId set", async () => {
    const productLock = lock() as any;
    productLock.invalidatePendingOrdersForProduct.mockResolvedValue({
      cancelledOrders: [
        {
          orderId: "o9",
          buyerId: "b9",
          productId: "p1",
          productTitle: "X",
          offerId: null,
          hadPayment: true,
        },
      ],
    });
    const { tx } = makeTx(
      { quantity: 1, reservedQuantity: 1 },
      { quantity: 0, reservedQuantity: 0, categoryId: "cat-1" },
    );
    const svc = new FulfillmentStockService(productLock);

    const r = await svc.decrementForOrder(tx, "p1", 1);

    expect(r.stockoutCategoryId).toBe("cat-1");
    expect(productLock.invalidatePendingOrdersForProduct).toHaveBeenCalled();
    expect(r.cancelledOrders).toHaveLength(1);
    expect(r.cancelledOrders[0].orderId).toBe("o9");
  });

  it("oversell'de fiziksel stok tüketilmez; yalnız rezervasyon bırakılır", async () => {
    const productLock = lock() as any;
    const { tx, update } = makeTx(
      { quantity: 1, reservedQuantity: 3 },
      { quantity: 0, reservedQuantity: 0, categoryId: null },
    );
    const svc = new FulfillmentStockService(productLock);

    const r = await svc.decrementForOrder(tx, "p1", 3);

    expect(update.mock.calls[0][0].data.quantity).toBeUndefined();
    expect(update.mock.calls[0][0].data.reservedQuantity).toBe(0);
    expect(r.oversold).toEqual({ productId: "p1", paidQty: 3, physicalQty: 1 });
    expect(
      productLock.invalidatePendingOrdersForProduct,
    ).not.toHaveBeenCalled();
  });

  it("stok yeterliyse oversold undefined (yanlış-pozitif yok)", async () => {
    const productLock = lock() as any;
    const { tx } = makeTx(
      { quantity: 5, reservedQuantity: 2 },
      { quantity: 3, reservedQuantity: 1, categoryId: null },
    );
    const svc = new FulfillmentStockService(productLock);

    const r = await svc.decrementForOrder(tx, "p1", 2);

    expect(r.oversold).toBeUndefined();
  });
});
