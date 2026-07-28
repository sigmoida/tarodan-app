import { ShipmentStatus } from "@prisma/client";

/**
 * #86: single source of truth for shipment status transitions. Four independent
 * writers (manual seller update, provider webhook, Sürat poll, worker) used to
 * blind-write `Shipment.status` with no coordination, so out-of-order carrier
 * events or a manual re-submit could regress a shipment — e.g. `delivered →
 * picked_up`, which is money-critical because escrow release keys on `delivered`.
 *
 * Carrier updates may skip intermediate states and a failed delivery may return
 * to a branch. The explicit graph allows those branches while rejecting lifecycle
 * regressions such as `in_transit -> pending` and leaving a return flow.
 */
export const TERMINAL_SHIPMENT_STATUSES: ReadonlySet<ShipmentStatus> = new Set([
  ShipmentStatus.delivered,
  ShipmentStatus.returned,
  ShipmentStatus.cancelled,
]);

export function isTerminalShipmentStatus(status: ShipmentStatus): boolean {
  return TERMINAL_SHIPMENT_STATUSES.has(status);
}

/** Whether a shipment may move from `from` to `to`. See the policy note above. */
export function canTransitionShipmentStatus(
  from: ShipmentStatus,
  to: ShipmentStatus,
): boolean {
  if (from === to) return true;

  const transitions: Record<ShipmentStatus, readonly ShipmentStatus[]> = {
    [ShipmentStatus.pending]: [
      ShipmentStatus.label_created,
      ShipmentStatus.picked_up,
      ShipmentStatus.in_transit,
      ShipmentStatus.at_delivery_branch,
      ShipmentStatus.out_for_delivery,
      ShipmentStatus.delivered,
      ShipmentStatus.failed,
      ShipmentStatus.return_in_progress,
      ShipmentStatus.returned,
      ShipmentStatus.cancelled,
    ],
    [ShipmentStatus.label_created]: [
      ShipmentStatus.picked_up,
      ShipmentStatus.in_transit,
      ShipmentStatus.at_delivery_branch,
      ShipmentStatus.out_for_delivery,
      ShipmentStatus.delivered,
      ShipmentStatus.failed,
      ShipmentStatus.return_in_progress,
      ShipmentStatus.returned,
      ShipmentStatus.cancelled,
    ],
    [ShipmentStatus.picked_up]: [
      ShipmentStatus.in_transit,
      ShipmentStatus.at_delivery_branch,
      ShipmentStatus.out_for_delivery,
      ShipmentStatus.delivered,
      ShipmentStatus.failed,
      ShipmentStatus.return_in_progress,
      ShipmentStatus.returned,
    ],
    [ShipmentStatus.in_transit]: [
      ShipmentStatus.at_delivery_branch,
      ShipmentStatus.out_for_delivery,
      ShipmentStatus.delivered,
      ShipmentStatus.failed,
      ShipmentStatus.return_in_progress,
      ShipmentStatus.returned,
    ],
    [ShipmentStatus.at_delivery_branch]: [
      ShipmentStatus.in_transit,
      ShipmentStatus.out_for_delivery,
      ShipmentStatus.delivered,
      ShipmentStatus.failed,
      ShipmentStatus.return_in_progress,
      ShipmentStatus.returned,
    ],
    [ShipmentStatus.out_for_delivery]: [
      ShipmentStatus.in_transit,
      ShipmentStatus.at_delivery_branch,
      ShipmentStatus.delivered,
      ShipmentStatus.failed,
      ShipmentStatus.return_in_progress,
      ShipmentStatus.returned,
    ],
    [ShipmentStatus.delivered]: [
      ShipmentStatus.return_in_progress,
      ShipmentStatus.returned,
    ],
    [ShipmentStatus.failed]: [
      ShipmentStatus.picked_up,
      ShipmentStatus.in_transit,
      ShipmentStatus.at_delivery_branch,
      ShipmentStatus.out_for_delivery,
      ShipmentStatus.delivered,
      ShipmentStatus.return_in_progress,
      ShipmentStatus.returned,
      ShipmentStatus.cancelled,
    ],
    [ShipmentStatus.return_in_progress]: [ShipmentStatus.returned],
    [ShipmentStatus.returned]: [],
    [ShipmentStatus.cancelled]: [],
  };
  return transitions[from].includes(to);
}
