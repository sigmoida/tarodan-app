import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import {
  LedgerAccount,
  PaymentStatus,
  PayoutStatus,
  Prisma,
} from "@prisma/client";
import type {
  HoldReleaseBlockedReason,
  PayoutFailureReason,
  PayoutManualSettlementMethod,
} from "@tarodan/types";
import { PrismaService } from "../../../prisma";
import { LedgerService } from "../../ledger/ledger.service";
import { i18nMessage } from "../../i18n";
import { generatePayoutTransId } from "../../../common/helpers/payout-trans-id";
import { PayoutService } from "../payout.service";
import {
  entitledNetFromHold,
  PAYOUT_FAILURE_FULLY_REFUNDED,
  PAYOUT_MIN_NET,
} from "../helpers/payout-entitlement";
import { PAYOUT_FAILURE } from "../helpers/payout-failure-reasons";
import {
  asRecord,
  manualSettlementMethodFor,
  manualSettlementNet,
  manualSettlementOf,
  platformFundingAmount,
  sameKurus,
  toKurus,
  transferOutcomeMayBeUnknown,
  transferTotalOf,
  withoutManualSettlement,
  type ManualSettlementRecord,
} from "../helpers/payout-resolution-policy";
import {
  payoutCompletedLedgerInput,
  payoutCompletedLedgerKey,
  platformFundingLedgerInput,
  type PayoutLedgerRefs,
} from "../helpers/payout-ledger";

/** What the resolution reads of a payout row (and its source). */
const RESOLUTION_ROW_SELECT = {
  id: true,
  transId: true,
  sellerId: true,
  status: true,
  failureReason: true,
  providerResponse: true,
  providerReference: true,
  netAmount: true,
  submittedAmount: true,
  submittedTotalAmount: true,
  retryCount: true,
  transferIban: true,
  updatedAt: true,
  paymentHoldId: true,
  paymentHold: {
    select: {
      paymentId: true,
      orderId: true,
      amount: true,
      refundedAmount: true,
    },
  },
  tradeCashPayment: {
    select: {
      tradeId: true,
      amount: true,
      status: true,
      releasedAt: true,
      refundedAt: true,
      payment: { select: { id: true } },
    },
  },
} satisfies Prisma.PayoutTransferSelect;

type ResolutionRow = Prisma.PayoutTransferGetPayload<{
  select: typeof RESOLUTION_ROW_SELECT;
}>;

/** The row before the admin's action, for the audit record. */
export interface PayoutResolutionPrevious {
  status: PayoutStatus;
  failureReason: string | null;
  transId: string;
  netAmount: number;
  submittedAmount: number | null;
  submittedTotalAmount: number | null;
  providerReference: string | null;
  providerResponse: unknown;
}

export interface PayoutRetryResult {
  transferId: string;
  /** The trans_id the next attempt sends (new for a returned transfer). */
  transId: string;
  renewedTransId: boolean;
  /** The admin confirmed the PayTR panel shows no transfer for this trans_id. */
  providerCheckConfirmed: boolean;
  previous: PayoutResolutionPrevious;
}

export interface ManualSettlementResult {
  transferId: string;
  transId: string;
  sellerId: string;
  orderId: string | null;
  tradeId: string | null;
  method: PayoutManualSettlementMethod;
  reference: string;
  netAmount: number;
  /** What the platform added to the escrow before paying (external_bank). */
  platformFundedAmount: number;
  settledAt: string;
  /** A repeated request found the row already settled; nothing was written. */
  alreadySettled: boolean;
}

/** Runs inside the action's transaction (the admin layer's audit record);
 *  if it throws, the action is rolled back. */
export type PayoutResolutionAfterWrite<T> = (
  tx: Prisma.TransactionClient,
  result: T,
  previous: PayoutResolutionPrevious,
) => Promise<unknown>;

/** Why an external_bank settlement must wait: a processor guard, the
 *  order's release block, or a row net above what the seller is still
 *  entitled to. */
type ExternalSettlementBlock =
  PayoutFailureReason | HoldReleaseBlockedReason | "net_above_entitlement";

const num = (value: unknown): number | null =>
  value === null || value === undefined ? null : Number(value);

