import { Injectable, Logger } from "@nestjs/common";
import { Prisma, ProductStatus } from "@prisma/client";
import { PrismaService } from "../../../prisma";
import {
  resolveTimingAction,
  resolveTimingValue,
} from "../../../common/timing-rules";
import { NotificationService } from "../../notification/notification.service";
import { NotificationType } from "../../notification/dto";
import { formatNotificationDeadline } from "../../notification/helpers/notification-deadline";
import { getAvailableQuantity } from "../../product/helpers/product-availability.helper";
import { UserBlockService } from "../../user-block/user-block.service";
import {
  TRADE_EXTENSION_STAGE_RULE,
  evaluatePaymentExtension,
  tradeExtendedDeadline,
  tradeExtensionClaimData,
  tradeExtensionClaimWhere,
  tradeStageExtendedAt,
  type TradeExtensionStage,
} from "../helpers/trade-deadline-extension";

/** Tur başında okunan politika: yalnız extend_once seçili aşamalar → uzatma süresi (saat). */
export type TradeExtensionPlan = Partial<Record<TradeExtensionStage, number>>;

/** Uzatılabilir bulunan takas: kime hatırlatılacak. */
export interface TradeExtensionDecision {
  /** İşlem sırası kendinde olanlar (yanıt: alıcı; ödeme: ödemesi eksik taraflar). */
  recipients: string[];
  /** Ödeme aşamasında ödemesini TAMAMLAMIŞ taraflar: karşı tarafa süre verildi. */
  paidParties: string[];
}

/** Uzatma kararı için takasın bakılan hâli (cron'un okuduğu satır). */
export interface ExtensionTradeSnapshot {
  id: string;
  initiatorId: string;
  receiverId: string;
  responseExtendedAt: Date | null;
  paymentExtendedAt: Date | null;
}

const NOTIFICATION_BY_STAGE = {
  response: NotificationType.TRADE_RESPONSE_EXTENDED,
  payment: NotificationType.TRADE_PAYMENT_EXTENDED,
} as const satisfies Record<TradeExtensionStage, NotificationType>;

/**
 * Takas yanıt / ödeme süresi için extend_once (Süreler ve Kurallar →
 * tradeResponseHours / tradePaymentHours).
 *
 * Bu servis YALNIZ "uzatılsın mı / ne zaman / kime haber" sorusunu cevaplar;
 * iptal, iade, rezervasyon çözümü ve ücret mantığı `trade-reconciliation`'da
 * olduğu gibi kalır ve uzatılmayan her takas için DEĞİŞMEDEN çalışır.
 *
 *   - Karar, süre DOLDUĞU andaki eyleme göredir: her turun başında
 *     `resolveTimingAction` ile okunur (`planForRun`). Ayar değişikliği
 *     damgalı hiçbir son tarihi yeniden yazmaz.
 *   - "Bir kez" aşama başına `Trade.responseExtendedAt` / `paymentExtendedAt`
 *     ile kayda yazılır. Hak, takas satırı kilitliyken (FOR UPDATE, iptal
 *     döngüsünün tx'i) koşullu-atomik updateMany ile alınır: iki eşzamanlı tur
 *     aynı aşamayı iki kez uzatamaz; uzatılan takas aynı turda iptal de
 *     edilmez.
 */
@Injectable()
export class TradeDeadlineExtensionService {
  private readonly logger = new Logger(TradeDeadlineExtensionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly userBlocks: UserBlockService,
    private readonly notificationService: NotificationService,
  ) {}

  /**
   * Turun uzatma politikası. Aşama ancak eylemi `extend_once` ise listede
   * olur; değer (saat) uzatma anındaki süredir ("bir tam süre").
   */
  async planForRun(): Promise<TradeExtensionPlan> {
    const plan: TradeExtensionPlan = {};
    for (const stage of Object.keys(
      TRADE_EXTENSION_STAGE_RULE,
    ) as TradeExtensionStage[]) {
      const rule = TRADE_EXTENSION_STAGE_RULE[stage];
      if ((await resolveTimingAction(this.prisma, rule)) !== "extend_once") {
        continue;
      }
      plan[stage] = await resolveTimingValue(this.prisma, rule);
    }
    return plan;
  }

