import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from "@nestjs/common";
import {
  LedgerAccount,
  LedgerDirection,
  LedgerEventType,
  OrderStatus,
  PayoutStatus,
  Prisma,
} from "@prisma/client";
import { Logger } from "@nestjs/common";
import { RefundAttemptStatus } from "@prisma/client";
import { LedgerService } from "../../ledger/ledger.service";
import { decideTransferTotal } from "../helpers/transfer-total";
import {
  buildPayoutProcessor,
  PayoutProcessorWorld,
} from "../testing/payout-processor-fixture";
import { PayoutResolutionService } from "./payout-resolution.service";

/**
 * Admin resolution of payout transfers that did not go through (H2,
 * docs/PAYMENTS.md §6): the retry guard for unknown outcomes and "Mark as
 * paid" (PayTR-confirmed or paid by the platform from its bank account).
 *
 * The world below is an in-memory Prisma double whose `$transaction` rolls
 * back on a throw and whose CAS writes honour status, reason and updatedAt,
 * like Postgres would. Ledger writes go through the real `LedgerService`,
 * so an unbalanced group or a duplicate key fails the same way it does in
 * production.
 */

const T0 = new Date("2026-10-20T10:00:00.000Z");

/** Deep copy that keeps Dates as this realm's Dates (structuredClone does not). */
const clone = <T>(value: T): T => {
  if (value instanceof Date) return new Date(value.getTime()) as T;
  if (Array.isArray(value)) return value.map(clone) as T;
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, clone(v)]),
    ) as T;
  }
  return value;
};

interface Row {
  id: string;
  transId: string;
  sellerId: string;
  merchantOid: string;
  status: PayoutStatus;
  failureReason: string | null;
  providerResponse: unknown;
  providerReference: string | null;
  amount: number;
  netAmount: number;
  submittedAmount: number | null;
  submittedTotalAmount: number | null;
  submittedAt: Date | null;
  processedAt: Date | null;
  retryCount: number;
  nextRetryAt: Date | null;
  transferIban: string;
  updatedAt: Date;
  paymentHoldId: string | null;
  paymentHold: {
    paymentId: string;
    orderId: string;
    amount: number;
    refundedAmount: number;
  } | null;
  tradeCashPayment: { tradeId: string; payment: { id: string } | null } | null;
}

interface LedgerRow {
  idempotencyKey: string | null;
  lineNo: number;
  entryGroupId: string;
  eventType: LedgerEventType;
  account: LedgerAccount;
  direction: LedgerDirection;
  amount: number;
  orderId: string | null;
  tradeId: string | null;
  payoutId: string | null;
  holdId: string | null;
  sellerId: string | null;
  metadata: unknown;
}

const PARKED_SNAPSHOT = {
  transferTotal: {
    net: 40,
    allowedTotal: 0,
    ownAllowed: 0,
    oidRemaining: 0,
    sourceTotal: 322,
    sourceRefunded: 322,
    paymentAmount: 322,
    paymentRefunded: 322,
    otherTransfersTotal: 0,
  },
};

class World {
  rows: Row[] = [];
  ledger: LedgerRow[] = [];
  orders = new Map<string, { status: OrderStatus }>();
  /**
   * Another writer (a PayTR callback, a second admin request) moves the row
   * right before our CAS and commits on its own: its change survives our
   * rollback.
   */
  beforeCas: ((row: Row) => void) | null = null;
  private committedElsewhere: Row[] = [];

  addRow(over: Partial<Row> & { id: string }): Row {
    const row: Row = {
      transId: `PYT${over.id.toUpperCase().replace(/[^A-Z0-9]/g, "")}`,
      sellerId: "seller-1",
      merchantOid: "OID1",
      status: PayoutStatus.failed,
      failureReason: "transfer_needs_manual_decision",
      providerResponse: PARKED_SNAPSHOT,
      providerReference: null,
      amount: 322,
      netAmount: 40,
      submittedAmount: null,
      submittedTotalAmount: null,
      submittedAt: null,
      processedAt: null,
      retryCount: 1,
      nextRetryAt: null,
      transferIban: "TR330006100519786457841326",
      updatedAt: T0,
      paymentHoldId: "hold-1",
      paymentHold: {
        paymentId: "pay-1",
        orderId: "order-1",
        amount: 362,
        refundedAmount: 322,
      },
      tradeCashPayment: null,
      ...over,
    };
    this.rows.push(row);
    if (row.paymentHold) {
      this.orders.set(row.paymentHold.orderId, {
        status: OrderStatus.refunded,
      });
    }
    return row;
  }

  row(id: string): Row {
    const row = this.rows.find((r) => r.id === id);
    if (!row) throw new Error(`no row ${id}`);
    return row;
  }

  /** A balanced ledger group already in the book (capture, refund, ...). */
  book(
    key: string,
    eventType: LedgerEventType,
    refs: { orderId?: string; tradeId?: string; sellerId?: string },
    entries: Array<[LedgerAccount, LedgerDirection, number]>,
  ) {
    entries.forEach(([account, direction, amount], lineNo) =>
      this.ledger.push({
        idempotencyKey: key,
        lineNo,
        entryGroupId: key,
        eventType,
        account,
        direction,
        amount,
        orderId: refs.orderId ?? null,
        tradeId: refs.tradeId ?? null,
        payoutId: null,
        holdId: null,
        sellerId: refs.sellerId ?? null,
        metadata: null,
      }),
    );
  }

