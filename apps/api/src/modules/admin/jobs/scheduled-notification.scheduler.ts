/**
 * Scheduled Notification Scheduler
 * Processes pending scheduled notifications at their scheduled time
 */
import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { InjectQueue } from "@nestjs/bull";
import { Queue } from "bull";
import { registerRepeatableCron } from "../../../monitoring/bull-cron.helper";
import { QUEUE_NAMES } from "../../../workers/constants";
import { PrismaService } from "../../../prisma";
import { AdminService } from "../admin.service";
import type { MailingType } from "@tarodan/types";

@Injectable()
export class ScheduledNotificationScheduler implements OnModuleInit {
  private readonly logger = new Logger(ScheduledNotificationScheduler.name);
  /**
   * Aynı süreç içinde üst üste binen turu atlar. Çoklu worker güvenliği bu
   * bayraktan DEĞİL, satır başına atomik sahiplenmeden (`pending →
   * processing`, `updateMany` sayısı) gelir: iki süreç aynı satırı görse de
   * yalnız biri sahiplenir.
   */
  private isProcessing = false;
  /** Teslim satırı taraması en son ne zaman çalıştı (süreç içi; saatte bir). */
  private lastDeliverySweepAt = 0;

  constructor(
    private readonly prisma: PrismaService,
    private readonly adminService: AdminService,
    @InjectQueue(QUEUE_NAMES.SCHEDULED) private readonly scheduledQueue: Queue,
  ) {}

  async onModuleInit(): Promise<void> {
    await registerRepeatableCron(
      this.scheduledQueue,
      "process-scheduled-notifications",
      "0 * * * * *",
      this.logger,
    );
  }

