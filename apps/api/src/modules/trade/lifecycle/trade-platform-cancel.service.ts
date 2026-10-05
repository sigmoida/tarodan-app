import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from "@nestjs/common";
import { CancellationActor, Prisma, TradeStatus } from "@prisma/client";
import {
  ADMIN_TRADE_CANCEL_BLOCKER_I18N_KEYS,
  adminTradeCancelBlocker,
  isAdminCancelReasonCode,
  type AdminCancelReasonCode,
  type AdminTradeCancelBlocker,
  type AdminTradeCancelPreview,
  type AdminTradeCancelRefundLine,
  type AdminTradeCancelReleasedItem,
  type AdminTradeCancelResult,
  type AdminTradeCancellableStatus,
} from "@tarodan/types";
import { PrismaService } from "../../../prisma";
import { i18nMessage } from "../../i18n";
import { PaymentService } from "../../payment/payment.service";
import { NotificationService } from "../../notification/notification.service";
import { OutboxService } from "../../outbox/outbox.service";
import { OutboxHandlerRegistry } from "../../outbox/outbox-handler.registry";
import {
  OUTBOX_TRADE_CANCEL_SETTLE,
  OUTBOX_TRADE_PLATFORM_CANCEL_NOTICE,
  tradeCancelSettleDedupeKey,
  type TradeCancelSettlePayload,
  type TradePlatformCancelNoticeChannel,
  type TradePlatformCancelNoticePayload,
} from "../../outbox/outbox.types";
import { TradeShipmentService } from "./trade-shipment.service";
import { TradeCommonService } from "../trade-common.service";
import {
  cancelPreShipmentTradeInTx,
  settlePreShipmentCancellation,
} from "../helpers/trade-pre-shipment-cancel";
import {
  TRADE_HANDOVER_SHIPMENT_SELECT,
  TRADE_PLATFORM_CANCEL_PAYMENT_SELECT,
  TRADE_PLATFORM_CANCEL_SELECT,
  platformCancelRefundLines,
  platformCancelReasonText,
} from "../helpers/trade-platform-cancel.helper";

/** Kargo etiketi taşıyıcıya geçmemiş ve henüz iptal edilmemiş sayılan durumlar. */
const OPEN_LABEL_STATUSES = ["pending", "label_created"] as const;

/** Her tarafa giden duyuru kanalları — her biri ayrı outbox satırı. */
const PLATFORM_CANCEL_NOTICE_CHANNELS: readonly TradePlatformCancelNoticeChannel[] =
  ["in_app", "email"];

/** Engel → admin'e dönen hata. Kapanmış takas 409, diğerleri 400. */
function blockerError(
  blocker: AdminTradeCancelBlocker,
): BadRequestException | ConflictException {
  const message = i18nMessage(ADMIN_TRADE_CANCEL_BLOCKER_I18N_KEYS[blocker]);
  return blocker === "closed"
    ? new ConflictException(message)
    : new BadRequestException(message);
}

/** İptalin tx içinde kesinleşen kaydı — denetim kancasına verilir. */
export interface TradePlatformCancelRecord {
  tradeId: string;
  tradeNumber: string;
  /** İptalden önceki aşama. */
  stageBefore: AdminTradeCancellableStatus;
  reasonCode: AdminCancelReasonCode;
  initiatorId: string;
  receiverId: string;
  /** Politikanın bu iptal için hesapladığı iade (taraf başına). */
  refunds: AdminTradeCancelRefundLine[];
  /** Rezervasyonu çözülen ürünler. */
  releasedReservations: Array<{ productId: string; quantity: number }>;
}

export interface TradePlatformCancelHooks {
  /**
   * İptalle AYNI tx içinde çalışır (zorunlu denetim kaydı). Fırlatırsa iptal
   * geri alınır — "iptal edildi ama kaydı yok" durumu oluşamaz.
   */
  onCancelled: (
    tx: Prisma.TransactionClient,
    record: TradePlatformCancelRecord,
  ) => Promise<void>;
}

/** Commit sonrası iade sonucu (izlenen yol asla fırlatmaz). */
export interface TradePlatformCancelOutcome extends AdminTradeCancelResult {
  /**
   * Commit sonrası adımların bu istekte çalıştırılan iade sonucu. `null`: iş bu
   * istekte çalışmadı (çift gönderimde önceki istek ya da drainer tamamlamış /
   * yürütüyor).
   */
  refundOutcome: {
    refunded: boolean;
    failed: boolean;
    skippedReason?: string;
    reason?: string;
  } | null;
}

