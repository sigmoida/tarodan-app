/** @format */

import {
  isDigitalOrder,
  isPreShipmentCancellableStatus,
  isShipmentHandedToCarrier,
} from "@tarodan/types";
import type { OrderDetail } from "./types";

/**
 * The "ship by" note on the order file.
 *
 * The date comes from the server (`preparingDeadline`): on the one-time
 * extension the server writes the new deadline to the same field, the screen
 * computes nothing. `extended` says the extension was used: the seller sees
 * "final deadline", the buyer "delayed, you may cancel before shipping".
 *
 * The note never promises more than the server will do, so it shows only
 * when:
 *  - the order is paid but has not left yet, AND
 *  - the parcel has not been handed to the carrier, by the SAME rule as the
 *    server's expiry sweep (`isShipmentHandedToCarrier`: a moving status or
 *    the `shippedAt` stamp). The sweep does not cancel a handed-over parcel,
 *    so "cancelled automatically" would be wrong. AND
 *  - the deadline has not passed. Once it has, the decision (extension or
 *    cancel) is the next sweep's; no cancel is promised for a past date. AND
 *  - the order is not digital (membership, boost): nothing ships.
 */
export interface PreparingDeadlineNotice {
  deadline: string;
  extended: boolean;
  audience: "buyer" | "seller";
}

export function preparingDeadlineNoticeOf(
  order: OrderDetail,
  now: Date = new Date(),
): PreparingDeadlineNotice | null {
  if (!order.preparingDeadline) return null;
  if (!order.isBuyer && !order.isSeller) return null;
  if (isDigitalOrder(order)) return null;
  if (!isPreShipmentCancellableStatus(order.status)) return null;
  if (isShipmentHandedToCarrier(order.shipment ?? null)) return null;
  const deadlineMs = new Date(order.preparingDeadline).getTime();
  if (Number.isNaN(deadlineMs) || deadlineMs <= now.getTime()) return null;
  return {
    deadline: order.preparingDeadline,
    extended: Boolean(order.preparingExtendedAt),
    audience: order.isSeller ? "seller" : "buyer",
  };
}