  /** Signed seller_escrow (debit +, credit -), as the reconciliation reads it. */
  escrow(where: { orderId?: string; tradeId?: string }): number {
    const sum = this.ledger
      .filter(
        (e) =>
          e.account === LedgerAccount.seller_escrow &&
          (where.orderId === undefined || e.orderId === where.orderId) &&
          (where.tradeId === undefined || e.tradeId === where.tradeId),
      )
      .reduce(
        (s, e) =>
          s + (e.direction === LedgerDirection.debit ? e.amount : -e.amount),
        0,
      );
    return Math.round(sum * 100) / 100;
  }

  groups(key?: string): Map<string, LedgerRow[]> {
    const map = new Map<string, LedgerRow[]>();
    for (const e of this.ledger) {
      if (key && e.idempotencyKey !== key) continue;
      map.set(e.entryGroupId, [...(map.get(e.entryGroupId) ?? []), e]);
    }
    return map;
  }

  prisma() {
    const matches = (row: Row, where: Record<string, unknown>) =>
      row.id === where.id &&
      (where.status === undefined || row.status === where.status) &&
      (where.failureReason === undefined ||
        row.failureReason === where.failureReason) &&
      (where.updatedAt === undefined ||
        row.updatedAt.getTime() === (where.updatedAt as Date).getTime());
    const client = {
      $transaction: jest.fn(
        async (fn: (tx: unknown) => Promise<unknown>): Promise<unknown> => {
          const rows = clone(this.rows);
          const ledger = clone(this.ledger);
          this.committedElsewhere = [];
          try {
            return await fn(client);
          } catch (e) {
            this.rows = rows.map(
              (r) => this.committedElsewhere.find((c) => c.id === r.id) ?? r,
            );
            this.ledger = ledger;
            throw e;
          }
        },
      ),
      payoutTransfer: {
        findUnique: jest.fn(
          async ({ where }: { where: { id: string } }) =>
            clone(this.rows.find((r) => r.id === where.id)) ?? null,
        ),
        count: jest.fn(
          async ({ where }: { where: { transId: string } }) =>
            this.rows.filter((r) => r.transId === where.transId).length,
        ),
        updateMany: jest.fn(
          async ({
            where,
            data,
          }: {
            where: Record<string, unknown>;
            data: Record<string, unknown>;
          }) => {
            const target = this.rows.find((r) => r.id === where.id);
            if (target && this.beforeCas) {
              const hook = this.beforeCas;
              this.beforeCas = null;
              hook(target);
              this.committedElsewhere.push(clone(target));
            }
            const hits = this.rows.filter((r) => matches(r, where));
            for (const row of hits) {
              Object.assign(row, { ...data });
              row.updatedAt = new Date(row.updatedAt.getTime() + 1000);
            }
            return { count: hits.length };
          },
        ),
      },
      ledgerEntry: {
        findFirst: jest.fn(
          async ({ where }: { where: { idempotencyKey: string } }) => {
            const hit = this.ledger.find(
              (e) => e.idempotencyKey === where.idempotencyKey,
            );
            return hit ? { id: hit.entryGroupId } : null;
          },
        ),
        groupBy: jest.fn(
          async ({
            where,
          }: {
            where: {
              account: LedgerAccount;
              orderId?: string;
              tradeId?: string;
              sellerId?: string;
            };
          }) => {
            const rows = this.ledger.filter(
              (e) =>
                e.account === where.account &&
                (where.orderId === undefined || e.orderId === where.orderId) &&
                (where.tradeId === undefined || e.tradeId === where.tradeId) &&
                (where.sellerId === undefined || e.sellerId === where.sellerId),
            );
            return [LedgerDirection.debit, LedgerDirection.credit].map(
              (direction) => ({
                direction,
                _sum: {
                  amount: rows
                    .filter((e) => e.direction === direction)
                    .reduce((s, e) => s + e.amount, 0),
                },
              }),
            );
          },
        ),
        createMany: jest.fn(
          async ({ data }: { data: Array<Record<string, unknown>> }) => {
            for (const d of data) {
              if (
                d.idempotencyKey &&
                this.ledger.some(
                  (e) =>
                    e.idempotencyKey === d.idempotencyKey &&
                    e.lineNo === d.lineNo,
                )
              ) {
                throw new Prisma.PrismaClientKnownRequestError(
                  "Unique constraint failed",
                  { code: "P2002", clientVersion: "test" },
                );
              }
            }
            for (const d of data) {
              this.ledger.push({
                ...(d as unknown as LedgerRow),
                amount: Number(d.amount),
              });
            }
            return { count: data.length };
          },
        ),
      },
      order: {
        findUnique: jest.fn(
          async ({ where }: { where: { id: string } }) =>
            this.orders.get(where.id) ?? null,
        ),
      },
    };
    return client;
  }
}

