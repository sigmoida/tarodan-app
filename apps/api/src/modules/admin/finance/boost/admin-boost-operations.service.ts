import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from "@nestjs/common";
import {
  BoostSource,
  BoostStatus,
  CancellationActor,
  Prisma,
} from "@prisma/client";
import { PrismaService } from "../../../../prisma";
import { i18nMessage, localizedPayloadOf } from "../../../i18n";
import { SentryService } from "../../../sentry/sentry.service";
import { PaymentService } from "../../../payment/payment.service";
import {
  boostRefundIdempotencyKey,
  boostRefundKeyPrefix,
} from "../../../payment/helpers/boost-refund-key";
import {
  RefundAttemptInFlightException,
  RefundPendingReconciliationException,
} from "../../../payment-providers/refund-errors";
import { BoostTimelineService } from "../../../product/boost-timeline/boost-timeline.service";
import { BoostNoticeService } from "../../../product/ranking/boost-notice.service";
import { errorMessage } from "../../../../common/helpers/error-message";
import { AdminAuditService } from "../../ops/admin-audit.service";
import { AdminAdPackageService } from "../admin-ad-package.service";
import {
  GrantBoostDto,
  RefundBoostDto,
  RevokeBoostDto,
} from "../../dto/ad-package.dto";
import {
  BOOST_REFUNDABLE_STATUSES,
  boostRefundableAmount,
} from "./boost-refund-policy";

/** Audit `entityType` of the staff boost actions. */
const AUDIT_ENTITY = "ProductBoost";

/**
 * The `boost_refund` audit outcome of a refund call that threw:
 * `in_flight_elsewhere` when the attempt claim turned it away before it sent
 * anything (another refund attempt on the order is unresolved, typically a
 * concurrent try of this boost, which records its own outcome),
 * `pending_reconciliation` when this call's own attempt may have reached
 * PayTR, `failed` otherwise.
 */
export function boostRefundFailureOutcome(
  error: unknown,
): "in_flight_elsewhere" | "pending_reconciliation" | "failed" {
  if (error instanceof RefundAttemptInFlightException) {
    return "in_flight_elsewhere";
  }
  return error instanceof RefundPendingReconciliationException
    ? "pending_reconciliation"
    : "failed";
}

/**
 * Staff boost operations on the "Boost purchases" screen (tarodan-ops plan
 * 2026-10-21-listing-boost, section 3.7): a free grant, a revoke of a grant,
 * and refund and stop of a paid boost. Every timeline change goes through
 * `BoostTimelineService` under the listing lock; every action has a required
 * audit row; the seller notice is queued with the change (outbox) and sent
 * right after it. Sentry: tag `flow=boost`, boost id and order number only.
 */
@Injectable()
export class AdminBoostOperationsService {
  private readonly logger = new Logger(AdminBoostOperationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly timeline: BoostTimelineService,
    private readonly payments: PaymentService,
    private readonly audit: AdminAuditService,
    private readonly purchases: AdminAdPackageService,
    private readonly notices: BoostNoticeService,
    @Optional() private readonly sentry?: SentryService,
  ) {}

  private trace(action: string, data: Record<string, string | null>): void {
    this.sentry?.setTag("flow", "boost");
    this.sentry?.addBreadcrumb({
      category: "boost",
      message: `boost.admin.${action}`,
      level: "info",
      data,
    });
  }

  /**
   * Free boost for a live listing (decision D3): no order, no payment, no
   * invoice, not revenue. Stacks like a purchase; the listing can be named by
   * its id or its listing code. One transaction with its audit row.
   */
  async grant(adminUserId: string, dto: GrantBoostDto) {
    const product = await this.prisma.product.findFirst({
      where: {
        OR: [
          { id: dto.productId },
          { productCode: dto.productId.toUpperCase() },
        ],
      },
      select: { id: true },
    });
    if (!product) {
      throw new NotFoundException(i18nMessage("server.product.notFound"));
    }
    const pkg = dto.packageId
      ? await this.prisma.adPackage.findUnique({
          where: { id: dto.packageId },
          select: { id: true, name: true, showcaseOnHome: true },
        })
      : null;
    if (dto.packageId && !pkg) {
      throw new NotFoundException(
        i18nMessage("server.admin.adPackage.notFound"),
      );
    }

    const granted = await this.prisma.$transaction(async (tx) => {
      const result = await this.timeline.grant(tx, {
        productId: product.id,
        packageId: pkg?.id ?? null,
        packageName: pkg?.name ?? null,
        showcaseOnHome: pkg?.showcaseOnHome ?? false,
        durationDays: dto.durationDays,
        grantedById: adminUserId,
        reason: dto.reason,
      });
      await this.audit.createRequiredAuditLog(
        adminUserId,
        "boost_grant",
        AUDIT_ENTITY,
        result.boostId,
        null,
        {
          productId: product.id,
          packageId: pkg?.id ?? null,
          durationDays: dto.durationDays,
          endsAt: result.endsAt,
          reason: dto.reason,
        },
        tx,
      );
      return result;
    });
    this.trace("grant", { boostId: granted.boostId, orderNumber: null });
    await this.notices.flush({ boostId: granted.boostId, kind: "granted" });
    return this.purchases.getPurchase(granted.boostId);
  }

