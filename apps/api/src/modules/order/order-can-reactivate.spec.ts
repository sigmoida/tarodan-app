import { OfferStatus, OrderStatus } from "@prisma/client";
import { OrderCommonService } from "./order-common.service";

/**
 * "Ödemeyi tamamla" bayrağı ile `reactivate()` ucu AYNI kuralı okumalıdır.
 *
 * Uç, O8 düzeltmesiyle `accepted` VE `payment_expired` teklifleri kabul ediyor;
 * bayrak yalnız `accepted` arıyordu. 24 saatlik ödeme penceresi cron'u teklifi
 * her zaman `payment_expired` yaptığı için buton, tam da var olma sebebi olan
 * senaryoda hiç görünmüyordu (uç çalışır ama hiçbir ekran çağırmaz).
 */
describe("OrderCommonService — canReactivate", () => {
  const service = new OrderCommonService(
    {} as any,
    {} as any,
    undefined as any,
  );
  const compute = (order: any, userId: string): boolean =>
    (service as any).computeCanReactivate(order, userId);

  const baseOrder = {
    status: OrderStatus.cancelled,
    buyerId: "buyer-1",
    offerId: "offer-1",
    product: { quantity: 3, reservedQuantity: 0 },
  };

  it("ödeme penceresi kaçmış teklif siparişinde açıktır", () => {
    expect(
      compute(
        { ...baseOrder, offer: { status: OfferStatus.payment_expired } },
        "buyer-1",
      ),
    ).toBe(true);
  });

  it("teklif hâlâ accepted ise de açıktır", () => {
    expect(
      compute(
        { ...baseOrder, offer: { status: OfferStatus.accepted } },
        "buyer-1",
      ),
    ).toBe(true);
  });

  it("alıcının kendi iptalinde (cancelled teklif) kapalıdır", () => {
    expect(
      compute(
        { ...baseOrder, offer: { status: OfferStatus.cancelled } },
        "buyer-1",
      ),
    ).toBe(false);
  });

  it("stok kalmadıysa kapalıdır", () => {
    expect(
      compute(
        {
          ...baseOrder,
          offer: { status: OfferStatus.payment_expired },
          product: { quantity: 1, reservedQuantity: 1 },
        },
        "buyer-1",
      ),
    ).toBe(false);
  });

  it("alıcı olmayan kullanıcıya kapalıdır", () => {
    expect(
      compute(
        { ...baseOrder, offer: { status: OfferStatus.payment_expired } },
        "seller-1",
      ),
    ).toBe(false);
  });
});