function build(world: World) {
  const prisma = world.prisma();
  const ledger = new LedgerService(prisma as never);
  const payouts = {
    orderPayoutBlock: jest.fn(async () => null as string | null),
    findBlockingRefund: jest.fn(async () => null as string | null),
    sendPayoutReleasedEmail: jest.fn(async () => undefined),
  };
  const service = new PayoutResolutionService(
    prisma as never,
    ledger,
    payouts as never,
  );
  const afterWrite = jest.fn(async () => undefined);
  return { service, prisma, payouts, afterWrite };
}

const markPaid = (
  service: PayoutResolutionService,
  id: string,
  over: Partial<Parameters<PayoutResolutionService["markPaid"]>[1]> = {},
) =>
  service.markPaid(id, {
    actor: "admin-1",
    method: "external_bank",
    reference: "EFT-20261023-001",
    expectedNetAmount: 40,
    ...over,
  });

/** The residual case of 2026-10: order fully refunded, escrow closed in the
 *  ledger, 40 TL still owed to a non-faulty seller. */
function residualWorld(): World {
  const world = new World();
  world.addRow({ id: "p1" });
  world.book(
    "capture:order:order-1",
    LedgerEventType.payment_captured,
    { orderId: "order-1", sellerId: "seller-1" },
    [
      [LedgerAccount.buyer_payment, LedgerDirection.credit, 322],
      [LedgerAccount.seller_escrow, LedgerDirection.debit, 262],
      [LedgerAccount.platform_commission, LedgerDirection.debit, 60],
    ],
  );
  world.book(
    "refund:attempt:r1",
    LedgerEventType.refund_issued,
    { orderId: "order-1", sellerId: "seller-1" },
    [
      [LedgerAccount.refund, LedgerDirection.debit, 322],
      [LedgerAccount.seller_escrow, LedgerDirection.credit, 262],
      [LedgerAccount.platform_commission, LedgerDirection.credit, 60],
    ],
  );
  return world;
}

const expectBalanced = (world: World) => {
  for (const [group, entries] of world.groups()) {
    const net = entries.reduce(
      (s, e) =>
        s + (e.direction === LedgerDirection.debit ? e.amount : -e.amount),
      0,
    );
    expect({ group, net: Math.round(net * 100) / 100 }).toEqual({
      group,
      net: 0,
    });
  }
};

