import { BadRequestException, Injectable } from "@nestjs/common";
import { PrismaService } from "../../../prisma";
import { Prisma, RefundAttemptStatus } from "@prisma/client";
import { MONEY_EPSILON } from "../helpers/payment.constants";
import { asPaymentMetadata } from "../helpers/payment-metadata.types";
import {
  refundFeeShareFor,
  refundGoodsPartOf,
} from "../helpers/charged-amount";
import { i18nMessage } from "../../i18n";
// Two refusals, both before this call sends anything: a different attempt of
// the order is unresolved (`RefundAttemptInFlight`, this call's intent has no
// attempt), or this key's own attempt is in flight or uncertain
// (`RefundPendingReconciliation`: the money of this intent may be moving,
// for example the stuck-refund recovery submitting it).
import {
  RefundAttemptInFlightException,
  RefundPendingReconciliationException,
} from "../../payment-providers/refund-errors";

/**
 * The durable refund attempt log (moved from PaymentRefundService as is).
 * The intent is written to the database BEFORE a refund request goes to the
 * provider (PayTR), so a crash between the request and its answer leaves a
 * row that knows which amount is on its way, and a retry never pays twice.
 *
 * Order refunds and trade cash refunds SHARE this log: both use the same
 * prepared -> submitting transition. Separate copies would let the
 * idempotency rule of the two money paths drift apart.
 *
 * Two scales (ADR 0019): an order refund attempt's `amount` is the PayTR
 * `return_amount`, its goods part plus the installment fee share
 * (`installmentFeeAmount`) priced here, under the payment lock, by
 * `refundFeeShareFor`. The caller passes and compares the goods part.
 */
/** What a claim hands back of the attempt it found or wrote. */
export interface ClaimedRefundAttempt {
  id: string;
  status: RefundAttemptStatus;
  /** PSP scale: the `return_amount` (goods part + fee share). */
  amount: Prisma.Decimal;
  /** The installment fee share inside `amount` (0 = none). */
  installmentFeeAmount: Prisma.Decimal;
  providerRefundId: string | null;
  providerResponse: Prisma.JsonValue | null;
}

@Injectable()
export class PaymentRefundAttemptService {
  constructor(private readonly prisma: PrismaService) {}