function previousOf(row: ResolutionRow): PayoutResolutionPrevious {
  return {
    status: row.status,
    failureReason: row.failureReason,
    transId: row.transId,
    netAmount: Number(row.netAmount),
    submittedAmount: num(row.submittedAmount),
    submittedTotalAmount: num(row.submittedTotalAmount),
    providerReference: row.providerReference,
    providerResponse: row.providerResponse,
  };
}

/**
 * The admin's ways out of a payout transfer that did not go through, in the
 * payout domain (the admin layer only validates input and audits):
 *
 * - `retry`: back to `pending`; the processor recomputes net and total.
 *   `failed` keeps its trans_id, `returned` gets a new one. A row PayTR may
 *   have taken (unknown outcome) needs the admin's confirmation that the
 *   PayTR panel shows no transfer with that trans_id.
 * - `markPaid`: record the payout as paid without PayTR, either because the
 *   panel shows PayTR did take it (`paytr_confirmed`) or because the platform
 *   paid the net from its own bank account (`external_bank`, decision of
 *   2026-10-23). Ledger and audit in one transaction; the seller's "payout
 *   released" e-mail after commit, once.
 *
 * Every write is a CAS on the row as it was read (status, reason,
 * `updatedAt`): a PayTR callback, the processor or a second admin request
 * that moved the row first wins, and this one gets a 409 (or, for a repeated
 * mark-paid, the earlier result).
 */
@Injectable()
export class PayoutResolutionService {
  private readonly logger = new Logger(PayoutResolutionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
    private readonly payouts: PayoutService,
  ) {}

  async retry(
    transferId: string,
    opts: {
      actor: string;
      confirmProviderChecked?: boolean;
      reason?: string;
      afterWrite?: PayoutResolutionAfterWrite<PayoutRetryResult>;
    },
  ): Promise<PayoutRetryResult> {
    const reason = opts.reason?.trim() ?? "";
    return this.prisma.$transaction(async (tx) => {
      const row = await this.loadRow(tx, transferId);
      if (
        row.status !== PayoutStatus.failed &&
        row.status !== PayoutStatus.returned
      ) {
        throw new BadRequestException(
          i18nMessage("server.admin.payout.retryStateInvalid", {
            status: row.status,
          }),
        );
      }
      const providerCheck = transferOutcomeMayBeUnknown(row);
      if (providerCheck && (opts.confirmProviderChecked !== true || !reason)) {
        throw new ConflictException(
          i18nMessage("server.admin.payout.providerCheckRequired"),
        );
      }

      // A returned transfer was processed by PayTR and came back: send it as
      // a new transfer (new trans_id). A failed one keeps its trans_id: a
      // rejected trans_id was not consumed, and for an unknown outcome a
      // reused one lets PayTR refuse a duplicate, a fresh one never does.
      const newTransId =
        row.status === PayoutStatus.returned
          ? await generatePayoutTransId(
              async (code) =>
                (await tx.payoutTransfer.count({ where: { transId: code } })) >
                0,
            )
          : null;
      const claimed = await tx.payoutTransfer.updateMany({
        where: {
          id: row.id,
          status: row.status,
          failureReason: row.failureReason,
          updatedAt: row.updatedAt,
        },
        data: {
          status: PayoutStatus.pending,
          failureReason: null,
          retryCount: 0,
          nextRetryAt: null,
          // A resend gets a new PayTR reference; keeping the old one would let
          // the returned-transfer scan mark this row returned again.
          // providerResponse stays until the next send (the audit keeps it),
          // except an earlier manual settlement, which no longer applies.
          providerReference: null,
          ...(manualSettlementOf(row.providerResponse)
            ? {
                providerResponse: withoutManualSettlement(
                  row.providerResponse,
                ) as Prisma.InputJsonValue,
              }
            : {}),
          // submittedTotalAmount and submittedAmount stay: a pending row is
          // not counted against the oid and the next claim overwrites them,
          // but a late PayTR callback for the earlier send settles the row
          // with them (handleTransferResultCallback).
          ...(newTransId ? { transId: newTransId } : {}),
        },
      });
      if (claimed.count !== 1) {
        throw new ConflictException(
          i18nMessage("server.admin.payout.transferStateChanged"),
        );
      }

      const result: PayoutRetryResult = {
        transferId: row.id,
        transId: newTransId ?? row.transId,
        renewedTransId: newTransId !== null,
        providerCheckConfirmed: providerCheck,
        previous: previousOf(row),
      };
      await opts.afterWrite?.(tx, result, result.previous);
      this.logger.log(
        `Payout ${row.id} (${row.transId}) requeued by admin ${opts.actor}: was ${row.status}/${row.failureReason ?? "-"}` +
          (newTransId ? `, new trans_id ${newTransId}` : "") +
          (providerCheck ? ", PayTR panel check confirmed" : ""),
      );
      return result;
    });
  }