describe("PayoutResolutionService.markPaid", () => {
  describe("external_bank (the platform paid from its bank account)", () => {
    it("residual after a full refund: funds the whole net, books the payout, closes the escrow", async () => {
      const world = residualWorld();
      const { service, payouts, afterWrite } = build(world);
      expect(world.escrow({ orderId: "order-1" })).toBe(0);

      const result = await markPaid(service, "p1", { afterWrite });

      expect(result).toMatchObject({
        transferId: "p1",
        transId: "PYTP1",
        sellerId: "seller-1",
        orderId: "order-1",
        tradeId: null,
        method: "external_bank",
        reference: "EFT-20261023-001",
        netAmount: 40,
        platformFundedAmount: 40,
        alreadySettled: false,
      });
      const funding = [...world.groups("payout-platform-funding:p1").values()];
      expect(funding).toHaveLength(1);
      expect(funding[0].map((e) => [e.account, e.direction, e.amount])).toEqual(
        [
          [LedgerAccount.seller_escrow, LedgerDirection.debit, 40],
          [LedgerAccount.platform_commission, LedgerDirection.credit, 40],
        ],
      );
      expect(funding[0][0]).toMatchObject({
        eventType: LedgerEventType.adjustment,
        orderId: "order-1",
        holdId: "hold-1",
        payoutId: "p1",
        sellerId: "seller-1",
        metadata: { method: "external_bank", reference: "EFT-20261023-001" },
      });
      const paid = [...world.groups("payout-completed:p1").values()];
      expect(paid).toHaveLength(1);
      expect(paid[0].map((e) => [e.account, e.direction, e.amount])).toEqual([
        [LedgerAccount.seller_escrow, LedgerDirection.credit, 40],
        [LedgerAccount.payout, LedgerDirection.debit, 40],
      ]);
      expect(paid[0][0]).toMatchObject({
        eventType: LedgerEventType.payout_completed,
        orderId: "order-1",
        payoutId: "p1",
      });
      expectBalanced(world);
      // The reconciliation's escrow residue check sees 0 for the order.
      expect(world.escrow({ orderId: "order-1" })).toBe(0);

      expect(world.row("p1")).toMatchObject({
        status: PayoutStatus.completed,
        failureReason: null,
        // Siblings on the oid must not count it (null would count `amount`).
        submittedTotalAmount: 0,
        // No PayTR transfer: the PSP comparison and the returned scan skip it.
        submittedAt: null,
        submittedAmount: null,
      });
      expect(world.row("p1").processedAt).toBeInstanceOf(Date);
      expect(world.row("p1").providerResponse).toMatchObject({
        transferTotal: PARKED_SNAPSHOT.transferTotal,
        manualSettlement: {
          method: "external_bank",
          reference: "EFT-20261023-001",
          adminId: "admin-1",
          netAmount: 40,
          platformFundedAmount: 40,
        },
      });

      expect(payouts.sendPayoutReleasedEmail).toHaveBeenCalledTimes(1);
      expect(payouts.sendPayoutReleasedEmail).toHaveBeenCalledWith(
        "seller-1",
        40,
        "TR330006100519786457841326",
      );
      expect(afterWrite).toHaveBeenCalledTimes(1);
      expect(afterWrite).toHaveBeenCalledWith(
        expect.anything(),
        result,
        expect.objectContaining({
          status: PayoutStatus.failed,
          failureReason: "transfer_needs_manual_decision",
          transId: "PYTP1",
          netAmount: 40,
        }),
      );
    });

    it("escrow still holds part of the net: funds only the gap", async () => {
      const world = residualWorld();
      world.book(
        "capture:order:order-1:extra",
        LedgerEventType.payment_captured,
        { orderId: "order-1", sellerId: "seller-1" },
        [
          [LedgerAccount.buyer_payment, LedgerDirection.credit, 15.5],
          [LedgerAccount.seller_escrow, LedgerDirection.debit, 15.5],
        ],
      );
      const { service } = build(world);

      const result = await markPaid(service, "p1");

      expect(result.platformFundedAmount).toBe(24.5);
      const funding = [...world.groups("payout-platform-funding:p1").values()];
      expect(funding[0].map((e) => e.amount)).toEqual([24.5, 24.5]);
      expectBalanced(world);
      expect(world.escrow({ orderId: "order-1" })).toBe(0);
    });

    it("escrow covers the net (transfer total exceeds the remaining): no funding group", async () => {
      const world = new World();
      world.addRow({
        id: "p2",
        failureReason: "transfer_total_exceeds_remaining",
        netAmount: 90,
        paymentHold: {
          paymentId: "pay-2",
          orderId: "order-2",
          amount: 90,
          refundedAmount: 0,
        },
        paymentHoldId: "hold-2",
      });
      world.orders.set("order-2", { status: OrderStatus.completed });
      world.book(
        "capture:order:order-2",
        LedgerEventType.payment_captured,
        { orderId: "order-2", sellerId: "seller-1" },
        [
          [LedgerAccount.buyer_payment, LedgerDirection.credit, 100],
          [LedgerAccount.seller_escrow, LedgerDirection.debit, 90],
          [LedgerAccount.platform_commission, LedgerDirection.debit, 10],
        ],
      );
      const { service } = build(world);

      const result = await markPaid(service, "p2", { expectedNetAmount: 90 });

      expect(result.platformFundedAmount).toBe(0);
      expect(world.groups("payout-platform-funding:p2").size).toBe(0);
      expect(world.groups("payout-completed:p2").size).toBe(1);
      expectBalanced(world);
      expect(world.escrow({ orderId: "order-2" })).toBe(0);
    });

    it("trade cash payout: escrow per trade and recipient, refs carry the trade", async () => {
      const world = new World();
      world.addRow({
        id: "p3",
        failureReason: "transfer_needs_manual_decision",
        netAmount: 150,
        paymentHoldId: null,
        paymentHold: null,
        tradeCashPayment: { tradeId: "trade-1", payment: { id: "pay-3" } },
      });
      world.book(
        "capture:trade-cash:tcp-1",
        LedgerEventType.payment_captured,
        { tradeId: "trade-1", sellerId: "seller-1" },
        [
          [LedgerAccount.buyer_payment, LedgerDirection.credit, 200],
          [LedgerAccount.seller_escrow, LedgerDirection.debit, 150],
          [LedgerAccount.platform_commission, LedgerDirection.debit, 50],
        ],
      );
      world.book(
        "refund:trade-cash:r1",
        LedgerEventType.refund_issued,
        { tradeId: "trade-1", sellerId: "seller-1" },
        [
          [LedgerAccount.refund, LedgerDirection.debit, 100],
          [LedgerAccount.seller_escrow, LedgerDirection.credit, 100],
        ],
      );
      const { service, payouts } = build(world);

      const result = await markPaid(service, "p3", { expectedNetAmount: 150 });

      expect(result).toMatchObject({
        orderId: null,
        tradeId: "trade-1",
        platformFundedAmount: 100,
      });
      expect(payouts.findBlockingRefund).toHaveBeenCalledWith({
        orderId: null,
        paymentId: "pay-3",
        tradeId: "trade-1",
      });
      for (const e of world.ledger.filter((e) => e.payoutId === "p3")) {
        expect(e.tradeId).toBe("trade-1");
      }
      expectBalanced(world);
      expect(world.escrow({ tradeId: "trade-1" })).toBe(0);
    });

    it("leaves sibling transfers on the oid free to use what the payment still has", async () => {
      const world = residualWorld();
      const { service } = build(world);
      await markPaid(service, "p1");
      const settled = world.row("p1");

      const sibling = decideTransferTotal({
        payoutId: "p9",
        net: 80,
        sourceKey: "order-9",
        sourceTotal: 100,
        paymentAmount: 422,
        refundedOrders: undefined,
        refundAttempts: [
          {
            orderId: "order-1",
            tradeId: null,
            amount: 322,
            status: "finalized",
          },
        ],
        oidTransfers: [settled],
      });

      expect(sibling).toMatchObject({ kind: "send", totalAmount: 100 });
      expect(sibling.snapshot.otherTransfersTotal).toBe(0);
    });
  });

  describe("paytr_confirmed (the PayTR panel shows the transfer arrived)", () => {
    it("unknown outcome: books the payout with the net it carried, keeps the total counted", async () => {
      const world = new World();
      world.addRow({
        id: "p4",
        failureReason: "transfer_outcome_unknown",
        amount: 349,
        netAmount: 300,
        submittedAmount: 300,
        submittedTotalAmount: 303,
        providerResponse: {
          error: { phase: "unknown", causeCode: "ECONNRESET" },
        },
        paymentHold: {
          paymentId: "pay-4",
          orderId: "order-4",
          amount: 300,
          refundedAmount: 0,
        },
        paymentHoldId: "hold-4",
      });
      const { service, payouts } = build(world);

      const result = await markPaid(service, "p4", {
        method: "paytr_confirmed",
        reference: "PAYTR-REF-77",
        expectedNetAmount: 300,
      });

      expect(result).toMatchObject({
        method: "paytr_confirmed",
        netAmount: 300,
        platformFundedAmount: 0,
      });
      expect(world.groups("payout-platform-funding:p4").size).toBe(0);
      const paid = [...world.groups("payout-completed:p4").values()];
      expect(paid[0].map((e) => [e.account, e.direction, e.amount])).toEqual([
        [LedgerAccount.seller_escrow, LedgerDirection.credit, 300],
        [LedgerAccount.payout, LedgerDirection.debit, 300],
      ]);
      expect(world.row("p4")).toMatchObject({
        status: PayoutStatus.completed,
        failureReason: null,
        // PayTR took it from the oid: siblings keep counting it.
        submittedTotalAmount: 303,
        submittedAmount: 300,
        // Like the PayTR callback: the failure was written right after the send.
        submittedAt: T0,
      });
      // The guards are for money that has not moved yet.
      expect(payouts.orderPayoutBlock).not.toHaveBeenCalled();
      expect(payouts.findBlockingRefund).not.toHaveBeenCalled();
      expect(payouts.sendPayoutReleasedEmail).toHaveBeenCalledWith(
        "seller-1",
        300,
        "TR330006100519786457841326",
      );
    });

    it("legacy free-text failure from a thrown error ('Bad Request Exception')", async () => {
      const world = new World();
      world.addRow({
        id: "p5",
        failureReason: "Bad Request Exception",
        providerResponse: null,
        amount: 349,
        netAmount: 300,
      });
      const { service } = build(world);

      const result = await markPaid(service, "p5", {
        method: "paytr_confirmed",
        expectedNetAmount: 300,
      });

      expect(result.netAmount).toBe(300);
      expect(world.row("p5")).toMatchObject({
        status: PayoutStatus.completed,
        // Legacy rows sent `amount`; null keeps it counted that way.
        submittedTotalAmount: null,
        submittedAmount: 300,
      });
      expect(world.row("p5").providerResponse).toMatchObject({
        manualSettlement: { method: "paytr_confirmed" },
      });
    });
  });

  describe("idempotency and races", () => {
    it("a repeated request returns the first result and writes nothing", async () => {
      const world = residualWorld();
      const { service, payouts, afterWrite } = build(world);
      const first = await markPaid(service, "p1", { afterWrite });
      const ledgerRows = world.ledger.length;

      const second = await markPaid(service, "p1", { afterWrite });

      expect(second).toEqual({ ...first, alreadySettled: true });
      expect(world.ledger).toHaveLength(ledgerRows);
      expect(payouts.sendPayoutReleasedEmail).toHaveBeenCalledTimes(1);
      expect(afterWrite).toHaveBeenCalledTimes(1);
    });

    it("a double click that loses the claim to its twin returns the twin's result", async () => {
      const world = residualWorld();
      const { service, payouts } = build(world);
      world.beforeCas = (row) => {
        row.status = PayoutStatus.completed;
        row.updatedAt = new Date(T0.getTime() + 5000);
        row.providerResponse = {
          manualSettlement: {
            method: "external_bank",
            reference: "EFT-20261023-001",
            adminId: "admin-1",
            settledAt: "2026-10-23T09:00:00.000Z",
            netAmount: 40,
            platformFundedAmount: 40,
          },
        };
      };

      const result = await markPaid(service, "p1");

      expect(result).toMatchObject({ alreadySettled: true, netAmount: 40 });
      expect(world.groups("payout-completed:p1").size).toBe(0);
      expect(payouts.sendPayoutReleasedEmail).not.toHaveBeenCalled();
    });

    it("a PayTR callback that completed the row first wins: 409, nothing written", async () => {
      const world = new World();
      world.addRow({
        id: "p4",
        failureReason: "transfer_outcome_unknown",
        netAmount: 300,
        submittedAmount: 300,
      });
      const { service, payouts } = build(world);
      world.beforeCas = (row) => {
        row.status = PayoutStatus.completed;
        row.failureReason = null;
        row.updatedAt = new Date(T0.getTime() + 5000);
      };

      await expect(
        markPaid(service, "p4", {
          method: "paytr_confirmed",
          expectedNetAmount: 300,
        }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(world.row("p4").status).toBe(PayoutStatus.completed);
      expect(world.row("p4").providerResponse).not.toHaveProperty(
        "manualSettlement",
      );
      expect(world.ledger).toHaveLength(0);
      expect(payouts.sendPayoutReleasedEmail).not.toHaveBeenCalled();
    });

    it("an audit failure rolls the settlement back (row, ledger) and sends no e-mail", async () => {
      const world = residualWorld();
      const { service, payouts } = build(world);
      const ledgerRows = world.ledger.length;

      await expect(
        markPaid(service, "p1", {
          afterWrite: async () => {
            throw new Error("audit down");
          },
        }),
      ).rejects.toThrow("audit down");

      expect(world.row("p1")).toMatchObject({
        status: PayoutStatus.failed,
        failureReason: "transfer_needs_manual_decision",
      });
      expect(world.ledger).toHaveLength(ledgerRows);
      expect(payouts.sendPayoutReleasedEmail).not.toHaveBeenCalled();
    });

    it("a row the ledger already booked (returned, then retried) gets no second payout group", async () => {
      const world = residualWorld();
      world.book(
        "payout-completed:p1",
        LedgerEventType.payout_completed,
        { orderId: "order-1", sellerId: "seller-1" },
        [
          [LedgerAccount.seller_escrow, LedgerDirection.credit, 40],
          [LedgerAccount.payout, LedgerDirection.debit, 40],
        ],
      );
      const ledgerRows = world.ledger.length;
      const { service } = build(world);

      const result = await markPaid(service, "p1");

      expect(result.platformFundedAmount).toBe(0);
      expect(world.ledger).toHaveLength(ledgerRows);
      expect(world.row("p1").status).toBe(PayoutStatus.completed);
    });
  });

  describe("refusals (nothing written)", () => {
    const expectUntouched = (world: World, id: string, before: Row) => {
      expect(world.row(id)).toEqual(before);
    };

    it.each([
      ["transfer_outcome_unknown", "external_bank"],
      ["Bad Request Exception", "external_bank"],
      ["transfer_needs_manual_decision", "paytr_confirmed"],
      ["transfer_total_exceeds_remaining", "paytr_confirmed"],
      ["provider_rejected", "external_bank"],
      ["provider_unreachable", "external_bank"],
      ["bank_details_rejected", "external_bank"],
      ["no_bank_account", "external_bank"],
      ["refund_pending", "external_bank"],
      ["order_refunded", "external_bank"],
      ["fully_refunded", "external_bank"],
    ] as const)("failed / %s with %s -> 409", async (reason, method) => {
      const world = residualWorld();
      world.row("p1").failureReason = reason;
      world.row("p1").providerResponse = null;
      const before = clone(world.row("p1"));
      const { service } = build(world);

      await expect(markPaid(service, "p1", { method })).rejects.toBeInstanceOf(
        ConflictException,
      );
      expectUntouched(world, "p1", before);
    });

    it.each([
      PayoutStatus.pending,
      PayoutStatus.processing,
      PayoutStatus.retry_pending,
      PayoutStatus.returned,
      PayoutStatus.completed,
    ])("a %s row -> 409", async (status) => {
      const world = residualWorld();
      world.row("p1").status = status;
      const before = clone(world.row("p1"));
      const { service } = build(world);

      await expect(markPaid(service, "p1")).rejects.toBeInstanceOf(
        ConflictException,
      );
      expectUntouched(world, "p1", before);
    });

    it("a parked row without a payment or source (data problem) -> 409 missing input", async () => {
      const world = residualWorld();
      world.row("p1").providerResponse = {
        transferTotal: {
          ...PARKED_SNAPSHOT.transferTotal,
          missingInput: "payment",
        },
      };
      const { service } = build(world);

      await expect(markPaid(service, "p1")).rejects.toMatchObject({
        response: expect.objectContaining({
          i18nKey: "server.admin.payout.markPaidMissingInput",
        }),
      });
    });

    it("the net changed since the admin looked -> 409 with the current amount", async () => {
      const world = residualWorld();
      const before = clone(world.row("p1"));
      const { service } = build(world);

      await expect(
        markPaid(service, "p1", { expectedNetAmount: 40.01 }),
      ).rejects.toMatchObject({
        response: expect.objectContaining({
          i18nKey: "server.admin.payout.markPaidAmountChanged",
        }),
      });
      expectUntouched(world, "p1", before);
    });

    it.each([
      [
        "the order is no longer payable",
        (p: ReturnType<typeof build>["payouts"]) =>
          p.orderPayoutBlock.mockResolvedValueOnce("seller_at_fault"),
      ],
      [
        "a refund is in flight",
        (p: ReturnType<typeof build>["payouts"]) =>
          p.findBlockingRefund.mockResolvedValueOnce("refund_pending"),
      ],
    ])("external_bank while %s -> 409", async (_case, arrange) => {
      const world = residualWorld();
      const before = clone(world.row("p1"));
      const built = build(world);
      arrange(built.payouts);

      await expect(markPaid(built.service, "p1")).rejects.toMatchObject({
        response: expect.objectContaining({
          i18nKey: "server.admin.payout.markPaidPayoutBlocked",
        }),
      });
      expectUntouched(world, "p1", before);
    });

    it("external_bank when a refund since parking lowered the seller's entitlement -> 409", async () => {
      const world = residualWorld();
      world.row("p1").paymentHold!.refundedAmount = 330; // entitled 32 < net 40
      const { service } = build(world);

      await expect(markPaid(service, "p1")).rejects.toMatchObject({
        response: expect.objectContaining({
          i18nKey: "server.admin.payout.markPaidPayoutBlocked",
        }),
      });
      expect(world.ledger.some((e) => e.payoutId === "p1")).toBe(false);
    });

    it("an order that is gone -> 409", async () => {
      const world = residualWorld();
      world.orders.clear();
      const { service } = build(world);

      await expect(markPaid(service, "p1")).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it("a blank reference -> 400", async () => {
      const world = residualWorld();
      const { service } = build(world);

      await expect(
        markPaid(service, "p1", { reference: "   " }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("an unknown transfer -> 404", async () => {
      const { service } = build(new World());

      await expect(markPaid(service, "nope")).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });
});

describe("PayoutResolutionService.retry", () => {
  const retry = (
    service: PayoutResolutionService,
    id: string,
    over: Partial<Parameters<PayoutResolutionService["retry"]>[1]> = {},
  ) => service.retry(id, { actor: "admin-1", ...over });

  it("failed: back to pending with the same trans_id, counters and reference reset, amounts left to the processor", async () => {
    const world = residualWorld();
    world.row("p1").providerReference = "OLDREF";
    world.row("p1").nextRetryAt = new Date();
    const { service, afterWrite } = build(world);

    const result = await retry(service, "p1", { afterWrite });

    expect(result).toMatchObject({
      transferId: "p1",
      transId: "PYTP1",
      renewedTransId: false,
      providerCheckConfirmed: false,
    });
    expect(world.row("p1")).toMatchObject({
      status: PayoutStatus.pending,
      transId: "PYTP1",
      failureReason: null,
      retryCount: 0,
      nextRetryAt: null,
      providerReference: null,
      submittedTotalAmount: null,
      // Net and total are recomputed by the processor, never set here.
      netAmount: 40,
      amount: 322,
    });
    expect(afterWrite).toHaveBeenCalledWith(
      expect.anything(),
      result,
      expect.objectContaining({
        status: PayoutStatus.failed,
        providerReference: "OLDREF",
        providerResponse: PARKED_SNAPSHOT,
      }),
    );
  });

  it("returned: a new trans_id (PayTR processed the old one)", async () => {
    const world = residualWorld();
    world.row("p1").status = PayoutStatus.returned;
    world.row("p1").failureReason =
      "Geri döndü (PayTR ref R1, tespit 2026-10-20)";
    const { service } = build(world);

    const result = await retry(service, "p1");

    expect(result.renewedTransId).toBe(true);
    expect(result.transId).toMatch(/^PYT[A-Z0-9]+$/);
    expect(result.transId).not.toBe("PYTP1");
    expect(world.row("p1")).toMatchObject({
      status: PayoutStatus.pending,
      transId: result.transId,
    });
  });

  describe("a transfer PayTR may have taken needs the panel check", () => {
    const unknownWorld = (reason: string, providerResponse: unknown) => {
      const world = new World();
      world.addRow({
        id: "p4",
        failureReason: reason,
        providerResponse,
        netAmount: 300,
        submittedAmount: 300,
        submittedTotalAmount: 303,
      });
      return world;
    };

    it.each([
      ["transfer_outcome_unknown", { error: { phase: "unknown" } }],
      ["Bad Request Exception", null],
    ])(
      "%s without confirmation -> 409, untouched",
      async (reason, response) => {
        const world = unknownWorld(reason, response);
        const before = clone(world.row("p4"));
        const { service } = build(world);

        for (const over of [
          {},
          { confirmProviderChecked: false, reason: "checked" },
          { confirmProviderChecked: true },
          { confirmProviderChecked: true, reason: "   " },
        ]) {
          await expect(retry(service, "p4", over)).rejects.toMatchObject({
            response: expect.objectContaining({
              i18nKey: "server.admin.payout.providerCheckRequired",
            }),
          });
        }
        expect(world.row("p4")).toEqual(before);
      },
    );

    it("with confirmation and a reason -> pending, same trans_id, the oid total released", async () => {
      const world = unknownWorld("transfer_outcome_unknown", null);
      const { service } = build(world);

      const result = await retry(service, "p4", {
        confirmProviderChecked: true,
        reason: "PayTR panel: no transfer with PYTP4",
      });

      expect(result).toMatchObject({
        transId: "PYTP4",
        renewedTransId: false,
        providerCheckConfirmed: true,
      });
      expect(world.row("p4")).toMatchObject({
        status: PayoutStatus.pending,
        transId: "PYTP4",
        submittedTotalAmount: null,
      });
    });

    it("a legacy PayTR rejection (its answer is stored) needs no check", async () => {
      const world = unknownWorld(
        "toplam transfer tutarı kalan tutardan fazla olamaz",
        { status: "error", err_no: "010" },
      );
      const { service } = build(world);

      await expect(retry(service, "p4")).resolves.toMatchObject({
        providerCheckConfirmed: false,
      });
      expect(world.row("p4").status).toBe(PayoutStatus.pending);
    });
  });

  it.each([
    PayoutStatus.pending,
    PayoutStatus.processing,
    PayoutStatus.retry_pending,
    PayoutStatus.completed,
  ])("a %s row cannot be retried -> 400", async (status) => {
    const world = residualWorld();
    world.row("p1").status = status;
    const { service } = build(world);

    await expect(retry(service, "p1")).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it("a row that moved meanwhile (e.g. a PayTR callback completed it) -> 409, untouched", async () => {
    const world = new World();
    world.addRow({ id: "p4", failureReason: "transfer_outcome_unknown" });
    const { service } = build(world);
    world.beforeCas = (row) => {
      row.status = PayoutStatus.completed;
      row.failureReason = null;
      row.updatedAt = new Date(T0.getTime() + 5000);
    };

    await expect(
      retry(service, "p4", { confirmProviderChecked: true, reason: "ok" }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        i18nKey: "server.admin.payout.transferStateChanged",
      }),
    });
    expect(world.row("p4").status).toBe(PayoutStatus.completed);
  });

  it("an audit failure rolls the retry back", async () => {
    const world = residualWorld();
    const { service } = build(world);

    await expect(
      retry(service, "p1", {
        afterWrite: async () => {
          throw new Error("audit down");
        },
      }),
    ).rejects.toThrow("audit down");
    expect(world.row("p1").status).toBe(PayoutStatus.failed);
  });

  it("an unknown transfer -> 404", async () => {
    const { service } = build(new World());
    await expect(retry(service, "nope")).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});

describe("retry hands the row back to the processor, which recomputes net and total", () => {
  beforeEach(() => {
    jest.spyOn(Logger.prototype, "error").mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, "log").mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());

  it("a transfer_total_exceeds_remaining row is resent with the total the payment has now", async () => {
    const world = new PayoutProcessorWorld();
    world.addPayment("pay-1", 349);
    world.addOrderPayout({
      payoutId: "p1",
      paymentId: "pay-1",
      orderId: "o1",
      orderTotal: 349,
      holdAmount: 300,
      merchantOid: "GRPTEST000001T000001",
      transId: "PYTRETRY1",
      status: PayoutStatus.failed,
      over: {
        failureReason: "transfer_total_exceeds_remaining",
        retryCount: 3,
        providerResponse: { status: "error", err_no: "010" },
      },
    });
    // The refund PayTR already took from the oid (why 349 was rejected).
    world.refundAttempts.push({
      paymentId: "pay-1",
      orderId: "o1",
      tradeId: null,
      amount: 46,
      status: RefundAttemptStatus.finalized,
    });
    const {
      service: processor,
      prisma,
      createPlatformTransfer,
    } = buildPayoutProcessor(world);
    const resolution = new PayoutResolutionService(
      {
        ...prisma,
        $transaction: (fn: (tx: unknown) => Promise<unknown>) =>
          fn({ ...prisma }),
      } as never,
      {} as never,
      processor,
    );

    await resolution.retry("p1", { actor: "admin-1" });
    expect(world.payout("p1")).toMatchObject({
      status: PayoutStatus.pending,
      transId: "PYTRETRY1",
      retryCount: 0,
    });
    await processor.processPendingPayouts();

    expect(createPlatformTransfer).toHaveBeenCalledTimes(1);
    expect(createPlatformTransfer.mock.calls[0][0]).toMatchObject({
      transId: "PYTRETRY1",
      totalAmount: 303,
      submerchantAmount: 300,
    });
    expect(world.payout("p1")).toMatchObject({
      status: PayoutStatus.completed,
      submittedTotalAmount: 303,
    });
  });

  it("a residual that still does not fit goes back to the manual decision without a PayTR call", async () => {
    const world = new PayoutProcessorWorld();
    world.addPayment("pay-1", 322);
    world.addOrderPayout({
      payoutId: "p1",
      paymentId: "pay-1",
      orderId: "o1",
      orderTotal: 322,
      holdAmount: 362,
      holdRefunded: 322,
      merchantOid: "OIDFULL",
      transId: "PYTRESID1",
      status: PayoutStatus.failed,
      over: { failureReason: "transfer_needs_manual_decision" },
    });
    world.refundAttempts.push({
      paymentId: "pay-1",
      orderId: "o1",
      tradeId: null,
      amount: 322,
      status: RefundAttemptStatus.finalized,
    });
    const {
      service: processor,
      prisma,
      createPlatformTransfer,
    } = buildPayoutProcessor(world);
    const resolution = new PayoutResolutionService(
      {
        ...prisma,
        $transaction: (fn: (tx: unknown) => Promise<unknown>) =>
          fn({ ...prisma }),
      } as never,
      {} as never,
      processor,
    );

    await resolution.retry("p1", { actor: "admin-1" });
    await processor.processPendingPayouts();

    expect(createPlatformTransfer).not.toHaveBeenCalled();
    expect(world.payout("p1")).toMatchObject({
      status: PayoutStatus.failed,
      failureReason: "transfer_needs_manual_decision",
      providerResponse: {
        transferTotal: expect.objectContaining({ net: 40, allowedTotal: 0 }),
      },
    });
  });
});
