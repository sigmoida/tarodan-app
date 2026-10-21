import { Injectable } from "@nestjs/common";
import {
  CancellationActor,
  OrderOrigin,
  OrderStatus,
  Prisma,
} from "@prisma/client";
import type { AdminCancelReasonCode } from "@tarodan/types";
import type { StatsWindow } from "../../../common/helpers/stats-window";
import { liveRowSql } from "../../account-lane/live-lane.where";
import { ORDER_CANCEL_REASON } from "../helpers/order-cancel-reasons";

export interface SellerFulfilmentRow {
  userId: string;
  /** Paid orders whose first deadline is in the window and passed (E). */
  eligible: number;
  /** Seller-caused failures among them (F). */
  failures: number;
  /** Of E, handed to the carrier (S). */
  shipped: number;
  /** Of S, handed over later than the first deadline plus the grace (L). */
  late: number;
}

export interface CounterpartyCountRow {
  userId: string;
  /**
   * The buyer's user id; for a guest checkout `guest:<md5 of the e-mail>`
   * (or `order:<id>` when the order has no guest e-mail). Never stored.
   */
  counterpartyKey: string;
  count: number;
}

/** `<column> = ANY(ids)`, or FALSE for no ids (no empty array parameter). */
function idIn(column: Prisma.Sql, ids: string[]): Prisma.Sql {
  return ids.length > 0
    ? Prisma.sql`${column} = ANY(${ids}::text[])`
    : Prisma.sql`FALSE`;
}

/**
 * Platform (admin) cancellation codes that mean the seller was at fault: the
 * item was not as listed or not in stock. The other codes (suspicious
 * activity, user request, duplicate, other) say nothing about the seller.
 */
export const SELLER_FAULT_ADMIN_CANCEL_CODES = [
  "stock_error",
  "listing_violation",
] as const satisfies readonly AdminCancelReasonCode[];

/**
 * Order-side aggregates of the seller trust score (ADR 0014,
 * `docs/SELLER_TRUST.md`). Reporting SQL in the owning domain: parameterised,
 * set-based over a batch of seller ids, and run inside the caller's read-only
 * snapshot (`tx`). Every query excludes the test lane (`is_test`) and the
 * platform's own service orders (`origin = platform_service`: membership and
 * boost purchases), which are not seller sales.
 */
