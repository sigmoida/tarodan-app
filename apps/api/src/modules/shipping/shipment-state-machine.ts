import { ShipmentStatus } from "@prisma/client";

/**
 * #86: single source of truth for shipment status transitions. Four independent
 * writers (manual seller update, provider webhook, Sürat poll, worker) used to
 * blind-write `Shipment.status` with no coordination, so out-of-order carrier
 * events or a manual re-submit could regress a shipment — e.g. `delivered →
 * picked_up`, which is money-critical because escrow release keys on `delivered`.
 *
 * Policy — intentionally permissive for in-transit states so it does NOT block
 * legitimate carrier sequences (e.g. `out_for_delivery → at_delivery_branch` on a
 * failed delivery attempt): idempotent same-status is always allowed; the terminal
 * statuses are locked — `delivered` may only proceed to the post-delivery return
 * legs, and `returned`/`cancelled` are final. This blocks the regressions the four
 * writers could otherwise apply while leaving forward/branch progress unconstrained.
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
  // Idempotent replay (a re-delivered carrier event, a re-poll) is a no-op.
  if (from === to) return true;

  // Delivered is terminal except for the post-delivery return legs.
  if (from === ShipmentStatus.delivered) {
    return (
      to === ShipmentStatus.return_in_progress || to === ShipmentStatus.returned
    );
  }

  // Returned / cancelled are fully terminal.
  if (from === ShipmentStatus.returned || from === ShipmentStatus.cancelled) {
    return false;
  }

  // Any non-terminal source may move forward or branch (failed / return / etc.).
  return true;
}
