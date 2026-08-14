import { BadRequestException, Injectable } from "@nestjs/common";
import { PrismaService } from "../../../prisma";
import { Prisma, RefundAttemptStatus } from "@prisma/client";
import { MONEY_EPSILON } from "../helpers/payment.constants";
import { i18nMessage } from "../../i18n";
import { RefundPendingReconciliationException } from "../../payment-providers/refund-errors";

/**
 * Dayanıklı iade denemesi defteri — PaymentRefundService'ten birebir taşındı.
 * Sağlayıcıya (PayTR) bir iade isteği GİTMEDEN önce niyet veritabanına yazılır;
 * böylece istek ile yanıt arasında çökülse bile ortada hangi tutarın yolda
 * olduğunu bilen bir kayıt kalır ve tekrar deneme parayı ikilemez.
 *
 * Sipariş iadesi ve takas nakit iadesi bu defteri PAYLAŞIR: ikisi de aynı
 * prepared → submitting geçişini kullanır. Ayrı kopyalar tutmak, iki para
 * yolunun idempotency kuralının sessizce ayrışması demekti.
 */
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
  ): Promise<{
    action: "submit" | "finalize" | "done";
    attempt: {
      id: string;
      status: RefundAttemptStatus;
      providerRefundId: string | null;
      providerResponse: Prisma.JsonValue | null;
    };
  }> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM payments WHERE id = ${paymentId} FOR UPDATE`;
      const fresh = await tx.payment.findUnique({
        where: { id: paymentId },
        select: { metadata: true },
      });
      const meta = (fresh?.metadata as Record<string, any>) || {};
      const refundedOrders =
        (meta.refundedOrders as Record<string, number>) || {};

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
        if (
          attempt.paymentId !== paymentId ||
          attempt.orderId !== orderId ||
          Math.abs(Number(attempt.amount) - amountToRefund) > MONEY_EPSILON
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
        throw new RefundPendingReconciliationException(
          i18nMessage("server.payment.refundInitiationFailed"),
        );
      }

      attempt = await tx.refundAttempt.create({
        data: {
          paymentId,
          orderId,
          idempotencyKey,
          amount: amountToRefund,
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
    attempt: {
      id: string;
      status: RefundAttemptStatus;
      providerRefundId: string | null;
      providerResponse: Prisma.JsonValue | null;
    };
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
        throw new RefundPendingReconciliationException(
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