  /**
   * Stops a free grant early, without money. A paid boost is never revoked:
   * it is refunded and stopped (`refund`).
   */
  async revoke(adminUserId: string, boostId: string, dto: RevokeBoostDto) {
    const boost = await this.prisma.productBoost.findUnique({
      where: { id: boostId },
      select: { id: true, source: true, status: true },
    });
    if (!boost) {
      throw new NotFoundException(
        i18nMessage("server.admin.adPackage.purchaseNotFound"),
      );
    }
    if (boost.source !== BoostSource.admin_grant) {
      throw new BadRequestException(
        i18nMessage("server.admin.boost.revokeGrantOnly"),
      );
    }

    const stopped = await this.prisma.$transaction(async (tx) => {
      const result = await this.timeline.cancel(tx, boostId, {
        actorId: adminUserId,
        reason: dto.reason,
      });
      if (result.stopped) {
        await this.audit.createRequiredAuditLog(
          adminUserId,
          "boost_revoke",
          AUDIT_ENTITY,
          boostId,
          { status: boost.status },
          {
            status: BoostStatus.cancelled,
            unconsumedSeconds: result.unconsumedSeconds,
            reason: dto.reason,
          },
          tx,
        );
      }
      return result;
    });
    // Checked under the listing lock: it ended or was stopped meanwhile.
    if (!stopped.stopped) {
      throw new BadRequestException(
        i18nMessage("server.admin.boost.stopActiveOrPausedOnly"),
      );
    }
    this.trace("revoke", { boostId, orderNumber: null });
    await this.notices.flush({ boostId, kind: "cancelled" });
    return this.purchases.getPurchase(boostId);
  }