  async markPaid(
    transferId: string,
    opts: {
      actor: string;
      method: PayoutManualSettlementMethod;
      reference: string;
      expectedNetAmount: number;
      afterWrite?: PayoutResolutionAfterWrite<ManualSettlementResult>;
    },
  ): Promise<ManualSettlementResult> {
    const reference = opts.reference.trim();
    if (!reference) {
      throw new BadRequestException(
        i18nMessage("server.admin.payout.referenceRequired"),
      );
    }
    const outcome = await this.prisma.$transaction(async (tx) => {
      const row = await this.loadRow(tx, transferId);
      const earlier = this.alreadySettled(row);
      if (earlier) return { result: earlier, row };

      const method = manualSettlementMethodFor(row);
      if (method !== opts.method) {
        if (
          opts.method === "external_bank" &&
          transferTotalOf(row.providerResponse)?.missingInput
        ) {
          throw new ConflictException(
            i18nMessage("server.admin.payout.markPaidMissingInput"),
          );
        }
        throw new ConflictException(
          i18nMessage("server.admin.payout.markPaidNotAllowed", {
            status: row.status,
            reason: row.failureReason ?? "-",
          }),
        );
      }
      const net = manualSettlementNet(row, method);
      if (!(net > PAYOUT_MIN_NET)) {
        throw new ConflictException(
          i18nMessage("server.admin.payout.markPaidPayoutBlocked", {
            reason: PAYOUT_FAILURE_FULLY_REFUNDED,
          }),
        );
      }
      if (!sameKurus(net, opts.expectedNetAmount)) {
        throw new ConflictException(
          i18nMessage("server.admin.payout.markPaidAmountChanged", {
            current: net.toFixed(2),
          }),
        );
      }
      // The platform pays from its own account what the processor would have
      // sent: the same guards hold (no refund in flight, order still payable,
      // the seller still entitled to this net). They run under the payment
      // and order row locks that refund attempts and refund requests take,
      // on the row read again after the locks, so a refund cannot start
      // between the check and the commit. PayTR-confirmed money already
      // moved; that row only records it.
      if (method === "external_bank") {
        const locked = await this.lockSource(tx, row);
        if (
          locked.updatedAt.getTime() !== row.updatedAt.getTime() ||
          !sameKurus(locked.netAmount, row.netAmount)
        ) {
          throw new ConflictException(
            i18nMessage("server.admin.payout.transferStateChanged"),
          );
        }
        const blocked = await this.externalSettlementBlock(tx, locked);
        if (blocked) {
          throw new ConflictException(
            i18nMessage("server.admin.payout.markPaidPayoutBlocked", {
              reason: blocked,
            }),
          );
        }
      }

      const settledAt = new Date();
      const refs = this.ledgerRefs(row);
      // An earlier completion of this row (a transfer the bank returned, then
      // retried) already closed the escrow and booked the payout: the ledger
      // has one payout for one seller debt and stays as it is.
      const alreadyBooked =
        (await tx.ledgerEntry.findFirst({
          where: { idempotencyKey: payoutCompletedLedgerKey(row.id) },
          select: { id: true },
        })) !== null;
      const record: ManualSettlementRecord = {
        method,
        reference,
        adminId: opts.actor,
        settledAt: settledAt.toISOString(),
        netAmount: net,
        platformFundedAmount:
          method === "external_bank" && !alreadyBooked
            ? platformFundingAmount(net, await this.escrowBalance(tx, refs))
            : 0,
      };

      // Claim first: a request that loses the race writes nothing.
      const previousResponse = asRecord(row.providerResponse) ?? {};
      const claimed = await tx.payoutTransfer.updateMany({
        where: {
          id: row.id,
          status: PayoutStatus.failed,
          failureReason: row.failureReason,
          updatedAt: row.updatedAt,
        },
        data: {
          status: PayoutStatus.completed,
          processedAt: settledAt,
          failureReason: null,
          nextRetryAt: null,
          providerResponse: {
            ...previousResponse,
            manualSettlement: record,
          } as unknown as Prisma.InputJsonValue,
          ...(method === "external_bank"
            ? {
                // PayTR carried nothing: siblings on the oid must not count
                // this row (a null total would count `amount`), the PSP
                // comparison must not see a transfer, and the returned-
                // transfer scan must not match it (it needs submittedAt).
                submittedTotalAmount: 0,
                submittedAt: null,
                submittedAmount: null,
              }
            : {
                // Same stamps as a PayTR callback for an unknown outcome:
                // the failure was recorded right after the send, so its time
                // is the send time; the total it took stays counted.
                submittedAt: row.updatedAt,
                submittedAmount: net,
              }),
        },
      });
      if (claimed.count !== 1) {
        // Lost a race. A second click of the same action finds the row
        // settled once the first commits; anything else moved it (callback,
        // retry) and this request must not settle it again.
        const now = await this.loadRow(tx, transferId);
        const settled = this.alreadySettled(now);
        if (settled) return { result: settled, row: now };
        throw new ConflictException(
          i18nMessage("server.admin.payout.transferStateChanged"),
        );
      }

      // Inside the transaction: a ledger failure rolls the settlement back.
      const ledgerMetadata = { method, reference } as Prisma.InputJsonValue;
      if (alreadyBooked) {
        this.logger.warn(
          `Payout ${row.id} (${row.transId}) manual settlement: the ledger already has its payout_completed group; no ledger entries written`,
        );
      } else {
        if (record.platformFundedAmount > 0) {
          await this.ledger.record(
            tx,
            platformFundingLedgerInput(
              refs,
              record.platformFundedAmount,
              ledgerMetadata,
            ),
          );
        }
        await this.ledger.record(
          tx,
          payoutCompletedLedgerInput(refs, net, ledgerMetadata),
        );
      }

      const result: ManualSettlementResult = {
        transferId: row.id,
        transId: row.transId,
        sellerId: row.sellerId,
        orderId: refs.orderId,
        tradeId: refs.tradeId ?? null,
        method,
        reference,
        netAmount: net,
        platformFundedAmount: record.platformFundedAmount,
        settledAt: record.settledAt,
        alreadySettled: false,
      };
      await opts.afterWrite?.(tx, result, previousOf(row));
      return { result, row };
    });

    const { result, row } = outcome;
    if (!result.alreadySettled) {
      this.logger.log(
        `Payout ${result.transferId} (${result.transId}) marked as paid by admin ${opts.actor}: ${result.method}, net ${result.netAmount} TL, platform-funded ${result.platformFundedAmount} TL`,
      );
      await this.payouts.sendPayoutReleasedEmail(
        result.sellerId,
        result.netAmount,
        row.transferIban,
      );
    }
    return result;
  }

