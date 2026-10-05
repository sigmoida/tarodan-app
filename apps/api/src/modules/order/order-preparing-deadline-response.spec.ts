import { OrderCommonService } from "./order-common.service";

/**
 * Sipariş yanıtı satıcının kargoya verme son tarihini ve tek seferlik
 * uzatmanın kullanılıp kullanılmadığını taşır. Uzatmada son tarih kolonun
 * kendisine yazıldığı için ekranlar ayrıca hesap yapmaz: gösterilen tarih her
 * zaman geçerli (gerekirse uzatılmış) son tarihtir.
 */
describe("formatOrderResponse preparing deadline", () => {
  const makeService = () =>
    new OrderCommonService(
      { productRating: {}, rating: {} } as never,
      { del: jest.fn(), delPattern: jest.fn() } as never,
      { getPublicAssetUrl: (k: string) => `https://cdn/${k}` } as never,
    );

  const baseOrder = {
    id: "order-1",
    orderNumber: "ORD-1",
    status: "preparing",
    buyerId: "buyer-1",
    sellerId: "seller-1",
    totalAmount: 100,
    buyer: { id: "buyer-1", username: "alici" },
    seller: { id: "seller-1", username: "satici" },
  };

  it("returns the extended deadline and when the extension was granted", async () => {
    const deadline = new Date("2026-10-10T09:00:00.000Z");
    const extendedAt = new Date("2026-10-07T09:00:00.000Z");
    const result = await makeService().formatOrderResponse(
      {
        ...baseOrder,
        preparingDeadline: deadline,
        preparingExtendedAt: extendedAt,
        originalPreparingDeadline: new Date("2026-10-07T08:00:00.000Z"),
      },
      "buyer-1",
    );

    expect(result.preparingDeadline).toEqual(deadline);
    expect(result.preparingExtendedAt).toEqual(extendedAt);
  });

  it("reports no extension for an order that was never extended", async () => {
    const result = await makeService().formatOrderResponse(
      { ...baseOrder, preparingDeadline: null },
      "seller-1",
    );

    expect(result.preparingDeadline).toBeNull();
    expect(result.preparingExtendedAt).toBeNull();
  });
});