  /**
   * Refund and stop a paid boost (decisions D1, D2). The amount defaults to
   * all that is refundable and may be less (`boostRefundableAmount`).
   *
   * Order of operations: the refund runs first, through the shared executor
   * (`processRefund`: refund attempt written before PayTR, PayTR on the store
   * the boost was paid on, payment and order records, the e-Arşiv
   * cancellation or return invoice through the outbox, no ledger lines for
   * the platform seller). Its finalize transaction stops the boost with the
   * money (`BoostTimelineService.stopForRefund`): the boost leaves the
   * listing's queue, the boosts behind it move up, the amount and the
   * admin's reason are written on it. If PayTR fails, nothing changes on the
   * boost and the error reaches the admin.
   *
   * Never twice: every try gets a fresh attempt key (`boost-refund:<id>:<n>`,
   * so a try PayTR refused can be repeated with another amount); the claim
   * refuses a new attempt while an earlier one is unresolved, and the claim
   * guard, under the payment lock, refuses a boost that a finished refund
   * stopped meanwhile. A retry after a finished refund answers with the
   * stopped purchase.
   */
  async refund(adminUserId: string, boostId: string, dto: RefundBoostDto) {
    const boost = await this.prisma.productBoost.findUnique({
      where: { id: boostId },
      select: {
        id: true,
        source: true,
        status: true,
        price: true,
        refundedAmount: true,
        orderId: true,
      },
    });
    if (!boost) {
      throw new NotFoundException(
        i18nMessage("server.admin.adPackage.purchaseNotFound"),
      );
    }
    // A replay of a refund that went through (the first response was lost).
    if (
      boost.status === BoostStatus.cancelled &&
      boost.refundedAmount?.gt(0) &&
      (dto.amount === undefined || boost.refundedAmount.eq(dto.amount))
    ) {
      return this.purchases.getPurchase(boostId);
    }

    const order = boost.orderId
      ? await this.prisma.order.findUnique({
          where: { id: boost.orderId },
          select: {
            id: true,
            orderNumber: true,
            payment: { select: { status: true, amount: true, metadata: true } },
          },
        })
      : null;
    const max = boostRefundableAmount({
      ...boost,
      payment: order?.payment ?? null,
    });
    if (!order || max.lte(0)) {
      throw new BadRequestException(
        i18nMessage("server.admin.boost.refundNotAllowed"),
      );
    }
    const amount =
      dto.amount === undefined ? max : new Prisma.Decimal(dto.amount);
    if (amount.lte(0) || amount.gt(max)) {
      throw new BadRequestException(
        i18nMessage("server.admin.boost.refundAmountInvalid", {
          max: max.toNumber(),
        }),
      );
    }

    this.trace("refund", { boostId, orderNumber: order.orderNumber });
    const earlierAttempts = await this.prisma.refundAttempt.count({
      where: {
        orderId: order.id,
        idempotencyKey: { startsWith: boostRefundKeyPrefix(boostId) },
      },
    });
    const audited = (outcome: string, extra: Record<string, unknown> = {}) =>
      this.audit.createRequiredAuditLog(
        adminUserId,
        "boost_refund",
        AUDIT_ENTITY,
        boostId,
        { status: boost.status, refundedAmount: boost.refundedAmount },
        {
          outcome,
          amount: amount.toNumber(),
          orderNumber: order.orderNumber,
          reason: dto.reason,
          ...extra,
        },
      );
    let result: Awaited<ReturnType<PaymentService["processRefund"]>>;
    try {
      result = await this.payments.processRefund(order.id, amount.toNumber(), {
        idempotencyKey: boostRefundIdempotencyKey(boostId, earlierAttempts),
        cancelledBy: CancellationActor.platform,
        boostStop: { actorId: adminUserId, reason: dto.reason },
        // Under the payment lock, right before PayTR: a refund that finished
        // since the check above stopped the boost; never refund it twice.
        claimGuard: async (tx) => {
          const current = await tx.productBoost.findUnique({
            where: { id: boostId },
            select: { status: true },
          });
          if (!current || !BOOST_REFUNDABLE_STATUSES.includes(current.status)) {
            throw new BadRequestException(
              i18nMessage("server.admin.boost.refundNotAllowed"),
            );
          }
        },
      });
    } catch (error: unknown) {
      // The real outcome is audited (a refund that is not done is not written
      // as done); an audit failure must not hide the refund error.
      await audited(boostRefundFailureOutcome(error), {
        error: localizedPayloadOf(error) ?? errorMessage(error),
      }).catch((auditError: unknown) =>
        this.logger.error(
          `boost refund audit failed boost=${boostId}: ${errorMessage(auditError)}`,
        ),
      );
      throw error;
    }
    // Recorded only when this call refunded: an attempt another path had
    // already finished (`idempotent`, or finalized meanwhile) is not ours. The
    // money is back either way, so a failed audit write is reported, not
    // turned into an error for a refund that went through.
    const refundedNow = result !== null && !("idempotent" in result);
    if (refundedNow) {
      await audited("refunded").catch((auditError: unknown) => {
        this.logger.error(
          `BOOST_REFUND_AUDIT_MISSING: boost ${boostId} (order ${order.orderNumber}): ${errorMessage(auditError)}`,
        );
        this.sentry?.captureMessage(
          `Boost ${boostId} refund audit row missing (order ${order.orderNumber})`,
          "error",
        );
      });
    }

    // processRefund stopped the boost in its transaction; a boost still
    // running here means it did not, and the money is back already.
    const after = await this.prisma.productBoost.findUnique({
      where: { id: boostId },
      select: { status: true },
    });
    if (after?.status !== BoostStatus.cancelled) {
      this.logger.error(
        `BOOST_REFUND_NOT_STOPPED: boost ${boostId} (order ${order.orderNumber}) refunded but ${after?.status ?? "missing"}`,
      );
      this.sentry?.captureMessage(
        `Boost ${boostId} refunded but not stopped (order ${order.orderNumber})`,
        "error",
      );
    }
    await this.notices.flush({ boostId, kind: "refunded" });
    return this.purchases.getPurchase(boostId);
  }
}