  async claimRefundAttempt(
    paymentId: string,
    orderId: string,
    amountToRefund: number,
    refundCap: number,
    isGroupPayment: boolean,
    idempotencyKey: string,
    provider: string,
    providerReference: string,
    /**
     * The caller's own precondition, checked under the payment lock right
     * before an attempt is (re)prepared to go to the provider; it throws to
     * refuse. Not run for an attempt that only finishes (already sent).
     */
    guard?: (tx: Prisma.TransactionClient) => Promise<void>,
  ): Promise<{
    action: "submit" | "finalize" | "done";
    attempt: ClaimedRefundAttempt;
  }> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM payments WHERE id = ${paymentId} FOR UPDATE`;
      // The fee share given back with this goods refund (0 without an
      // installment fee), priced under the payment lock so two refunds of the
      // payment never hand out the same fee.
      const feeShareFor = (excludeAttemptId?: string) =>
        refundFeeShareFor(tx, {
          paymentId,
          orderId,
          orderGoodsTotal: refundCap,
          goodsRefund: amountToRefund,
          excludeAttemptId,
        });
      const fresh = await tx.payment.findUnique({
        where: { id: paymentId },
        select: { metadata: true },
      });
      const refundedOrders =
        asPaymentMetadata(fresh?.metadata).refundedOrders ?? {};

      if (isGroupPayment && refundedOrders[orderId]) {
        throw new BadRequestException(
          i18nMessage("server.payment.orderAlreadyRefunded"),
        );
      }
      if (!isGroupPayment) {
        const prior = Number(refundedOrders[orderId] || 0);
        if (prior + amountToRefund > refundCap + MONEY_EPSILON) {
          throw new BadRequestException(
            i18nMessage("server.payment.refundAmountExceedsLimit", {
              amountToRefund,
              refundCap: Math.max(
                Math.round((refundCap - prior) * 100) / 100,
                0,
              ),
            }),
          );
        }
      }

      let attempt = await tx.refundAttempt.findUnique({
        where: { idempotencyKey },
      });
      if (attempt) {
        // The caller's amount is the goods part; the attempt holds the PSP
        // amount (goods + fee share).
        if (
          attempt.paymentId !== paymentId ||
          attempt.orderId !== orderId ||
          Math.abs(Number(refundGoodsPartOf(attempt)) - amountToRefund) >
            MONEY_EPSILON
        ) {
          throw new BadRequestException(
            i18nMessage("server.payment.refundInitiationFailed"),
          );
        }
        if (attempt.status === RefundAttemptStatus.finalized) {
          return { action: "done" as const, attempt };
        }
        if (attempt.status === RefundAttemptStatus.succeeded) {
          return { action: "finalize" as const, attempt };
        }
        if (
          attempt.status === RefundAttemptStatus.submitting ||
          attempt.status === RefundAttemptStatus.manual_review
        ) {
          throw new RefundPendingReconciliationException(
            i18nMessage("server.payment.refundInitiationFailed"),
          );
        }
        await guard?.(tx);
        if (attempt.status === RefundAttemptStatus.failed) {
          // A failed attempt moved no money: its fee share is priced again,
          // since other refunds of the payment may have finished meanwhile.
          const fee = await feeShareFor(attempt.id);
          attempt = await tx.refundAttempt.update({
            where: { id: attempt.id },
            data: {
              status: RefundAttemptStatus.prepared,
              failureReason: null,
              requestStartedAt: null,
              amount: fee.plus(amountToRefund),
              installmentFeeAmount: fee,
            },
          });
        }
        return { action: "submit" as const, attempt };
      }

      const unresolved = await tx.refundAttempt.findFirst({
        where: {
          paymentId,
          orderId,
          status: {
            in: [
              RefundAttemptStatus.prepared,
              RefundAttemptStatus.submitting,
              RefundAttemptStatus.succeeded,
              RefundAttemptStatus.manual_review,
            ],
          },
        },
      });
      if (unresolved) {
        throw new RefundAttemptInFlightException(
          i18nMessage("server.payment.refundInitiationFailed"),
        );
      }
      await guard?.(tx);

      const fee = await feeShareFor();
      attempt = await tx.refundAttempt.create({
        data: {
          paymentId,
          orderId,
          idempotencyKey,
          amount: fee.plus(amountToRefund),
          installmentFeeAmount: fee,
          provider,
          providerReference,
        },
      });
      return { action: "submit" as const, attempt };
    });
  }

  async startRefundSubmission(attemptId: string): Promise<void> {
    const started = await this.prisma.refundAttempt.updateMany({
      where: { id: attemptId, status: RefundAttemptStatus.prepared },
      data: {
        status: RefundAttemptStatus.submitting,
        requestStartedAt: new Date(),
      },
    });
    if (started.count !== 1) {
      // This attempt (this key) was started by another call, possibly the
      // stuck-refund recovery: its money is in flight, so it is pending.
      throw new RefundPendingReconciliationException(
        i18nMessage("server.payment.refundInitiationFailed"),
      );
    }
  }

  async claimTradeRefundAttempt(
    paymentId: string,
    tradeId: string,
    amount: number,
    provider: string,
    providerReference: string,
  ): Promise<{
    action: "submit" | "finalize" | "done";
    attempt: ClaimedRefundAttempt;
  }> {
    const idempotencyKey = `trade-cash-refund:${paymentId}`;
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM payments WHERE id = ${paymentId} FOR UPDATE`;
      let attempt = await tx.refundAttempt.findUnique({
        where: { idempotencyKey },
      });
      if (attempt) {
        if (
          attempt.paymentId !== paymentId ||
          attempt.tradeId !== tradeId ||
          Math.abs(Number(attempt.amount) - amount) > MONEY_EPSILON
        ) {
          throw new BadRequestException(
            i18nMessage("server.payment.refundInitiationFailed"),
          );
        }
        if (attempt.status === RefundAttemptStatus.finalized) {
          return { action: "done" as const, attempt };
        }
        if (attempt.status === RefundAttemptStatus.succeeded) {
          return { action: "finalize" as const, attempt };
        }
        if (
          attempt.status === RefundAttemptStatus.submitting ||
          attempt.status === RefundAttemptStatus.manual_review
        ) {
          throw new RefundPendingReconciliationException(
            i18nMessage("server.payment.refundInitiationFailed"),
          );
        }
        if (attempt.status === RefundAttemptStatus.failed) {
          attempt = await tx.refundAttempt.update({
            where: { id: attempt.id },
            data: {
              status: RefundAttemptStatus.prepared,
              failureReason: null,
              requestStartedAt: null,
            },
          });
        }
        return { action: "submit" as const, attempt };
      }

      const unresolved = await tx.refundAttempt.findFirst({
        where: {
          paymentId,
          tradeId,
          status: {
            in: [
              RefundAttemptStatus.prepared,
              RefundAttemptStatus.submitting,
              RefundAttemptStatus.succeeded,
              RefundAttemptStatus.manual_review,
            ],
          },
        },
      });
      if (unresolved) {
        throw new RefundAttemptInFlightException(
          i18nMessage("server.payment.refundInitiationFailed"),
        );
      }

      attempt = await tx.refundAttempt.create({
        data: {
          paymentId,
          tradeId,
          idempotencyKey,
          amount,
          provider,
          providerReference,
        },
      });
      return { action: "submit" as const, attempt };
    });
  }
}
