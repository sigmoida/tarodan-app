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
  OUTBOX_TRADE_PLATFORM_CANCEL_NOTICE,
  type TradePlatformCancelNoticePayload,
} from "../../outbox/outbox.types";
import { errorMessage } from "../../../common/helpers/error-message";
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
  /** İade sonucunun ayrıntısı (yalnız gerçek iptalde dolu). */
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
   * iptal edildiyse ikinci çağrı para, duyuru ya da denetim üretmeden döner.
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

      // Duyuru iptalle atomik: commit olduysa kesin gider, takas başına bir kez.
      await this.outbox.enqueue(tx, {
        type: OUTBOX_TRADE_PLATFORM_CANCEL_NOTICE,
        payload: {
          tradeId: trade.id,
          parties: cancelRecord.refunds.map((line) => ({
            userId: line.userId,
            refundAmount: line.refundAmount,
          })),
        } satisfies TradePlatformCancelNoticePayload,
        dedupeKey: `${OUTBOX_TRADE_PLATFORM_CANCEL_NOTICE}:${trade.id}`,
      });

      // Zorunlu denetim kaydı — fırlatırsa iptal ve duyuru geri alınır.
      await hooks.onCancelled(tx, cancelRecord);
      return cancelRecord;
    });

    if (!record) {
      return {
        tradeId,
        alreadyCancelled: true,
        refunds: [],
        refundFailed: false,
        refundOutcome: null,
      };
    }

    // Commit sonrası, taramayla aynı adımlar: izlenen iade (asla fırlatmaz;
    // hata `refundFailureReason` yazar → "İadeyi yeniden dene" + retry cron'u),
    // ürün önbelleği, taşıyıcıya geçmemiş Sürat etiketlerinin iptali.
    const refundOutcome = await settlePreShipmentCancellation(
      {
        paymentService: this.paymentService,
        tradeCommon: this.tradeCommon,
        tradeShipment: this.tradeShipment,
        logger: this.logger,
      },
      tradeId,
    );

    return {
      tradeId,
      alreadyCancelled: false,
      refunds: record.refunds,
      refundFailed: refundOutcome.failed,
      refundOutcome,
    };
  }

  /**
   * Outbox handler'ı: taraflara platform iptali duyurusu. Takas artık platform
   * iptali değilse (beklenmez) sessizce çıkar. Gönderim hataları bildirimci
   * içinde yutulur — handler yeniden denenirse diğer tarafa ikinci duyuru
   * gitmesin diye kısmi başarıda fırlatılmaz.
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
    try {
      await this.notificationService.notifyTradeCancelledByPlatform({
        tradeId: trade.id,
        tradeNumber: trade.tradeNumber,
        reasonCode: trade.adminCancelReasonCode,
        parties: payload.parties,
      });
    } catch (error: unknown) {
      this.logger.error(
        `platform iptal duyurusu gönderilemedi (takas ${trade.id}): ${errorMessage(error)}`,
      );
    }
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