/**
 * PLATFORM (ADMIN) TAKAS İPTALİ — yeni bir para ya da kargo yolu YOKTUR.
 *
 * İptal, süre dolumu taramasının kargo öncesi çekirdeğiyle
 * (`cancelPreShipmentTradeInTx` + `settlePreShipmentCancellation`) yapılır;
 * değişen yalnız aktör (`platform`), gerekçe (katalog kodu), kusur ataması
 * (kimsenin kusuru değil → iki taraf da kusursuz) ve duyurudur.
 *
 * Neden taramanın çekirdeği (kullanıcı iptali değil): kullanıcı iptali
 * vazgeçen tarafı kusurlu sayar (hizmet bedelini kaybeder) ve aktörü bir
 * taraftan türetir; tarama çekirdeği ise aktörü ve kusuru dışarıdan alır.
 * `awaiting_payment`'ta ödemiş tarafın sonucu taramanınkiyle birebir aynıdır
 * (tam iade); diğer aşamalarda kusur kararı, kayıp koli çözümünün zaten
 * kullandığı "iki taraf da kusursuz" kararıdır.
 *
 * Yarış güvenliği: uygunluk satır kilidi (FOR UPDATE) altında, ortak kuralla
 * yeniden değerlendirilir; to_warehouse bacakları da kilitlenir ki kargo
 * poller'ının devir yazımı karar anında araya giremesin.
 *
 * Dayanıklılık: commit sonrası adımlar (`trade.cancel_settle`) ve taraf
 * duyuruları (`trade.platform_cancel_notice`, alıcı × kanal başına bir satır)
 * iptalle AYNI tx'te outbox'a yazılır. Commit sonrası adımlar hemen anlık
 * yoldan (`OutboxService.runInline`) çalışır; süreç arada ölürse drainer
 * tamamlar.
 */
@Injectable()
export class TradePlatformCancelService implements OnModuleInit {
  private readonly logger = new Logger(TradePlatformCancelService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly paymentService: PaymentService,
    private readonly tradeShipment: TradeShipmentService,
    private readonly tradeCommon: TradeCommonService,
    private readonly notificationService: NotificationService,
    private readonly outbox: OutboxService,
    private readonly outboxHandlers: OutboxHandlerRegistry,
  ) {}

  onModuleInit(): void {
    this.outboxHandlers.register(
      OUTBOX_TRADE_PLATFORM_CANCEL_NOTICE,
      async (payload) =>
        this.sendCancellationNotice(
          payload as TradePlatformCancelNoticePayload,
        ),
    );
    // Commit ile anlık yol arasında süreç ölürse drainer burada tamamlar.
    this.outboxHandlers.register(
      OUTBOX_TRADE_CANCEL_SETTLE,
      async (payload) => {
        await this.settle((payload as TradeCancelSettlePayload).tradeId);
      },
    );
  }

  /**
   * İptal şimdi yapılsa kime ne döner, ne serbest kalır. İptalle AYNI kural ve
   * AYNI iade fonksiyonu; uygun değilse iptalle aynı hata.
   */
  async preview(tradeId: string): Promise<AdminTradeCancelPreview> {
    const trade = await this.prisma.trade.findUnique({
      where: { id: tradeId },
      select: {
        ...TRADE_PLATFORM_CANCEL_SELECT,
        shipments: { select: TRADE_HANDOVER_SHIPMENT_SELECT },
        cashPayments: { select: TRADE_PLATFORM_CANCEL_PAYMENT_SELECT },
        items: {
          select: {
            productId: true,
            quantity: true,
            side: true,
            product: { select: { title: true } },
          },
        },
      },
    });
    if (!trade) {
      throw new NotFoundException(i18nMessage("server.trade.notFound"));
    }
    const status = this.assertCancellable(trade, trade.shipments);

    const refunds = platformCancelRefundLines(trade, trade.cashPayments);
    // `pending`de kabul yapılmadığı için rezervasyon yoktur.
    const releasedItems: AdminTradeCancelReleasedItem[] =
      status === TradeStatus.pending
        ? []
        : trade.items.map((item) => ({
            productId: item.productId,
            title: item.product.title,
            side: item.side === "initiator" ? "initiator" : "receiver",
            quantity: item.quantity,
          }));

    return {
      tradeId: trade.id,
      tradeNumber: trade.tradeNumber,
      status,
      refunds,
      refundTotal:
        Math.round(
          refunds.reduce((sum, line) => sum + line.refundAmount, 0) * 100,
        ) / 100,
      releasedItems,
      labelsToCancel: trade.shipments.filter(
        (shipment) =>
          shipment.leg === "to_warehouse" &&
          (OPEN_LABEL_STATUSES as readonly string[]).includes(shipment.status),
      ).length,
    };
  }