  /**
   * Bu takas bu aşamada uzatılabilir mi (anlık görüntü, tx DIŞI)? Uzatılamazsa
   * `null` — mevcut iptal yolu aynen çalışır. Kesin hak, tx içindeki
   * koşullu-atomik talepte alınır; burada yalnız pahalı/DB'ye dokunan
   * uygunluk bakılır (kilidi uzun tutmamak için).
   *
   * Uzatılmayan durumlar:
   *   - hak bu aşamada zaten kullanıldı,
   *   - taraflardan biri yasaklı/silinmiş ya da taraflar arasında engel var,
   *   - yanıt aşaması: kalemlerden biri artık satışta/yeterli stokta değil
   *     (bekleyen takasta rezervasyon YOKTUR; stoksuz bir teklifi canlı
   *     tutmak anlamsız),
   *   - ödeme aşaması: bkz. `evaluatePaymentExtension` (iade edilmiş satır,
   *     bekleyen ödeme yok, satır yok).
   */
  async evaluate(
    trade: ExtensionTradeSnapshot,
    stage: TradeExtensionStage,
  ): Promise<TradeExtensionDecision | null> {
    if (tradeStageExtendedAt(trade, stage)) return null;
    if (!(await this.partiesCanContinue(trade))) return null;

    if (stage === "response") {
      if (!(await this.itemsStillAvailable(trade.id))) return null;
      return { recipients: [trade.receiverId], paidParties: [] };
    }

    const rows = await this.prisma.tradeCashPayment.findMany({
      where: { tradeId: trade.id },
      select: { payerId: true, status: true },
    });
    const verdict = evaluatePaymentExtension(rows);
    if (verdict.blocker !== null) return null;
    return {
      recipients: verdict.recipients,
      paidParties: verdict.paidParties,
    };
  }

  /**
   * Hakkı AL ve son tarihi it — iptal döngüsünün kilitli tx'i içinde çağrılır.
   * Koşullu-atomik: başka tur/kullanıcı hamlesi koşulu bozduysa `null`
   * (uzatma yok; çağıran takası iptal ETMEZ, atlar).
   */
  async claim(
    tx: Prisma.TransactionClient,
    tradeId: string,
    stage: TradeExtensionStage,
    hours: number,
    now: Date,
  ): Promise<Date | null> {
    const deadline = tradeExtendedDeadline(now, hours);
    const claimed = await tx.trade.updateMany({
      where: tradeExtensionClaimWhere(tradeId, stage, now),
      data: tradeExtensionClaimData(stage, deadline, now),
    });
    return claimed.count === 1 ? deadline : null;
  }

  /**
   * Commit SONRASI: sırası gelen taraflara yeni son tarihi bildir. Bildirim
   * hatası uzatmayı geri almaz (best-effort; yalnız log).
   */
  async notifyExtended(
    tradeId: string,
    stage: TradeExtensionStage,
    decision: TradeExtensionDecision,
    until: Date,
  ): Promise<void> {
    const targets: Array<[string, NotificationType]> = [
      ...decision.recipients.map((userId): [string, NotificationType] => [
        userId,
        NOTIFICATION_BY_STAGE[stage],
      ]),
      ...decision.paidParties.map((userId): [string, NotificationType] => [
        userId,
        NotificationType.TRADE_PAYMENT_EXTENDED_PAID,
      ]),
    ];
    for (const [userId, type] of targets) {
      try {
        await this.notificationService.createInAppNotification(userId, type, {
          tradeId,
          until: formatNotificationDeadline(until),
          untilAt: until.toISOString(),
        });
      } catch (err) {
        this.logger.warn(
          `trade-${stage}-extended notify failed (trade=${tradeId}, user=${userId}): ${err}`,
        );
      }
    }
  }

  /** İki taraf da aktif hesap ve birbirine kapalı değil. */
  private async partiesCanContinue(
    trade: ExtensionTradeSnapshot,
  ): Promise<boolean> {
    const users = await this.prisma.user.findMany({
      where: { id: { in: [trade.initiatorId, trade.receiverId] } },
      select: { id: true, isBanned: true, deletedAt: true },
    });
    if (users.length !== 2) return false;
    if (users.some((user) => user.isBanned || user.deletedAt)) return false;
    return !(await this.userBlocks.isBlockedEither(
      trade.initiatorId,
      trade.receiverId,
    ));
  }

  /** Bekleyen takasın her kalemi hâlâ satışta ve istenen adet müsait. */
  private async itemsStillAvailable(tradeId: string): Promise<boolean> {
    const items = await this.prisma.tradeItem.findMany({
      where: { tradeId },
      select: { productId: true, quantity: true },
    });
    if (items.length === 0) return false;

    const wanted = new Map<string, number>();
    for (const item of items) {
      wanted.set(
        item.productId,
        (wanted.get(item.productId) ?? 0) + (item.quantity ?? 1),
      );
    }
    const products = await this.prisma.product.findMany({
      where: { id: { in: [...wanted.keys()] } },
      select: {
        id: true,
        status: true,
        quantity: true,
        reservedQuantity: true,
      },
    });
    if (products.length !== wanted.size) return false;
    return products.every((product) => {
      if (product.status !== ProductStatus.active) return false;
      const available = getAvailableQuantity(product);
      return available === null || available >= (wanted.get(product.id) ?? 1);
    });
  }
}
