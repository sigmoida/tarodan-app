import { OrderStatus, ShipmentStatus } from "@prisma/client";
import { RefundService } from "./refund.service";

/**
 * classifyOrderPhase, siparişin yaşam evresine göre iade türünü belirler.
 *
 * Kritik regresyon: teslimat sonrası 48 saatlik alıcı onay penceresinde sipariş
 * `awaiting_buyer_confirmation` durumunda kalır (shipping.worker delivered →
 * awaiting_buyer_confirmation). Bu durum eskiden ele alınmadığından phase
 * 'unknown' dönüyor ve alıcı teslim aldığı siparişe iade açamıyordu.
 *
 * Ayrıca teslim tarihi order.deliveredAt'e yazılır; shipment.deliveredAt track
 * güncellemesinde set edilmez. Bu yüzden order.deliveredAt birincil kaynaktır.
 */
describe("RefundService.classifyOrderPhase", () => {
  const service = new RefundService(
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {
      appendHistory: jest.fn(),
      safeNotify: jest.fn(),
      notifyRefundRequestOpened: jest.fn(),
      sendRefundEmail: jest.fn(),
      toProductImageUrls: jest.fn().mockReturnValue([]),
    } as any,
  );

  const classify = (order: any): string =>
    (service as any).classifyOrderPhase(order);

  const daysAgo = (n: number) => new Date(Date.now() - n * 24 * 3600 * 1000);

  it("awaiting_buyer_confirmation (yeni teslim) → in_cooling_off", () => {
    expect(
      classify({
        status: OrderStatus.awaiting_buyer_confirmation,
        deliveredAt: daysAgo(1),
        shipment: { status: ShipmentStatus.delivered, deliveredAt: null },
      }),
    ).toBe("in_cooling_off");
  });

  it("awaiting_buyer_confirmation (14 gün geçmiş) → past_cooling_off", () => {
    expect(
      classify({
        status: OrderStatus.awaiting_buyer_confirmation,
        deliveredAt: daysAgo(20),
        shipment: { status: ShipmentStatus.delivered, deliveredAt: null },
      }),
    ).toBe("past_cooling_off");
  });

  it("delivered durumunda teslim tarihi order.deliveredAt üzerinden okunur", () => {
    expect(
      classify({
        status: OrderStatus.delivered,
        deliveredAt: daysAgo(20),
        shipment: { status: ShipmentStatus.delivered, deliveredAt: null },
      }),
    ).toBe("past_cooling_off");
  });

  it("completed (yeni teslim) → in_cooling_off", () => {
    expect(
      classify({
        status: OrderStatus.completed,
        deliveredAt: daysAgo(2),
        shipment: { status: ShipmentStatus.delivered, deliveredAt: null },
      }),
    ).toBe("in_cooling_off");
  });

  it("label_created fiziksel teslim değildir → preparing", () => {
    expect(
      classify({
        status: OrderStatus.preparing,
        deliveredAt: null,
        shipment: {
          status: ShipmentStatus.label_created,
          deliveredAt: null,
        },
      }),
    ).toBe("preparing");
  });

  it("shippedAt mühürlü koli (statü pending kalsa bile) anında iadeye kapalıdır → in_cooling_off", () => {
    // Sürat bilinmeyen durum kodu döndürdüğünde poller statüyü değiştirmeden
    // shippedAt yazar; devir tanımı iptal kapılarıyla AYNI tek kaynaktan okunur.
    expect(
      classify({
        status: OrderStatus.preparing,
        deliveredAt: null,
        shipment: {
          status: ShipmentStatus.pending,
          deliveredAt: null,
          shippedAt: daysAgo(1),
        },
      }),
    ).toBe("in_cooling_off");
  });

  it("hareket eden koli (in_transit) anında iadeye kapalıdır → in_cooling_off", () => {
    expect(
      classify({
        status: OrderStatus.preparing,
        deliveredAt: null,
        shipment: {
          status: ShipmentStatus.in_transit,
          deliveredAt: null,
        },
      }),
    ).toBe("in_cooling_off");
  });
});