  /**
   * Platform iptali. İdempotent: aynı takas zaten platform tarafından (kodla)
   * iptal edildiyse ikinci çağrı yeni bir iptal, duyuru ya da denetim üretmez;
   * yalnız önceki isteğin commit sonrası işi hâlâ bekliyorsa onu tamamlar
   * (idempotent iade — ikinci kez para çıkmaz).
   */
  async cancel(
    tradeId: string,
    reasonCode: AdminCancelReasonCode,
    hooks: TradePlatformCancelHooks,
  ): Promise<TradePlatformCancelOutcome> {
    const now = new Date();
    const reasonText = platformCancelReasonText(reasonCode);

    const record = await this.prisma.$transaction(async (tx) => {
      // Kullanıcı iptali, süre dolumu taraması, uzatma hakkı ve ödeme geçişi
      // (status guard'lı updateMany) bu satırda sıraya girer.
      await tx.$queryRaw`SELECT id FROM trades WHERE id = ${tradeId} FOR UPDATE`;
      const trade = await tx.trade.findUnique({
        where: { id: tradeId },
        select: TRADE_PLATFORM_CANCEL_SELECT,
      });
      if (!trade) {
        throw new NotFoundException(i18nMessage("server.trade.notFound"));
      }
      // Çift gönderim: bu iptal zaten yazıldı. Başka bir aktörün iptali ise
      // aşağıda `closed` engeline düşer (409).
      if (
        trade.status === TradeStatus.cancelled &&
        trade.cancelledBy === CancellationActor.platform &&
        trade.adminCancelReasonCode
      ) {
        return null;
      }

      // Kargo poller'ı devir mührünü bacak satırına yazar (trade satırını
      // kilitlemeden): bacakları da kilitle ki karar anındaki görüntü sabit
      // olsun. Kilit sırası trade → bacak (depo teslim alma ile aynı).
      await tx.$queryRaw`SELECT id FROM trade_shipments WHERE trade_id = ${tradeId} FOR UPDATE`;
      const shipments = await tx.tradeShipment.findMany({
        where: { tradeId },
        select: TRADE_HANDOVER_SHIPMENT_SELECT,
      });
      const stageBefore = this.assertCancellable(trade, shipments);

      const outcome = await cancelPreShipmentTradeInTx(tx, {
        trade: {
          id: trade.id,
          status: trade.status,
          firstWarehouseArrivalAt: trade.firstWarehouseArrivalAt,
        },
        actor: CancellationActor.platform,
        reason: reasonText,
        at: now,
        // Kimsenin kusuru değil: iki taraf da kusursuz → tahsil edilenin tamamı.
        faultless: "all",
        adminCancelReasonCode: reasonCode,
      });
      // Ortak kural çekirdeğin kargo kilidinden geniştir; buraya düşmek
      // yalnız ikisinin ayrışması demektir — iptal etmeden reddet.
      if (!outcome) throw blockerError("parcel_handed_over");

      const payments = await tx.tradeCashPayment.findMany({
        where: { tradeId },
        select: TRADE_PLATFORM_CANCEL_PAYMENT_SELECT,
      });
      const cancelRecord: TradePlatformCancelRecord = {
        tradeId: trade.id,
        tradeNumber: trade.tradeNumber,
        stageBefore,
        reasonCode,
        initiatorId: trade.initiatorId,
        receiverId: trade.receiverId,
        refunds: platformCancelRefundLines(trade, payments),
        releasedReservations: outcome.releasedReservations,
      };

      // Commit sonrası adımlar (iade, önbellek, etiket iptali) iptalle ATOMİK
      // olarak kuyruğa girer: süreç commit ile anlık yol arasında ölürse
      // drainer tamamlar — iade asla "hiç denenmedi" durumunda kalmaz.
      await this.outbox.enqueue(tx, {
        type: OUTBOX_TRADE_CANCEL_SETTLE,
        payload: { tradeId: trade.id } satisfies TradeCancelSettlePayload,
        dedupeKey: tradeCancelSettleDedupeKey(trade.id),
      });

      // Duyuru da iptalle atomik; satır = tek alıcı × tek kanal, böylece bir
      // gönderimin yeniden denenmesi diğerini tekrarlamaz.
      for (const line of cancelRecord.refunds) {
        for (const channel of PLATFORM_CANCEL_NOTICE_CHANNELS) {
          await this.outbox.enqueue(tx, {
            type: OUTBOX_TRADE_PLATFORM_CANCEL_NOTICE,
            payload: {
              tradeId: trade.id,
              userId: line.userId,
              refundAmount: line.refundAmount,
              channel,
            } satisfies TradePlatformCancelNoticePayload,
            dedupeKey: `${OUTBOX_TRADE_PLATFORM_CANCEL_NOTICE}:${trade.id}:${line.userId}:${channel}`,
          });
        }
      }

      // Zorunlu denetim kaydı — fırlatırsa iptal ve kuyruk satırları geri alınır.
      await hooks.onCancelled(tx, cancelRecord);
      return cancelRecord;
    });

    // Anlık yol: kuyruktaki commit sonrası işin sahibi olarak hemen çalış.
    // Çift gönderimde de (iptal zaten yazılmış) aynı yol denenir: önceki istek
    // işi hiç çalıştıramadan öldüyse satır hâlâ pending'dir ve iş şimdi
    // tamamlanır; tamamlanmışsa ya da drainer'daysa hiçbir şey çalışmaz.
    const settled = await this.outbox.runInline(
      this.prisma,
      tradeCancelSettleDedupeKey(tradeId),
      () => this.settle(tradeId),
    );
    const refundOutcome = settled.ran ? settled.result : null;

    return {
      tradeId,
      alreadyCancelled: record === null,
      refunds: record?.refunds ?? [],
      refundFailed: refundOutcome?.failed === true,
      refundOutcome,
    };
  }

