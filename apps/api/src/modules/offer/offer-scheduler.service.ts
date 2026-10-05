import { Injectable, Logger, OnModuleInit, Optional } from "@nestjs/common";
import { InjectQueue } from "@nestjs/bull";
import { ConfigService } from "@nestjs/config";
import { Queue } from "bull";
import { registerRepeatableCron } from "../../monitoring/bull-cron.helper";
import { QUEUE_NAMES } from "../../workers/constants";
import { PrismaService } from "../../prisma";
import { OfferStatus } from "@prisma/client";
import { NotificationService } from "../notification/notification.service";
import { UserBlockService } from "../user-block/user-block.service";
import { resolveTimingAction } from "../../common/timing-rules";
import {
  offerExpiresAt,
  offerExtensionBlocker,
  type OfferExtensionCandidate,
} from "./helpers/offer-expiry";

/** Bir turda işlenen en fazla teklif (en eski önce; kalan sonraki turda). */
const EXPIRY_BATCH_SIZE = 500;

/**
 * Offer Scheduler Service
 * DB'de hâlâ "pending" kalan ama süresi dolmuş teklifleri periyodik olarak
 * "expired" statüsüne çeker — ya da admin "extend_once" seçtiyse BİR kez uzatır.
 *
 * Neden gerekli:
 * - invalidateRelatedOffers() sadece status=pending teklifleri hedefler.
 * - Süresi dolmuş ama DB'de pending kalan teklifler yanlışlıkla "rejected"
 *   yapılır; doğru statü "expired" olmalıdır.
 *
 * extend_once (Süreler ve Kurallar → offerExpiryHours): karar, süre DOLDUĞU
 * andaki eyleme göre verilir (her turda okunur); ayar değişikliği geçmişe
 * dönük hiçbir süreyi yeniden yazmaz. "Bir kez" `Offer.extendedAt` ile
 * kayda yazılır ve uzatma KOŞULLU-ATOMİK bir updateMany'dir
 * (status=pending ∧ expiresAt<now ∧ extendedAt=null): eşzamanlı iki tur
 * aynı teklifi iki kez uzatamaz, uzatılmış teklifi expire de edemez (expire
 * dalının koşulu da expiresAt<now'dır; uzatma onu geleceğe taşır).
 */
