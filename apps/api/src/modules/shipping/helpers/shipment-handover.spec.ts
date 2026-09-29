import { OrderStatus, ShipmentStatus } from "@prisma/client";
import {
  PRE_SHIPMENT_CANCELLABLE_ORDER_STATUSES,
  isPreShipmentCancellable,
  preShipmentCancelBlocker,
} from "@tarodan/types";
import { SHIPPABLE_ORDER_STATUSES } from "../../order/helpers/order-state-machine";
import {
  SHIPMENT_IN_MOTION_STATUSES,
  isShipmentHandedToCarrier,
} from "./shipment-handover";

/**
 * "Kargoya verildi" tanımı ve kargo öncesi iptal uygunluğu `@tarodan/types`'ta
 * TEK kaynaktır: API iptal kapıları ve admin panelinin "Siparişi iptal et"
 * düğmesi aynı kuralı okur. Bu spec kuralı Prisma enum'larına karşı sabitler.
 */
describe("kargoya devir tanımı", () => {
  it("hareket eden durumlar devirdir; pending/label_created/cancelled/failed değildir", () => {
    for (const status of Object.values(ShipmentStatus)) {
      const expected = SHIPMENT_IN_MOTION_STATUSES.includes(status);
      expect(isShipmentHandedToCarrier({ status, shippedAt: null })).toBe(
        expected,
      );
    }
    expect(SHIPMENT_IN_MOTION_STATUSES).not.toContain(ShipmentStatus.pending);
    expect(SHIPMENT_IN_MOTION_STATUSES).not.toContain(
      ShipmentStatus.label_created,
    );
  });

  it("shippedAt mührü tek başına devirdir (bilinmeyen Sürat kodu)", () => {
    expect(
      isShipmentHandedToCarrier({
        status: ShipmentStatus.label_created,
        shippedAt: new Date(),
      }),
    ).toBe(true);
  });

  it("kargo kaydı yoksa devir yoktur", () => {
    expect(isShipmentHandedToCarrier(null)).toBe(false);
  });
});

describe("kargo öncesi iptal uygunluğu (preShipmentCancelBlocker)", () => {
  it("iptal aralığı kargoya verilebilir statülerle aynıdır", () => {
    expect([...PRE_SHIPMENT_CANCELLABLE_ORDER_STATUSES].sort()).toEqual(
      [...SHIPPABLE_ORDER_STATUSES].sort(),
    );
  });

  it.each([
    [OrderStatus.paid, null, null],
    [OrderStatus.preparing, null, null],
    [
      OrderStatus.preparing,
      { status: ShipmentStatus.label_created, shippedAt: null },
      null,
    ],
    [OrderStatus.pending_payment, null, "not_paid"],
    [OrderStatus.cancelled, null, "closed"],
    [OrderStatus.refunded, null, "closed"],
    [OrderStatus.refund_requested, null, "active_refund"],
    [OrderStatus.shipped, null, "handed_over"],
    [OrderStatus.delivered, null, "handed_over"],
    [OrderStatus.awaiting_buyer_confirmation, null, "handed_over"],
    [OrderStatus.completed, null, "handed_over"],
    [
      OrderStatus.preparing,
      { status: ShipmentStatus.in_transit, shippedAt: null },
      "handed_over",
    ],
    [
      OrderStatus.paid,
      { status: ShipmentStatus.pending, shippedAt: new Date() },
      "handed_over",
    ],
  ])("%s + %j → %s", (status, shipment, blocker) => {
    expect(preShipmentCancelBlocker({ status, shipment })).toBe(blocker);
    expect(isPreShipmentCancellable({ status, shipment })).toBe(
      blocker === null,
    );
  });

  it("kargo öncesi açık talep = yarıda kalmış iptal (elle tamamlanmayı bekler)", () => {
    for (const status of [OrderStatus.paid, OrderStatus.preparing]) {
      expect(
        preShipmentCancelBlocker({
          status,
          shipment: null,
          hasActiveRefund: true,
        }),
      ).toBe("pending_cancellation");
    }
  });

  it("devir, açık talepten önce gelir (kargodaki sipariş iade akışındadır)", () => {
    expect(
      preShipmentCancelBlocker({
        status: OrderStatus.preparing,
        shipment: { status: ShipmentStatus.picked_up, shippedAt: null },
        hasActiveRefund: true,
      }),
    ).toBe("handed_over");
  });

  it("her OrderStatus değeri için bir karar verir (yeni statü sessiz kalmaz)", () => {
    for (const status of Object.values(OrderStatus)) {
      const blocker = preShipmentCancelBlocker({ status, shipment: null });
      expect([
        null,
        "not_paid",
        "closed",
        "active_refund",
        "pending_cancellation",
        "handed_over",
      ]).toContain(blocker);
    }
  });
});
