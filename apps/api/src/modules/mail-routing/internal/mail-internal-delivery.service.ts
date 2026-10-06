import { randomUUID } from "crypto";
import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { Prisma, type OutboxEvent } from "@prisma/client";
import type {
  MailAreaId,
  MailDeliveryMode,
  MailInternalEventId,
} from "@tarodan/types";
import { PrismaService } from "../../../prisma";
import { OutboxHandlerRegistry } from "../../outbox/outbox-handler.registry";
import { OUTBOX_MAIL_INTERNAL_EVENT } from "../../outbox/outbox.types";
import { SmtpProvider } from "../../mail/smtp.provider";
import { MailRoutingDirectory } from "../../mail/mail-routing-directory";
import {
  areaOfMailEvent,
  isMailAreaId,
  isMailInternalEventId,
} from "../../mail/helpers/mail-area-settings";
import { adminUrl, frontendUrlForEnvironment } from "../../../config/app-urls";
import type { CronRunSummary } from "../../../monitoring/cron-run.helper";
import type {
  MailInternalNoticePayload,
  MailInternalOutboxPayload,
} from "../helpers/mail-internal-notice.types";
import {
  renderInternalDigest,
  renderInternalNotice,
  type MailInternalRenderContext,
} from "../helpers/mail-internal-content";
import {
  areaRecipients,
  internalNoticeRoute,
} from "./mail-internal-recipients";

export type MailDigestMode = Exclude<MailDeliveryMode, "instant">;

/** Tek özet e-postasına giren en çok olay. */
export const MAIL_DIGEST_BATCH_LIMIT = 200;

/**
 * Bir koşuda alan başına en çok özet e-postası (her biri en çok
 * `MAIL_DIGEST_BATCH_LIMIT` olay). Birikmiş kuyruk bu sınıra kadar aynı koşuda
 * boşaltılır; sınır aşılırsa loglanır, kalan bir sonraki koşuya kalır.
 */
export const MAIL_DIGEST_MAX_MAILS_PER_AREA = 20;

/** Bu süreden eski, gönderilmemiş sahiplenme bayattır (koşu yarıda ölmüş). */
export const MAIL_DIGEST_STALE_CLAIM_MS = 30 * 60 * 1000;

/**
 * Anlık bildirimin outbox denemeleri bu süre içinde biter (5 deneme, üstel
 * bekleme ~2,5 dk). Bu süreden eski, hâlâ gönderilmemiş `instant` kayıt ölü
 * sayılır ve saatlik özete katılır — hiçbir olay sessizce kaybolmaz.
 */
export const MAIL_INSTANT_GRACE_MS = 15 * 60 * 1000;

/** Kayıtların saklama süresi (günlük koşu temizler; gönderilmemişler dahil). */
export const MAIL_NOTICE_RETENTION_DAYS = 90;

/**
 * Personel bildirimlerinin gönderimi:
 *  - outbox handler'ı (`mail.internal_event`): olayın alanını ve ayarını
 *    okur, kalıcı kaydı yazar; `instant` ise hemen gönderir,
 *  - özet işi (`mail-digest-hourly` / `-daily`): birikmiş kayıtları alan
 *    başına TEK e-postada toplar.
 *
 * İdempotent: kayıt outbox olay kimliğiyle tekildir; gönderilmiş kayıt bir
 * daha gönderilmez. Gönderim başarısızsa handler fırlatır → outbox yeniden
 * dener; özet işinde sahiplenme bırakılır → bir sonraki koşu yeniden dener.
 *
 * Gönderen: alanın kendi kutusu (SmtpProvider `area` ile çözer), yoksa
 * varsayılan kimlik.
 */
@Injectable()
export class MailInternalDeliveryService implements OnModuleInit {
  private readonly logger = new Logger(MailInternalDeliveryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: OutboxHandlerRegistry,
    private readonly routing: MailRoutingDirectory,
    private readonly smtp: SmtpProvider,
  ) {}

  onModuleInit(): void {
    this.registry.register(
      OUTBOX_MAIL_INTERNAL_EVENT,
      (payload: MailInternalOutboxPayload, event: OutboxEvent) =>
        this.handleEvent(payload, event),
    );
  }