@Injectable()
export class OfferSchedulerService implements OnModuleInit {
  private readonly logger = new Logger(OfferSchedulerService.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(QUEUE_NAMES.SCHEDULED) private readonly scheduledQueue: Queue,
    private readonly userBlocks: UserBlockService,
    private readonly configService: ConfigService,
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
   * Her 5 dakikada bir süresi dolmuş pending teklifleri expired'a çeker (ya da
   * extend_once ile bir kez uzatır).
   * Gerçek iş — Bull processor 'expire-offers' buradan çağırır.
   */
  async runHandleExpiredOffers(log: (msg: string) => void = () => {}) {
    try {
      const now = new Date();
      const extendOnce =
        (await resolveTimingAction(this.prisma, "offerExpiryHours")) ===
        "extend_once";
      // "Bir tam geçerlilik süresi": uzatma anındaki offerExpiryHours, turda
      // bir kez okunur (yeni teklif damgasıyla aynı fonksiyon).
      const newExpiresAt = extendOnce
        ? await offerExpiresAt(this.prisma, this.configService, now)
        : null;
      // Önce KİMİN teklifi düştüğünü topla: bildirim gönderecek bilgi
      // (alıcı/satıcı/ürün) satırlarla birlikte gelir. OFFER_EXPIRED tipi
      // tanımlıydı ama hiçbir yerden gönderilmiyordu — pazarlık sessizce
      // kapanıyor, iki taraf da farkına varmıyordu.
      const due = await this.prisma.offer.findMany({
        where: { status: OfferStatus.pending, expiresAt: { lt: now } },
        // Deterministik ve sınırlı: en eski önce, yığın sırayla boşalır.
        orderBy: { expiresAt: "asc" },
        take: EXPIRY_BATCH_SIZE,
        select: {
          id: true,
          buyerId: true,
          sellerId: true,
          productId: true,
          buyerMustAccept: true,
          extendedAt: true,
          product: {
            select: {
              title: true,
              status: true,
              quantity: true,
              reservedQuantity: true,
            },
          },
          buyer: { select: { isBanned: true, deletedAt: true } },
          seller: { select: { isBanned: true, deletedAt: true } },
        },
      });

      let expired = 0;
      let extended = 0;
      for (const offer of due) {
        const productTitle = offer.product?.title ?? "";

        // Her teklif kendi koşullu-atomik adımıyla işlenir; kaybeden (count 0)
        // tur bildirim göndermez.
        if (newExpiresAt && (await this.canExtend(offer))) {
          const claimed = await this.prisma.offer.updateMany({
            where: {
              id: offer.id,
              status: OfferStatus.pending,
              expiresAt: { lt: now },
              extendedAt: null,
            },
            // `version` artırılmaz: kabul/geri çekme yolları sürüm guard'ıyla
            // yazar; uzatma iş durumunu değil yalnız tarihi öteler.
            data: { expiresAt: newExpiresAt, extendedAt: now },
          });
          if (claimed.count === 1) {
            extended += 1;
            await this.notifyExtended(offer, productTitle, newExpiresAt);
          }
          // Başka tur kazandıysa (count 0) bu teklif artık süresi dolmuş değil:
          // expire dalına DÜŞMEZ.
          continue;
        }

        const closed = await this.prisma.offer.updateMany({
          where: {
            id: offer.id,
            status: OfferStatus.pending,
            expiresAt: { lt: now },
          },
          data: { status: OfferStatus.expired },
        });
        if (closed.count !== 1) continue;
        expired += 1;
        await this.notificationService
          ?.notifyOfferExpired({
            buyerId: offer.buyerId,
            sellerId: offer.sellerId,
            productId: offer.productId,
            productTitle,
          })
          .catch((err: any) =>
            this.logger.warn(
              `offer-expired notify failed for ${offer.id}: ${err.message}`,
            ),
          );
      }

      log(`${expired} süresi dolmuş teklif 'expired' yapıldı`);
      log(`${extended} teklifin süresi bir kez uzatıldı`);
      if (expired > 0) {
        this.logger.log(`Marked ${expired} expired offer(s) as expired`);
      }
      if (extended > 0) {
        this.logger.log(`Extended ${extended} offer(s) once (extend_once)`);
      }
      return {
        summary: `${expired} teklif süresi doldu · ${extended} teklif uzatıldı`,
        stats: { expired, extended },
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

  /**
   * extend_once uygunluğu: saf kural (`offerExtensionBlocker`: hak kullanılmış
   * mı, ilan satışta mı, taraflar yasaklı/silinmiş mi) + taraflar arası engel.
   * Engel varsa teklif varsayılan davranışla (expire) kapanır.
   */
  private async canExtend(
    offer: OfferExtensionCandidate & { buyerId: string; sellerId: string },
  ): Promise<boolean> {
    if (offerExtensionBlocker(offer)) return false;
    // Engelleme / hesap şeridi (canlı ↔ test) — teklif akışıyla aynı kapı.
    return !(await this.userBlocks.isBlockedEither(
      offer.buyerId,
      offer.sellerId,
    ));
  }

  /** Sırası gelen tarafa: karşı teklifte alıcı, aksi halde satıcı. */
  private async notifyExtended(
    offer: {
      id: string;
      buyerId: string;
      sellerId: string;
      productId: string;
      buyerMustAccept: boolean;
    },
    productTitle: string,
    until: Date,
  ): Promise<void> {
    await this.notificationService
      ?.notifyOfferExtended({
        recipientId: offer.buyerMustAccept ? offer.buyerId : offer.sellerId,
        audience: offer.buyerMustAccept ? "buyer" : "seller",
        offerId: offer.id,
        productId: offer.productId,
        productTitle,
        until,
      })
      .catch((err: any) =>
        this.logger.warn(
          `offer-extended notify failed for ${offer.id}: ${err.message}`,
        ),
      );
  }
}