  private async loadRow(
    tx: Prisma.TransactionClient,
    transferId: string,
  ): Promise<ResolutionRow> {
    const row = await tx.payoutTransfer.findUnique({
      where: { id: transferId },
      select: RESOLUTION_ROW_SELECT,
    });
    if (!row) {
      throw new NotFoundException(
        i18nMessage("server.admin.payout.transferNotFound"),
      );
    }
    return row;
  }

  /** A row this endpoint already settled: the earlier result, unchanged. */
  private alreadySettled(row: ResolutionRow): ManualSettlementResult | null {
    if (row.status !== PayoutStatus.completed) return null;
    const record = manualSettlementOf(row.providerResponse);
    if (!record) return null;
    const refs = this.ledgerRefs(row);
    return {
      transferId: row.id,
      transId: row.transId,
      sellerId: row.sellerId,
      orderId: refs.orderId,
      tradeId: refs.tradeId ?? null,
      method: record.method,
      reference: record.reference,
      netAmount: record.netAmount,
      platformFundedAmount: record.platformFundedAmount,
      settledAt: record.settledAt,
      alreadySettled: true,
    };
  }

  private ledgerRefs(row: ResolutionRow): PayoutLedgerRefs {
    return {
      payoutId: row.id,
      sellerId: row.sellerId,
      orderId: row.paymentHold?.orderId ?? null,
      holdId: row.paymentHoldId,
      tradeId: row.tradeCashPayment?.tradeId ?? null,
    };
  }