  /** Outbox handler'ı. */
  async handleEvent(
    payload: MailInternalOutboxPayload,
    event: Pick<OutboxEvent, "id">,
  ): Promise<void> {
    if (!isMailInternalEventId(payload?.eventId)) {
      this.logger.warn(
        `Bilinmeyen personel bildirimi bırakıldı: ${String(payload?.eventId)}`,
      );
      return;
    }
    const eventId = payload.eventId;
    const area = areaOfMailEvent(eventId);
    const route = internalNoticeRoute(eventId, await this.routing.area(area));
    // Olay kapatıldı ya da alıcı kalmadı: sessizce bırakılır.
    if (!route) return;

    const notice = await this.prisma.mailInternalNotice.upsert({
      where: { sourceKey: event.id },
      create: {
        sourceKey: event.id,
        areaId: area,
        eventId,
        delivery: route.delivery,
        payload: payload.notice as unknown as Prisma.InputJsonValue,
        occurredAt: new Date(payload.occurredAt),
      },
      update: {},
    });
    // Özet işi ölü sayıp sahiplendiyse (claimId) gönderim onundur.
    if (notice.sentAt || notice.claimId || notice.delivery !== "instant") {
      return;
    }

    const mail = renderInternalNotice(
      eventId,
      payload.notice,
      this.renderContext(route.recipients),
    );
    const result = await this.smtp.sendEmail({
      to: route.recipients.join(", "),
      subject: mail.subject,
      html: mail.html,
      area,
      template: `internal:${eventId}`,
      replyTo: payload.notice.replyTo,
    });
    if (!result.success) {
      // Outbox yeniden dener (kayıt gönderilmemiş kalır).
      throw new Error(
        `Personel bildirimi gönderilemedi (${eventId} ${payload.notice.ref}): ${result.error ?? "unknown"}`,
      );
    }
    await this.prisma.mailInternalNotice.updateMany({
      where: { id: notice.id, sentAt: null },
      data: { sentAt: new Date() },
    });
  }

