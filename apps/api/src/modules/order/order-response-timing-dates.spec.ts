import { OrderCommonService } from "./order-common.service";

/**
 * Sipariş yanıtı süre tarihlerini SUNUCU değeri olarak taşır: iade penceresinin
 * damgalı sonu (`returnWindowEndsAt`) ve satıcı ödemesinin planlanan tarihi
 * (`escrowReleaseAt`). Web/mobil `deliveredAt + N gün` diye kendileri hesaplarsa
 * admin pencereyi değiştirdiğinde API'nin kabul ettiği iadeyi gizler ya da
 * yanlış ödeme tarihi gösterir.
 */
describe("formatOrderResponse timing dates", () => {
  const makeService = () =>
    new OrderCommonService(
      { productRating: {}, rating: {} } as any,
      { del: jest.fn(), delPattern: jest.fn() } as any,
      { getPublicAssetUrl: (k: string) => `https://cdn/${k}` } as any,
    );

  const baseOrder = {
    id: "order-1",
    orderNumber: "ORD-1",
    status: "delivered",
    buyerId: "buyer-1",
    sellerId: "seller-1",
    totalAmount: 100,
    buyer: { id: "buyer-1", username: "alici" },
    seller: { id: "seller-1", username: "satici" },
  };

  it("damgalı iade penceresi sonunu ve bekleyen hold tarihini döner", async () => {
    const windowEnd = new Date("2026-10-15T10:00:00.000Z");
    const releaseAt = new Date("2026-10-16T10:00:00.000Z");

    const result = await makeService().formatOrderResponse(
      {
        ...baseOrder,
        returnWindowEndsAt: windowEnd,
        paymentHolds: [{ status: "held", releaseAt }],
      },
      "buyer-1",
    );

    expect(result.returnWindowEndsAt).toBe(windowEnd);
    expect(result.escrowReleaseAt).toBe(releaseAt);
  });

  it("damgadan önce teslim edilmiş siparişte ikisi de null (istemci geri düşer)", async () => {
    const result = await makeService().formatOrderResponse(
      { ...baseOrder },
      "buyer-1",
    );

    expect(result.returnWindowEndsAt).toBeNull();
    expect(result.escrowReleaseAt).toBeNull();
  });

  it("serbest bırakılmış hold için ödeme tarihi vaat etmez", async () => {
    const result = await makeService().formatOrderResponse(
      {
        ...baseOrder,
        paymentHolds: [
          {
            status: "released",
            releaseAt: new Date("2026-10-16T10:00:00.000Z"),
          },
        ],
      },
      "buyer-1",
    );

    expect(result.escrowReleaseAt).toBeNull();
  });
});