  /**
   * What the seller's escrow for this payout's source still holds in the
   * ledger: per order, or per trade and recipient for trade cash.
   */
  private escrowBalance(
    tx: Prisma.TransactionClient,
    refs: PayoutLedgerRefs,
  ): Promise<number> {
    if (refs.orderId) {
      return this.ledger.accountBalance(
        LedgerAccount.seller_escrow,
        { orderId: refs.orderId },
        tx,
      );
    }
    if (refs.tradeId) {
      return this.ledger.accountBalance(
        LedgerAccount.seller_escrow,
        { tradeId: refs.tradeId, sellerId: refs.sellerId },
        tx,
      );
    }
    return Promise.resolve(0);
  }

  /**
   * Locks the payout's payment row, then its order row (the lock order of
   * the money paths, payment-order-lock.ts), and reads the payout again.
   * Refund attempts lock the payment and refund requests the order, so
   * neither can start until this settlement commits.
   */
  private async lockSource(
    tx: Prisma.TransactionClient,
    row: ResolutionRow,
  ): Promise<ResolutionRow> {
    const paymentId =
      row.paymentHold?.paymentId ?? row.tradeCashPayment?.payment?.id ?? null;
    if (paymentId) {
      await tx.$queryRaw`SELECT id FROM payments WHERE id = ${paymentId} FOR UPDATE`;
    }
    if (row.paymentHold) {
      await tx.$queryRaw`SELECT id FROM orders WHERE id = ${row.paymentHold.orderId} FOR UPDATE`;
    }
    return this.loadRow(tx, row.id);
  }

  /**
   * The processor's pre-send guards, for a payout the platform pays itself:
   * order still payable, no refund in flight, and the seller still entitled
   * to the row's net (a refund since the row was parked lowers it: retry, so
   * the processor recomputes, instead of paying the old net). Trade cash:
   * the cash payment is completed, released and not refunded.
   */
  private async externalSettlementBlock(
    tx: Prisma.TransactionClient,
    row: ResolutionRow,
  ): Promise<ExternalSettlementBlock | null> {
    const hold = row.paymentHold;
    if (hold) {
      const order = await tx.order.findUnique({
        where: { id: hold.orderId },
        select: { status: true },
      });
      if (!order) return PAYOUT_FAILURE.orderNotPayoutEligible;
      const orderBlock = await this.payouts.orderPayoutBlock(
        { id: hold.orderId, status: order.status },
        tx,
      );
      if (orderBlock) return orderBlock;
      const refund = await this.payouts.findBlockingRefund(
        { orderId: hold.orderId, paymentId: hold.paymentId },
        tx,
      );
      if (refund) return refund;
      const entitled = entitledNetFromHold(hold);
      if (entitled <= PAYOUT_MIN_NET) return PAYOUT_FAILURE_FULLY_REFUNDED;
      return toKurus(entitled) < toKurus(row.netAmount)
        ? "net_above_entitlement"
        : null;
    }
    const tradeCash = row.tradeCashPayment;
    if (tradeCash?.payment) {
      if (tradeCash.refundedAt) return PAYOUT_FAILURE_FULLY_REFUNDED;
      if (
        tradeCash.status !== PaymentStatus.completed ||
        !tradeCash.releasedAt
      ) {
        return PAYOUT_FAILURE.orderNotPayoutEligible;
      }
      const refund = await this.payouts.findBlockingRefund(
        {
          orderId: null,
          paymentId: tradeCash.payment.id,
          tradeId: tradeCash.tradeId,
        },
        tx,
      );
      if (refund) return refund;
      return toKurus(tradeCash.amount) < toKurus(row.netAmount)
        ? "net_above_entitlement"
        : null;
    }
    // No hold and no paid trade cash: the total check parked it with a
    // missing input, which never reaches this point.
    return PAYOUT_FAILURE.orderNotPayoutEligible;
  }
}