  /**
   * Özet işi: modun gönderilmemiş kayıtlarını alan başına özet e-postalarında
   * gönderir — her e-posta en çok `MAIL_DIGEST_BATCH_LIMIT` olay, kuyruk
   * boşalana (ya da `MAIL_DIGEST_MAX_MAILS_PER_AREA`e) kadar. Saatlik koşu
   * ayrıca ölü anlık kayıtları (outbox denemeleri tükenmiş) toplar. Bir alanın
   * gönderimi başarısızsa diğerleri yine gider; koşu sonunda hata yükselir
   * (iş "başarısız" görünür, yeniden dener).
   */
  async runDigest(
    delivery: MailDigestMode,
    log: (msg: string) => void = () => undefined,
  ): Promise<CronRunSummary> {
    const now = new Date();
    const pending = this.pendingWhere(delivery, now);
    await this.prisma.mailInternalNotice.updateMany({
      where: {
        ...pending,
        claimId: { not: null },
        claimedAt: { lt: new Date(now.getTime() - MAIL_DIGEST_STALE_CLAIM_MS) },
      },
      data: { claimId: null, claimedAt: null },
    });

    const pendingAreas = await this.prisma.mailInternalNotice.findMany({
      where: { ...pending, claimId: null },
      select: { areaId: true },
      distinct: ["areaId"],
      orderBy: { areaId: "asc" },
    });

    const stats = { mails: 0, events: 0, dropped: 0, failed: 0, capped: 0 };
    for (const { areaId } of pendingAreas) {
      if (!isMailAreaId(areaId)) continue;
      try {
        let mails = 0;
        for (;;) {
          const outcome = await this.sendAreaDigest(
            areaId,
            delivery,
            pending,
            now,
          );
          if (outcome.events === 0 && outcome.dropped === 0) break;
          stats.events += outcome.events;
          stats.dropped += outcome.dropped;
          if (outcome.events > 0) {
            stats.mails += 1;
            mails += 1;
          }
          if (mails >= MAIL_DIGEST_MAX_MAILS_PER_AREA) {
            stats.capped += 1;
            this.logger.warn(
              `Özet sınırı doldu (${areaId}/${delivery}): ${mails} e-posta gönderildi, kalan olaylar sonraki koşuya kaldı`,
            );
            break;
          }
        }
      } catch (error: unknown) {
        stats.failed += 1;
        this.logger.error(
          `Özet gönderilemedi (${areaId}/${delivery}): ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    if (delivery === "daily") {
      // Saklama: gönderilmiş ve (ne olursa olsun) gönderilememiş eski kayıtlar.
      const cutoff = new Date(
        now.getTime() - MAIL_NOTICE_RETENTION_DAYS * 24 * 60 * 60 * 1000,
      );
      await this.prisma.mailInternalNotice.deleteMany({
        where: {
          OR: [
            { sentAt: { lt: cutoff } },
            { sentAt: null, createdAt: { lt: cutoff } },
          ],
        },
      });
    }

    log(
      `${stats.mails} özet, ${stats.events} olay, ${stats.dropped} bırakıldı, ${stats.failed} alan başarısız`,
    );
    if (stats.failed > 0) {
      throw new Error(`${stats.failed} alanın özeti gönderilemedi`);
    }
    return { summary: `${stats.mails} özet`, stats };
  }

  /**
   * Modun gönderilmemiş kayıtları. Saatlik koşu, outbox denemeleri tükenmiş
   * (süresi geçmiş) anlık kayıtları da kapsar.
   */
  private pendingWhere(
    delivery: MailDigestMode,
    now: Date,
  ): Prisma.MailInternalNoticeWhereInput {
    if (delivery === "daily") return { delivery: "daily", sentAt: null };
    return {
      sentAt: null,
      OR: [
        { delivery: "hourly" },
        {
          delivery: "instant",
          createdAt: { lt: new Date(now.getTime() - MAIL_INSTANT_GRACE_MS) },
        },
      ],
    };
  }

  /** Tek özet e-postası: en çok `MAIL_DIGEST_BATCH_LIMIT` olay sahiplenir ve gönderir. */
  private async sendAreaDigest(
    area: MailAreaId,
    delivery: MailDigestMode,
    pending: Prisma.MailInternalNoticeWhereInput,
    now: Date,
  ): Promise<{ events: number; dropped: number }> {
    const candidates = await this.prisma.mailInternalNotice.findMany({
      where: { ...pending, areaId: area, claimId: null },
      orderBy: { createdAt: "asc" },
      take: MAIL_DIGEST_BATCH_LIMIT,
      select: { id: true },
    });
    if (candidates.length === 0) return { events: 0, dropped: 0 };

    // Sahiplen: aynı anda koşan ikinci bir iş aynı satırları göndermesin.
    const claimId = randomUUID();
    await this.prisma.mailInternalNotice.updateMany({
      where: {
        id: { in: candidates.map((c) => c.id) },
        claimId: null,
        sentAt: null,
      },
      data: { claimId, claimedAt: now },
    });
    const rows = await this.prisma.mailInternalNotice.findMany({
      where: { claimId },
      orderBy: { createdAt: "asc" },
    });
    if (rows.length === 0) return { events: 0, dropped: 0 };

    const recipients = areaRecipients(area, await this.routing.area(area));
    if (recipients.length === 0) {
      // Alıcı listesi bu arada boşaltıldı: birikmiş olaylar bırakılır.
      await this.prisma.mailInternalNotice.updateMany({
        where: { claimId },
        data: { sentAt: now },
      });
      return { events: 0, dropped: rows.length };
    }

    const notices = rows
      .filter((row) => isMailInternalEventId(row.eventId))
      .map((row) => ({
        eventId: row.eventId as MailInternalEventId,
        notice: row.payload as unknown as MailInternalNoticePayload,
        occurredAt: row.occurredAt,
      }));
    const mail = renderInternalDigest(
      area,
      delivery,
      notices,
      this.renderContext(recipients),
    );
    const result = await this.smtp.sendEmail({
      to: recipients.join(", "),
      subject: mail.subject,
      html: mail.html,
      area,
      template: `internal-digest:${delivery}`,
    });
    if (!result.success) {
      await this.prisma.mailInternalNotice.updateMany({
        where: { claimId, sentAt: null },
        data: { claimId: null, claimedAt: null },
      });
      throw new Error(result.error ?? "send failed");
    }
    await this.prisma.mailInternalNotice.updateMany({
      where: { claimId },
      data: { sentAt: new Date() },
    });
    return { events: rows.length, dropped: 0 };
  }

  private renderContext(recipients: string[]): MailInternalRenderContext {
    return {
      adminBaseUrl: adminUrl(),
      frontendUrl: frontendUrlForEnvironment(),
      to: recipients.join(", "),
    };
  }
}
