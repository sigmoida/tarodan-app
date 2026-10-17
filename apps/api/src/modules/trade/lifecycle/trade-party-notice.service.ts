import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../../../prisma";
import { OutboxService } from "../../outbox/outbox.service";
import { OutboxHandlerRegistry } from "../../outbox/outbox-handler.registry";
import {
  OUTBOX_TRADE_PARTY_NOTICE,
  tradePartyNoticeDedupeKey,
  type TradePartyNoticeKind,
  type TradePartyNoticePayload,
} from "../../outbox/outbox.types";
import { NotificationService } from "../../notification/notification.service";
import { NotificationType } from "../../notification/dto";

const KIND_TO_TYPE: Record<
  Exclude<TradePartyNoticeKind, "completed">,
  NotificationType
> = {
  cancelled: NotificationType.TRADE_CANCELLED,
  dispute_opened: NotificationType.TRADE_DISPUTE_OPENED,
  dispute_resolved: NotificationType.TRADE_DISPUTE_RESOLVED,
};

/**
 * Takas taraf duyuruları — outbox üzerinden (apps/api/CLAUDE.md outbox). Olayın tx'inde
 * `enqueue`, commit sonrası `flush` (anlık yol, `runInline`); süreç arada ölürse
 * drainer aynı handler'ı çalıştırır. `dedupeKey` alıcı × olay başına tektir.
 */
@Injectable()
export class TradePartyNoticeService implements OnModuleInit {
  private readonly logger = new Logger(TradePartyNoticeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
    private readonly outboxHandlers: OutboxHandlerRegistry,
    private readonly notificationService: NotificationService,
  ) {}

  onModuleInit(): void {
    this.outboxHandlers.register(OUTBOX_TRADE_PARTY_NOTICE, async (payload) =>
      this.send(payload as TradePartyNoticePayload),
    );
  }

  /** Olayın tx'inde: alıcı başına bir outbox satırı. */
  async enqueue(
    tx: Prisma.TransactionClient,
    notices: TradePartyNoticePayload[],
  ): Promise<void> {
    for (const notice of notices) {
      await this.outbox.enqueue(tx, {
        type: OUTBOX_TRADE_PARTY_NOTICE,
        payload: {
          tradeId: notice.tradeId,
          userId: notice.userId,
          kind: notice.kind,
        } satisfies TradePartyNoticePayload,
        dedupeKey: tradePartyNoticeDedupeKey(notice),
      });
    }
  }

  /** Commit sonrası anlık yol; hata satırı drainer'a bırakır, çağıranı bozmaz. */
  async flush(notices: TradePartyNoticePayload[]): Promise<void> {
    for (const notice of notices) {
      try {
        await this.outbox.runInline(
          this.prisma,
          tradePartyNoticeDedupeKey(notice),
          () => this.send(notice),
        );
      } catch (error) {
        this.logger.warn(
          `trade party notice deferred to outbox (${notice.kind} ${notice.tradeId}): ${error}`,
        );
      }
    }
  }

  /** Outbox handler'ı: TEK alıcıya TEK olay duyurusu. Hata fırlar → yeniden denenir. */
  async send(payload: TradePartyNoticePayload): Promise<void> {
    if (payload.kind === "completed") {
      // Zil + push + "takasınız tamamlandı" e-postası (mevcut, hiç çağrılmayan akış).
      await this.notificationService.notifyTradeCompleted(
        payload.userId,
        payload.tradeId,
      );
      return;
    }
    // Kayıt yazılamazsa push da gitmez; yeniden denemede ikisi birlikte bir kez gider.
    await this.notificationService.createInAppNotification(
      payload.userId,
      KIND_TO_TYPE[payload.kind],
      { tradeId: payload.tradeId },
      { pushRequiresRecord: true },
    );
  }
}
