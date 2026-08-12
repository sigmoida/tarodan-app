import { Injectable, Logger, OnModuleInit, Optional } from "@nestjs/common";
import { InjectQueue } from "@nestjs/bull";
import { Queue } from "bull";
import { registerRepeatableCron } from "../../monitoring/bull-cron.helper";
import { QUEUE_NAMES } from "../../workers/constants";
import { PrismaService } from "../../prisma";
import { OfferStatus } from "@prisma/client";
import { NotificationService } from "../notification/notification.service";

/**
 * Offer Scheduler Service
 * DB'de hâlâ "pending" kalan ama süresi dolmuş teklifleri periyodik olarak
 * "expired" statüsüne çeker.
 *
 * Neden gerekli:
 * - invalidateRelatedOffers() sadece status=pending teklifleri hedefler.
 * - Süresi dolmuş ama DB'de pending kalan teklifler yanlışlıkla "rejected"
 *   yapılır; doğru statü "expired" olmalıdır.
 */
@Injectable()
export class OfferSchedulerService implements OnModuleInit {
  private readonly logger = new Logger(OfferSchedulerService.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(QUEUE_NAMES.SCHEDULED) private readonly scheduledQueue: Queue,
    @Optional()
    private readonly notificationService?: NotificationService,
  ) {}

  async onModuleInit(): Promise<void> {
    await registerRepeatableCron(
      this.scheduledQueue,
      "expire-offers",
      "*/5 * * * *",
      this.logger,
    );
  }

  /**
   * Her 5 dakikada bir süresi dolmuş pending teklifleri expired'a çeker.
   * Gerçek iş — Bull processor 'expire-offers' buradan çağırır.
   */
  async runHandleExpiredOffers(log: (msg: string) => void = () => {}) {
    try {
      const now = new Date();
      // Önce KİMİN teklifi düştüğünü topla: updateMany satırları döndürmez ve
      // bildirim gönderecek bilgi (alıcı/satıcı/ürün) kaybolurdu. OFFER_EXPIRED
      // tipi tanımlıydı ama hiçbir yerden gönderilmiyordu — pazarlık sessizce
      // kapanıyor, iki taraf da farkına varmıyordu.
      const expiring = await this.prisma.offer.findMany({
        where: { status: OfferStatus.pending, expiresAt: { lt: now } },
        select: {
          id: true,
          buyerId: true,
          sellerId: true,
          productId: true,
          product: { select: { title: true } },
        },
      });

      const result = await this.prisma.offer.updateMany({
        where: {
          status: OfferStatus.pending,
          expiresAt: { lt: now },
          id: { in: expiring.map((offer) => offer.id) },
        },
        data: { status: OfferStatus.expired },
      });
      log(`${result.count} süresi dolmuş teklif 'expired' yapıldı`);
      if (result.count > 0) {
        this.logger.log(`Marked ${result.count} expired offer(s) as expired`);
      }

      for (const offer of expiring) {
        await this.notificationService
          ?.notifyOfferExpired({
            buyerId: offer.buyerId,
            sellerId: offer.sellerId,
            productId: offer.productId,
            productTitle: offer.product?.title ?? "",
          })
          .catch((err: any) =>
            this.logger.warn(
              `offer-expired notify failed for ${offer.id}: ${err.message}`,
            ),
          );
      }
      return {
        summary: `${result.count} teklif süresi doldu`,
        stats: { expired: result.count },
      };
    } catch (error: any) {
      this.logger.error(
        `Error in expired offers job: ${error.message}`,
        error.stack,
      );
      log(`HATA: ${error.message}`);
      // Yutmadan yükselt: Bull job'ı "failed" olsun ki attempts/backoff ve Sentry
      // Cron alarmı gerçekten devreye girsin (aksi halde başarısız tur bile
      // "başarılı" görünür ve hata yalnız log satırında kalır).
      throw error;
    }
  }
}
