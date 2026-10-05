import {
  type OrderStatus,
  type RefundRequestStatus,
  ShipmentStatus,
  type TradeStatus,
} from "@prisma/client";
import {
  canTransitionShipmentStatus,
  isTerminalShipmentStatus,
} from "../../shipping/helpers/shipment-state-machine";
import { NON_DELIVERABLE_ORDER_STATUSES } from "../../order/helpers/order-state-machine";
import { TRADE_VALID_TRANSITIONS } from "../../trade/helpers/trade.state-machine";
import { ACTIVE_RETURN_REFUND_STATUSES } from "../../surat-cargo/sync/refund-return-tracking-sync.service";
import type { SimulatedCarrierStep } from "../../surat-cargo/helpers/surat-simulated-reading";

/**
 * Test Araçları kargo simülasyonu — hangi koliye hangi adımın SUNULACAĞI.
 *
 * Bu yalnız bir ön eleme: düğmeyi gösterip göstermemek ve anlamsız bir isteği
 * erkenden reddetmek için. Asıl kural yine gerçek okuma çekirdeğindedir (durum
 * makinesi, CAS, teslim işleyicisinin statü koşulu); simülasyon onları
 * atlamaz, yalnız önlerine geçer. Buradaki her kural o çekirdekteki bir
 * listeyi okur — yeni bir kural yazılmaz:
 *   - koli: durum makinesi (`canTransitionShipmentStatus`, terminal statüler)
 *   - sipariş: teslim işleyicisinin dışladığı statüler
 *   - iade: iade poller'ının taradığı talep statüleri
 *   - takas: takas durum makinesinde çıkışı olmayan (kapanmış) statüler
 */

export const SIMULATION_TARGET_KINDS = [
  "order_shipment",
  "refund_return",
  "trade_shipment",
] as const;
export type SimulationTargetKind = (typeof SIMULATION_TARGET_KINDS)[number];

/** Koli henüz taşıyıcıya verilmemişken bulunabileceği statüler. */
const PRE_HANDOVER_STATUSES: ReadonlySet<ShipmentStatus> = new Set([
  ShipmentStatus.pending,
  ShipmentStatus.label_created,
]);

export type SimulationSnapshot =
  | {
      kind: "order_shipment";
      status: ShipmentStatus;
      shippedAt: Date | null;
      trackingNumber: string | null;
      ownerStatus: OrderStatus;
    }
  | {
      kind: "refund_return";
      /** İade dönüşünde etiket açılana dek null olabilir. */
      status: ShipmentStatus | null;
      shippedAt: Date | null;
      trackingNumber: string | null;
      ownerStatus: RefundRequestStatus;
    }
  | {
      kind: "trade_shipment";
      status: ShipmentStatus;
      shippedAt: Date | null;
      trackingNumber: string | null;
      ownerStatus: TradeStatus;
    };

/** Kolinin sahibi (sipariş / iade talebi / takas) hâlâ kargo hareketini kabul ediyor mu. */
function isOwnerOpen(snapshot: SimulationSnapshot): boolean {
  switch (snapshot.kind) {
    case "order_shipment":
      return !NON_DELIVERABLE_ORDER_STATUSES.includes(snapshot.ownerStatus);
    case "refund_return":
      return ACTIVE_RETURN_REFUND_STATUSES.includes(snapshot.ownerStatus);
    case "trade_shipment":
      return TRADE_VALID_TRANSITIONS[snapshot.ownerStatus].length > 0;
  }
}

/**
 * "Teslim" okumasının yazdığı koli statüsü. İade dönüşünde satıcıya teslim
 * `returned` olarak yazılır (iade senkronu böyle çevirir), diğerlerinde
 * `delivered`.
 */
function deliveredStatusOf(kind: SimulationTargetKind): ShipmentStatus {
  return kind === "refund_return"
    ? ShipmentStatus.returned
    : ShipmentStatus.delivered;
}

export function nextSimulationSteps(
  snapshot: SimulationSnapshot,
): SimulatedCarrierStep[] {
  // Poller da sorgu referansı olmayan koliyi sormaz.
  if (!snapshot.trackingNumber) return [];
  if (!isOwnerOpen(snapshot)) return [];
  const current = snapshot.status ?? ShipmentStatus.label_created;
  if (isTerminalShipmentStatus(current)) return [];

  const steps: SimulatedCarrierStep[] = [];
  if (!snapshot.shippedAt && PRE_HANDOVER_STATUSES.has(current)) {
    steps.push("picked_up");
  }
  if (canTransitionShipmentStatus(current, deliveredStatusOf(snapshot.kind))) {
    steps.push("delivered");
  }
  return steps;
}