  /**
   * Commit sonrası adımlar, taramayla aynı çekirdek: izlenen iade (asla
   * fırlatmaz; hata `refundFailureReason` yazar → "İadeyi yeniden dene" +
   * retry cron'u), ürün önbelleği, taşıyıcıya geçmemiş Sürat etiketlerinin
   * iptali. Her adım idempotenttir; anlık yol ve drainer aynı işi çalıştırır.
   */
  private settle(tradeId: string) {
    return settlePreShipmentCancellation(
      {
        paymentService: this.paymentService,
        tradeCommon: this.tradeCommon,
        tradeShipment: this.tradeShipment,
        logger: this.logger,
      },
      tradeId,
    );
  }

  /**
   * Outbox handler'ı: TEK alıcıya TEK kanaldan platform iptali duyurusu.
   * Okuma ya da gönderim hatası FIRLATILIR → outbox yalnız bu satırı yeniden
   * dener (satır başka bir alıcıyı / kanalı kapsamadığı için tekrar gönderim
   * yalnız başarısız olanı yineler). Takas platform iptali değilse (beklenmez)
   * gönderilecek bir şey yoktur, satır kapanır.
   */
  async sendCancellationNotice(
    payload: TradePlatformCancelNoticePayload,
  ): Promise<void> {
    const trade = await this.prisma.trade.findUnique({
      where: { id: payload.tradeId },
      select: {
        id: true,
        tradeNumber: true,
        status: true,
        cancelledBy: true,
        adminCancelReasonCode: true,
      },
    });
    if (
      !trade ||
      trade.status !== TradeStatus.cancelled ||
      trade.cancelledBy !== CancellationActor.platform ||
      !isAdminCancelReasonCode(trade.adminCancelReasonCode)
    ) {
      this.logger.warn(
        `platform iptal duyurusu atlandı: takas ${payload.tradeId} platform iptali değil`,
      );
      return;
    }
    await this.notificationService.sendTradeCancelledByPlatformNotice({
      tradeId: trade.id,
      tradeNumber: trade.tradeNumber,
      reasonCode: trade.adminCancelReasonCode,
      userId: payload.userId,
      refundAmount: payload.refundAmount,
      channel: payload.channel,
    });
  }

  /** Ortak kuralı uygular; uygunsa iptal edilebilir aşamayı döner. */
  private assertCancellable(
    trade: {
      status: TradeStatus;
      firstWarehouseArrivalAt: Date | null;
      cancelLockedAt: Date | null;
    },
    shipments: Array<{
      leg: string;
      status: string;
      shippedAt: Date | null;
      deliveredAt: Date | null;
    }>,
  ): AdminTradeCancellableStatus {
    const blocker = adminTradeCancelBlocker({
      status: trade.status,
      firstWarehouseArrivalAt: trade.firstWarehouseArrivalAt,
      cancelLockedAt: trade.cancelLockedAt,
      shipments,
    });
    if (blocker) throw blockerError(blocker);
    return trade.status as AdminTradeCancellableStatus;
  }
}
