/**
 * Request/response shapes for the system domain module (`./system`).
 *
 * Test Tools — shipment simulation (UAT). Mirrors
 * `apps/api/src/modules/admin-test-tools/shipment-simulation.service.ts`.
 */

export type SimulationTargetKind =
  "order_shipment" | "refund_return" | "trade_shipment";

/** Carrier event a tester can trigger: parcel handed over / delivered. */
export type SimulatedCarrierStep = "picked_up" | "delivered";

export interface SimulatableParcel {
  kind: SimulationTargetKind;
  /** Shipment / RefundRequest / TradeShipment id. */
  id: string;
  /** Order no (ORD-), refund no or trade no (TKS-). */
  reference: string;
  /** Our carrier query reference (PKG-…, refund no, trade leg ref). */
  trackingNumber: string | null;
  /** Carrier code (STUB… on stub cargo, TEST… on the test lane). */
  carrierCode: string | null;
  /** ShipmentStatus; null for a return label not opened yet. */
  status: string | null;
  /** Owner status: order / refund request / trade. */
  ownerStatus: string;
  /** Trade legs only: to_warehouse / from_warehouse / return. */
  leg: string | null;
  isTest: boolean;
  shippedAt: string | null;
  deliveredAt: string | null;
  /** Steps the real tracking path would still accept. */
  nextSteps: SimulatedCarrierStep[];
}

export interface SimulateShipmentPayload {
  kind: SimulationTargetKind;
  id: string;
  step: SimulatedCarrierStep;
}

export interface ShipmentSimulationResult {
  /** Whether the real tracking core wrote anything for this reading. */
  applied: boolean;
  before: SimulatableParcel;
  after: SimulatableParcel;
}
