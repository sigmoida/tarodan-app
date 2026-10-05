import {
  OrderStatus,
  RefundRequestStatus,
  ShipmentStatus,
  TradeStatus,
} from "@prisma/client";
import { nextSimulationSteps } from "./shipment-simulation.helper";

/**
 * Simülasyon yalnız gerçekte mümkün olan adımı sunar. Kurallar yeni değil:
 * her biri gerçek okuma çekirdeğinin okuduğu listeden gelir.
 */
describe("nextSimulationSteps", () => {
  const order = (
    status: ShipmentStatus,
    ownerStatus: OrderStatus = OrderStatus.preparing,
    shippedAt: Date | null = null,
  ) =>
    ({
      kind: "order_shipment",
      status,
      shippedAt,
      trackingNumber: "PKG-1",
      ownerStatus,
    }) as const;

  describe("order shipment", () => {
    it("offers pickup and delivery for a labelled, not yet handed-over parcel", () => {
      expect(nextSimulationSteps(order(ShipmentStatus.label_created))).toEqual([
        "picked_up",
        "delivered",
      ]);
    });

    it("offers only delivery once the parcel is moving", () => {
      expect(
        nextSimulationSteps(
          order(
            ShipmentStatus.picked_up,
            OrderStatus.shipped,
            new Date("2026-10-05T10:00:00Z"),
          ),
        ),
      ).toEqual(["delivered"]);
    });

    it("offers nothing for a terminal parcel", () => {
      for (const status of [
        ShipmentStatus.delivered,
        ShipmentStatus.returned,
        ShipmentStatus.cancelled,
      ]) {
        expect(nextSimulationSteps(order(status, OrderStatus.shipped))).toEqual(
          [],
        );
      }
    });

    it("refuses to move a parcel of a cancelled, refunded or closed order", () => {
      for (const ownerStatus of [
        OrderStatus.cancelled,
        OrderStatus.refunded,
        OrderStatus.refund_requested,
        OrderStatus.completed,
      ]) {
        expect(
          nextSimulationSteps(order(ShipmentStatus.in_transit, ownerStatus)),
        ).toEqual([]);
      }
    });

    it("offers nothing without a carrier query reference (the poller would not ask either)", () => {
      expect(
        nextSimulationSteps({
          ...order(ShipmentStatus.pending),
          trackingNumber: null,
        }),
      ).toEqual([]);
    });
  });

  describe("refund return", () => {
    const refund = (
      status: ShipmentStatus | null,
      ownerStatus: RefundRequestStatus,
      shippedAt: Date | null = null,
    ) =>
      ({
        kind: "refund_return",
        status,
        shippedAt,
        trackingNumber: "RF-1",
        ownerStatus,
      }) as const;

    it("offers handover and delivery for an opened return label", () => {
      expect(
        nextSimulationSteps(
          refund(
            ShipmentStatus.label_created,
            RefundRequestStatus.return_shipment_open,
          ),
        ),
      ).toEqual(["picked_up", "delivered"]);
    });

    it("offers delivery to the seller for a return in transit", () => {
      expect(
        nextSimulationSteps(
          refund(
            ShipmentStatus.picked_up,
            RefundRequestStatus.return_in_transit,
            new Date(),
          ),
        ),
      ).toEqual(["delivered"]);
    });

    it("offers nothing once the return was delivered or the refund closed", () => {
      expect(
        nextSimulationSteps(
          refund(ShipmentStatus.returned, RefundRequestStatus.return_delivered),
        ),
      ).toEqual([]);
      expect(
        nextSimulationSteps(
          refund(ShipmentStatus.picked_up, RefundRequestStatus.cancelled),
        ),
      ).toEqual([]);
    });
  });

  describe("trade leg", () => {
    const leg = (
      status: ShipmentStatus,
      ownerStatus: TradeStatus,
      shippedAt: Date | null = null,
    ) =>
      ({
        kind: "trade_shipment",
        status,
        shippedAt,
        trackingNumber: "TKS-LEG-1",
        ownerStatus,
      }) as const;

    it("offers both steps on an open trade", () => {
      expect(
        nextSimulationSteps(
          leg(ShipmentStatus.label_created, TradeStatus.shipping_to_warehouse),
        ),
      ).toEqual(["picked_up", "delivered"]);
    });

    it("offers nothing on a closed trade", () => {
      for (const ownerStatus of [
        TradeStatus.cancelled,
        TradeStatus.completed,
        TradeStatus.rejected,
      ]) {
        expect(
          nextSimulationSteps(leg(ShipmentStatus.in_transit, ownerStatus)),
        ).toEqual([]);
      }
    });
  });
});
