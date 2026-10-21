import { Injectable } from "@nestjs/common";
import {
  OrderOrigin,
  Prisma,
  RefundFaultParty,
  RefundRequestStatus,
} from "@prisma/client";
import { liveRowSql } from "../../account-lane/live-lane.where";

/**
 * Refund-side input of the seller trust score (ADR 0014,
 * `docs/SELLER_TRUST.md`): orders the seller was found at fault for.
 *
 * Only the reviewed fact counts: `fault_party` is written when the refund
 * policy is finalised, while `reason` is the buyer's claim. Only completed
 * refunds count (`status = refunded`), so a pending or rejected claim never
 * lowers a score. Reporting SQL in the refund domain; it joins the parent
 * order for the seller, the test lane and the origin (refund is a sub-domain
 * of the order lifecycle).
 */
@Injectable()
export class RefundSellerTrustStatsService {
  /**
   * Distinct ids of these sellers' orders with a refunded, seller-fault
   * request. `since` bounds the scan by `preparing_deadline`, which is never
   * earlier than the first deadline, so the order domain's exact window is a
   * subset. Seller-fault refunds are rare, so the list stays short. Index
   * probes on `orders(seller_id)` and `refund_requests(order_id)`.
   */
  async sellerFaultOrderIds(
    tx: Prisma.TransactionClient,
    sellerIds: string[],
    since: Date,
  ): Promise<string[]> {
    if (sellerIds.length === 0) return [];
    const rows = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT DISTINCT rr."order_id" AS "id"
      FROM "orders" o
      JOIN "refund_requests" rr ON rr."order_id" = o."id"
      WHERE o."seller_id" = ANY(${sellerIds}::text[])
        AND o."preparing_deadline" >= ${since}
        AND ${liveRowSql("o")}
        AND o."origin" <> ${OrderOrigin.platform_service}::"OrderOrigin"
        AND rr."fault_party" = ${RefundFaultParty.seller}::"RefundFaultParty"
        AND rr."status" = ${RefundRequestStatus.refunded}::"RefundRequestStatus"`;
    return rows.map((r) => r.id);
  }
}