  /**
   * Runs every minute to check for due scheduled notifications.
   * Gerçek iş — Bull processor 'process-scheduled-notifications' buradan çağırır.
   *
   * Satırın son durumu (sent/failed) burada değil, dağıtımı yapan push
   * worker'ında (`send-broadcast`) SONUÇTAN yazılır; burada yalnız sahiplenme
   * ve dağıtımın başlatılamadığı durumlar (hedef yok, hata) işlenir.
   */
  async runProcessScheduledNotifications(
    log: (msg: string) => void = () => {},
  ): Promise<{ summary: string; stats: Record<string, number> }> {
    // Prevent concurrent execution (same process)
    if (this.isProcessing) {
      this.logger.debug(
        "Already processing scheduled notifications, skipping...",
      );
      return { summary: "Zaten çalışıyor, atlandı", stats: { skipped: 1 } };
    }

    this.isProcessing = true;
    let queued = 0;
    let failed = 0;

    try {
      const now = new Date();
      await this.sweepStuckBroadcasts(now, log);

      // Find all pending notifications that are due
      const dueNotifications = await this.prisma.scheduledNotification.findMany(
        {
          where: {
            status: "pending",
            scheduledFor: { lte: now },
          },
          take: 50, // Process in batches
          orderBy: { scheduledFor: "asc" },
        },
      );

      if (dueNotifications.length === 0) {
        this.logger.debug("No scheduled notifications due");
        log("0 bekleyen bildirim bulundu");
        return {
          summary: "0 bekleyen bildirim",
          stats: { due: 0, queued: 0, failed: 0 },
        };
      }

      log(`${dueNotifications.length} bekleyen bildirim bulundu`);
      this.logger.log(
        `Processing ${dueNotifications.length} scheduled notifications`,
      );

      for (const notification of dueNotifications) {
        // Atomik sahiplenme: yalnız hâlâ "pending" ise "processing" yap.
        // Başka bir worker süreci aynı satırı önce aldıysa sayı 0 döner.
        const claim = await this.prisma.scheduledNotification.updateMany({
          where: { id: notification.id, status: "pending" },
          data: { status: "processing" },
        });
        if (claim.count !== 1) {
          log(`bildirim ${notification.id} → başka süreç aldı, atlandı`);
          continue;
        }

        try {
          // Hedefleme KURALI aynen geçer (kullanıcı listesine çözülmez): alıcılar
          // gönderim anında çözülür ve iş verisine liste yazılmaz. Hedef boşsa
          // sendNotification hata verir → satır "failed" (aşağıdaki catch).
          const targetType = notification.targetType as
            "all" | "segment" | "user_ids";

          // Dağıtımı başlat (tek `send-broadcast` işi). Satır "processing"
          // kalır; worker dağıtım bitince "sent" (+ ulaşılan sayı) ya da
          // "failed" yazar.
          await this.adminService.sendNotification(notification.createdBy, {
            title: notification.title,
            body: notification.body,
            channels: notification.channels as string[],
            targetType,
            ...(targetType === "user_ids"
              ? { userIds: (notification.targetData as string[] | null) ?? [] }
              : {
                  segmentCriteria:
                    (notification.targetData as Record<
                      string,
                      unknown
                    > | null) ?? undefined,
                }),
            // Zamanlanırken saklanan hedef link vb. — anında gönderimle aynı.
            data:
              notification.data && typeof notification.data === "object"
                ? (notification.data as Record<string, unknown>)
                : undefined,
            // Zamanlanırken saklanan e-posta içeriği ve tür aynen taşınır.
            emailSubject: notification.emailSubject ?? undefined,
            emailHtml: notification.emailHtml ?? undefined,
            mailingType: notification.mailingType as MailingType,
            scheduledNotificationId: notification.id,
          });

          queued++;
          log(`bildirim ${notification.id} → dağıtım kuyruğa alındı`);
          this.logger.log(
            `Scheduled notification ${notification.id} queued (${targetType})`,
          );
        } catch (error) {
          this.logger.error(
            `Failed to process scheduled notification ${notification.id}:`,
            error,
          );
          failed++;
          log(`bildirim ${notification.id} → HATA (gönderilemedi)`);

          await this.prisma.scheduledNotification.update({
            where: { id: notification.id },
            data: {
              status: "failed",
              sentAt: new Date(),
            },
          });
        }
      }

      const summary = `${dueNotifications.length} bekleyen · ${queued} kuyruğa alındı · ${failed} başarısız`;
      return {
        summary,
        stats: { due: dueNotifications.length, queued, failed },
      };
    } catch (error) {
      this.logger.error("Error in scheduled notification processor:", error);
      return {
        summary: `İşleme hatası (${queued} kuyruğa alındı)`,
        stats: { queued, failed },
      };
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Takılı kalan yayınları kapatır (kurtarma):
   * - `processing`te `STUCK_PROCESSING_MS`'den uzun kalan zamanlanmış satır
   *   (dağıtım işi kaybolduysa / worker hiç almadıysa) "failed" olur;
   * - gönderimi hiç denenmeyen (`pending`) yayın teslim satırları
   *   `STALE_DELIVERY_MS` sonra "failed" olur (alıcı arada yasaklandı vb.).
   *   Bu tarama saatte en çok bir kez çalışır (büyük tablo).
   */
  private async sweepStuckBroadcasts(
    now: Date,
    log: (msg: string) => void,
  ): Promise<void> {
    try {
      const stuck = await this.prisma.scheduledNotification.updateMany({
        where: {
          status: "processing",
          updatedAt: { lt: new Date(now.getTime() - STUCK_PROCESSING_MS) },
        },
        data: { status: "failed", sentAt: now, errorCount: 1 },
      });
      if (stuck.count > 0) {
        log(`${stuck.count} takılı zamanlanmış yayın "failed" yapıldı`);
        this.logger.warn(
          `Marked ${stuck.count} scheduled notification(s) stuck in processing as failed`,
        );
      }

      if (
        now.getTime() - this.lastDeliverySweepAt <
        DELIVERY_SWEEP_INTERVAL_MS
      ) {
        return;
      }
      this.lastDeliverySweepAt = now.getTime();
      const stale = await this.prisma.notificationLog.updateMany({
        where: {
          type: "admin_broadcast",
          channel: { in: ["push", "email"] },
          status: "pending",
          createdAt: { lt: new Date(now.getTime() - STALE_DELIVERY_MS) },
        },
        data: { status: "failed", errorMessage: "Delivery not attempted" },
      });
      if (stale.count > 0) {
        log(`${stale.count} denenmemiş yayın teslim satırı "failed" yapıldı`);
      }
    } catch (error) {
      this.logger.warn(`Broadcast recovery sweep failed: ${String(error)}`);
    }
  }
}

/** Dağıtımı bu süreden uzun süren zamanlanmış satır takılmış sayılır. */
const STUCK_PROCESSING_MS = 6 * 60 * 60 * 1000;
/** Bu süre sonra hâlâ "pending" olan yayın teslim satırı hiç denenmemiştir. */
const STALE_DELIVERY_MS = 24 * 60 * 60 * 1000;
const DELIVERY_SWEEP_INTERVAL_MS = 60 * 60 * 1000;