@Injectable()
export class OrderSellerTrustStatsService {
  /**
   * Sellers with a paid order since `since` (`preparing_deadline` is stamped
   * at payment). Range scan on `orders(preparing_deadline)`. Ordered so the
   * caller's batches are stable.
   */
  async activeSellerIds(
    tx: Prisma.TransactionClient,
    since: Date,
  ): Promise<string[]> {
    const rows = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT DISTINCT o."seller_id" AS "id"
      FROM "orders" o
      WHERE o."preparing_deadline" >= ${since}
        AND ${liveRowSql("o")}
        AND o."origin" <> ${OrderOrigin.platform_service}::"OrderOrigin"
      ORDER BY 1`;
    return rows.map((r) => r.id);
  }

  /**
   * Reliability and on-time counts per seller.
   *
   * - **E**: paid orders (`preparing_deadline IS NOT NULL`) whose FIRST
   *   deadline (`original_preparing_deadline` when it was extended) lies in
   *   the window and has passed, minus cancellations that are not failures.
   *   A cancellation whose cause is unknown or neutral (buyer, system,
   *   platform for a neutral reason, or no recorded actor) is left out: it is
   *   neither a success nor counted against the seller.
   * - **F**: a cancellation by the seller; the not-shipped-in-time automatic
   *   cancellation, recognised by its fixed reason text because rows from
   *   before 2026-09-18 carry no `cancelled_by`; a platform cancellation with
   *   a seller-fault code; or an order in `sellerFaultOrderIds` (reviewed
   *   refunds with `fault_party = seller`, from the refund domain).
   * - **S / L**: `shipments.shipped_at` is the first physical carrier
   *   handoff. Late means after the first deadline plus `lateGraceMinutes`,
   *   so an extension does not help (decision D4).
   *
   * Index probes on `orders(seller_id)` and `shipments(order_id)`.
   */
  async fulfilmentStats(
    tx: Prisma.TransactionClient,
    sellerIds: string[],
    window: StatsWindow,
    lateGraceMinutes: number,
    sellerFaultOrderIds: string[],
  ): Promise<SellerFulfilmentRow[]> {
    if (sellerIds.length === 0) return [];
    return tx.$queryRaw<SellerFulfilmentRow[]>`
      WITH base AS (
        SELECT
          o."id",
          o."seller_id",
          COALESCE(o."original_preparing_deadline", o."preparing_deadline") AS "first_deadline",
          o."status" = ${OrderStatus.cancelled}::"OrderStatus" AS "cancelled",
          (
            (
              o."status" = ${OrderStatus.cancelled}::"OrderStatus"
              AND (
                o."cancelled_by" = ${CancellationActor.seller}::"CancellationActor"
                OR o."cancel_reason" = ${ORDER_CANCEL_REASON.sellerShipDeadlineExpired}
                OR (
                  o."cancelled_by" = ${CancellationActor.platform}::"CancellationActor"
                  AND o."admin_cancel_reason_code" = ANY(${[...SELLER_FAULT_ADMIN_CANCEL_CODES]}::text[])
                )
              )
            )
            OR ${idIn(Prisma.sql`o."id"`, sellerFaultOrderIds)}
          ) AS "failed"
        FROM "orders" o
        WHERE o."seller_id" = ANY(${sellerIds}::text[])
          AND o."preparing_deadline" IS NOT NULL
          AND ${liveRowSql("o")}
          AND o."origin" <> ${OrderOrigin.platform_service}::"OrderOrigin"
          AND COALESCE(o."original_preparing_deadline", o."preparing_deadline") >= ${window.since}
          AND COALESCE(o."original_preparing_deadline", o."preparing_deadline") < ${window.until}
      ),
      counted AS (
        SELECT b.*, s."shipped_at"
        FROM base b
        LEFT JOIN "shipments" s ON s."order_id" = b."id"
        WHERE NOT b."cancelled" OR b."failed"
      )
      SELECT
        c."seller_id" AS "userId",
        COUNT(*)::int AS "eligible",
        COUNT(*) FILTER (WHERE c."failed")::int AS "failures",
        COUNT(c."shipped_at")::int AS "shipped",
        COUNT(*) FILTER (
          WHERE c."shipped_at" > c."first_deadline" + make_interval(mins => ${lateGraceMinutes}::int)
        )::int AS "late"
      FROM counted c
      GROUP BY c."seller_id"`;
  }

  /**
   * Completed sales per (seller, counterparty) in the window, so the caller
   * can cap each counterparty across sales and trades. Guest checkouts share
   * one system buyer, so a guest is told apart by the e-mail the checkout
   * stored (`shipping_address.guestEmail`), normalised and hashed in SQL: the
   * cap holds for one person ordering as a guest many times, and no address
   * reaches the application. A guest order without an e-mail is its own
   * counterparty. Index probes on `orders(seller_id)`.
   */
  async salesCounterparties(
    tx: Prisma.TransactionClient,
    sellerIds: string[],
    window: StatsWindow,
    guestBuyerId: string | null,
  ): Promise<CounterpartyCountRow[]> {
    if (sellerIds.length === 0) return [];
    return tx.$queryRaw<CounterpartyCountRow[]>`
      SELECT
        o."seller_id" AS "userId",
        CASE
          WHEN o."buyer_id" IS DISTINCT FROM ${guestBuyerId}::text THEN o."buyer_id"
          WHEN NULLIF(btrim(o."shipping_address"->>'guestEmail'), '') IS NOT NULL
            THEN 'guest:' || md5(lower(btrim(o."shipping_address"->>'guestEmail')))
          ELSE 'order:' || o."id"
        END AS "counterpartyKey",
        COUNT(*)::int AS "count"
      FROM "orders" o
      WHERE o."seller_id" = ANY(${sellerIds}::text[])
        AND o."status" = ${OrderStatus.completed}::"OrderStatus"
        AND o."completed_at" >= ${window.since}
        AND o."completed_at" < ${window.until}
        AND ${liveRowSql("o")}
        AND o."origin" <> ${OrderOrigin.platform_service}::"OrderOrigin"
      GROUP BY 1, 2`;
  }
}
