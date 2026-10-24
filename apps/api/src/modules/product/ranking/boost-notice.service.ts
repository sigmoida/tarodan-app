import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { BoostStatus } from "@prisma/client";
import { PrismaService } from "../../../prisma";
import { OutboxService } from "../../outbox/outbox.service";
import { OutboxHandlerRegistry } from "../../outbox/outbox-handler.registry";
import {
  OUTBOX_BOOST_NOTICE,
  boostNoticeDedupeKey,
  type BoostNoticeKind,
  type BoostNoticePayload,
} from "../../outbox/outbox.types";
import { NotificationService } from "../../notification/notification.service";
import { NotificationType } from "../../notification/dto";
import { errorMessage } from "../../../common/helpers/error-message";
import { BOOST_REMINDER_LEAD_MS } from "../boost-timeline/boost-expiry.service";

const KIND_TO_TYPE: Record<BoostNoticeKind, NotificationType> = {
  granted: NotificationType.BOOST_GRANTED,
  cancelled: NotificationType.BOOST_CANCELLED,
  refunded: NotificationType.BOOST_REFUNDED,
  ending_soon: NotificationType.BOOST_ENDING_SOON,
  expired: NotificationType.BOOST_EXPIRED,
};

/**
 * Seller notices of a boost, through the outbox (apps/api/CLAUDE.md, "Side
 * effects go through the outbox"): staff actions (grant, revoke, refund and
 * stop) and the expire-boosts cron (ends within 24 hours, ended).
 * `BoostTimelineService` writes the row in the transaction that changes the
 * boost; the caller then sends it at once (`flush`), and the drainer sends it
 * if the process stops in between, or when the change committed elsewhere (a
 * boost refund finalized by the recovery cron).
 */
@Injectable()
export class BoostNoticeService implements OnModuleInit {
  private readonly logger = new Logger(BoostNoticeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
    private readonly outboxHandlers: OutboxHandlerRegistry,
    private readonly notificationService: NotificationService,
  ) {}

  onModuleInit(): void {
    this.outboxHandlers.register(OUTBOX_BOOST_NOTICE, async (payload) =>
      this.send(payload as BoostNoticePayload),
    );
  }

  /** After commit: sends the queued notice now; a failure leaves it to the drainer. */
  async flush(notice: BoostNoticePayload): Promise<void> {
    try {
      await this.outbox.runInline(
        this.prisma,
        boostNoticeDedupeKey(notice),
        () => this.send(notice),
      );
    } catch (error: unknown) {
      this.logger.warn(
        `boost notice deferred to the outbox (${notice.kind} ${notice.boostId}): ${errorMessage(error)}`,
      );
    }
  }

  /**
   * The outbox handler: one notice to the boost's seller, read when it is
   * sent (the refunded amount is final by then). A boost that no longer
   * exists (deleted with its listing) has nobody to tell, and an ending-soon
   * reminder delivered late (the drainer) is dropped once it is no longer
   * true (`reminderStillHolds`).
   */
  async send(
    notice: BoostNoticePayload,
    now: Date = new Date(),
  ): Promise<void> {
    const boost = await this.prisma.productBoost.findUnique({
      where: { id: notice.boostId },
      select: {
        userId: true,
        productId: true,
        durationDays: true,
        refundedAmount: true,
        status: true,
        endsAt: true,
        product: { select: { title: true } },
      },
    });
    if (!boost) return;
    if (
      notice.kind === "ending_soon" &&
      !(await this.reminderStillHolds(boost, now))
    ) {
      return;
    }
    // The record must exist before the push: a retry then pushes once.
    await this.notificationService.createInAppNotification(
      boost.userId,
      KIND_TO_TYPE[notice.kind],
      {
        // Identity: a mobile tap opens the listing itself.
        productId: boost.productId,
        productTitle: boost.product.title,
        ...(notice.kind === "granted" ? { days: boost.durationDays } : {}),
        ...(notice.kind === "refunded"
          ? { amount: Number(boost.refundedAmount ?? 0) }
          : {}),
      },
      { pushRequiresRecord: true },
    );
  }

  /**
   * "Ends within 24 hours" still holds when the boost runs, ends within the
   * lead time and is still the listing's last running boost: a reminder the
   * drainer delivers after a stacked purchase, an extension or a stop would
   * otherwise tell the seller the listing ends while it stays featured.
   */
  private async reminderStillHolds(
    boost: { productId: string; status: BoostStatus; endsAt: Date | null },
    now: Date,
  ): Promise<boolean> {
    if (boost.status !== BoostStatus.active || !boost.endsAt) return false;
    const left = boost.endsAt.getTime() - now.getTime();
    if (left <= 0 || left > BOOST_REMINDER_LEAD_MS) return false;
    const later = await this.prisma.productBoost.count({
      where: {
        productId: boost.productId,
        status: BoostStatus.active,
        endsAt: { gt: boost.endsAt },
      },
    });
    return later === 0;
  }
}
