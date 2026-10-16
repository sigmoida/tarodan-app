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
import { audienceUserWhere } from "../ops/notification-audience";
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
          // Extract target user IDs based on targetType
          let userIds: string[] = [];

          if (notification.targetType === "user_ids") {
            userIds = (notification.targetData as string[]) || [];
          } else if (
            notification.targetType === "all" ||
            notification.targetType === "segment"
          ) {
            const users = await this.prisma.user.findMany({
              where: audienceUserWhere(
                notification.targetType,
                notification.targetData as Record<string, any> | null,
              ),
              select: { id: true },
            });
            userIds = users.map((u) => u.id);
          }

          if (userIds.length === 0) {
            this.logger.warn(
              `No target users found for scheduled notification ${notification.id}`,
            );
            failed++;
            log(`bildirim ${notification.id} → hedef kullanıcı yok, atlandı`);
            await this.prisma.scheduledNotification.update({
              where: { id: notification.id },
              data: {
                status: "failed",
                sentAt: new Date(),
                errorCount: 1,
              },
            });
            continue;
          }

          // Dağıtımı başlat (tek `send-broadcast` işi). Satır "processing"
          // kalır; worker dağıtım bitince "sent" (+ ulaşılan sayı) ya da
          // "failed" yazar.
          await this.adminService.sendNotification(notification.createdBy, {
            title: notification.title,
            body: notification.body,
            channels: notification.channels as string[],
            targetType: "user_ids",
            userIds,
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
          log(
            `bildirim ${notification.id} → ${userIds.length} kullanıcı için dağıtım kuyruğa alındı`,
          );
          this.logger.log(
            `Scheduled notification ${notification.id} queued for ${userIds.length} users`,
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
}
