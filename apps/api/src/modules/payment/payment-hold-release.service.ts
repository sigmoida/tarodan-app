import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../../prisma";
import {
  OrderStatus,
  PaymentHoldStatus,
  PaymentStatus,
  Prisma,
  RefundRequestStatus,
  TradeStatus,
} from "@prisma/client";
import { EventService } from "../events";
import { NotificationService } from "../notification/notification.service";
import { CacheService } from "../cache/cache.service";
import { OutboxService } from "../outbox/outbox.service";
import {
  OUTBOX_ORDER_REVENUE_INVOICE,
  type OrderRevenueInvoicePayload,
} from "../outbox/outbox.types";
import {
  PAYMENT_CONFIG_KEYS,
  resolvePaymentConfigNumber,
} from "./payment.constants";
import { i18nMessage } from "../i18n";
import {
  PUBLIC_NAME_SELECT,
  publicName,
} from "../../common/helpers/public-identity";

const PAYOUT_ELIGIBLE_ORDER_STATUSES: OrderStatus[] = [
  OrderStatus.delivered,
  OrderStatus.awaiting_buyer_confirmation,
  OrderStatus.completed,
];

const OPEN_REFUND_STATUSES: RefundRequestStatus[] = [
  RefundRequestStatus.pending_review,
  RefundRequestStatus.approved,
  RefundRequestStatus.wait_for_delivery,
  RefundRequestStatus.return_shipment_open,
  RefundRequestStatus.return_in_transit,
  RefundRequestStatus.return_delivered,
  RefundRequestStatus.disputed,
];

/**
 * Escrow'un SERBEST BIRAKMA tarafı — PaymentRefundService'ten birebir taşındı.
 * Para alıcıdan tahsil edildikten sonra satıcıya ne zaman geçeceğini bu servis
 * bilir: teslim anında release tarihini planlar (teslim + iade penceresi +
 * grace), tarihi dolan hold'ları cron ile bırakır ve admin'in erken bırakma
 * yolunu aynı guard'lardan geçirir.
 *
 * İade tarafıyla paylaştığı tek invaryant kritik: `frozenByRefundId` dolu bir
 * hold hiçbir yoldan serbest bırakılamaz — aksi halde açık bir iadeyle birlikte
 * hem satıcıya ödenir hem alıcıya iade edilir. Üç release yolu da (cron, admin
 * manuel, koşullu) bu şartı hem okumada hem atomik güncellemede taşır.
 */
@Injectable()
export class PaymentHoldReleaseService {
  private readonly logger = new Logger(PaymentHoldReleaseService.name);

  // Escrow: satıcıya ödeme TESLİMDEN sonra serbest bırakılır. İade TALEP
  // penceresi = teslim + returnWindowDays (14); satıcı payout uygunluğu =
  // teslim + returnWindowDays + payoutGraceDays. Grace, iade penceresi
  // kapandıktan SONRA payout'u başlatır → "14. günün son saniyesinde iade +
  // payout çoktan gitti" çakışması imkânsız olur.
  private readonly returnWindowDays: number;
  private readonly payoutGraceDays: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly eventService: EventService,
    private readonly notificationService: NotificationService,
    @Optional()
    private readonly outbox?: OutboxService,
    // Koli başına TEK bildirim için tekilleştirme anahtarı tutar. @Optional:
    // birim testleri cache sağlamak zorunda kalmasın — yoksa duyuru yapılır
    // (eksik bildirimdense fazlası yeğdir).
    @Optional()
    private readonly cache?: CacheService,
  ) {
    this.returnWindowDays = resolvePaymentConfigNumber(
      this.configService,
      PAYMENT_CONFIG_KEYS.RETURN_WINDOW_DAYS,
    );
    this.payoutGraceDays = resolvePaymentConfigNumber(
      this.configService,
      PAYMENT_CONFIG_KEYS.PAYOUT_GRACE_DAYS,
    );
  }

  /**
   * Release held payment to seller (admin manuel release yolu).
   *
   * `ignoreReleaseDate` (erken bırakma): yalnız TARİH şartını esnetir — sipariş
   * yine teslim edilmiş/payout-uygun olmalı, açık iade olmamalı ve hold donuk
   * olmamalı. Yani admin iade penceresi dolmadan parayı bilinçli olarak erken
   * bırakabilir ama teslim edilmemiş ya da iadesi süren siparişte bırakamaz.
   */
  async releasePayment(
    orderId: string,
    opts?: { ignoreReleaseDate?: boolean },
  ) {
    // H4: açık iade ile DONDURULMUŞ (frozenByRefundId dolu) bir hold ASLA serbest
    // bırakılamaz — aksi halde admin manuel release, açık iadeyle birlikte çift
    // kayba yol açar (satıcıya öde + alıcıya iade). releaseHoldsDue/releasePaymentIfHeld
    // ile aynı invaryant. Hem okuma hem güncelleme frozenByRefundId:null ile sınırlı.
    const now = new Date();
    const releaseDateFilter = opts?.ignoreReleaseDate
      ? {}
      : { releaseAt: { lte: now } };
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: {
        status: true,
        refundRequests: {
          where: { status: { in: OPEN_REFUND_STATUSES } },
          select: { id: true },
          take: 1,
        },
      },
    });
    if (
      !order ||
      !PAYOUT_ELIGIBLE_ORDER_STATUSES.includes(order.status) ||
      order.refundRequests.length > 0
    ) {
      throw new BadRequestException(
        i18nMessage("server.payment.holdNotReleasable"),
      );
    }

    const hold = await this.prisma.paymentHold.findFirst({
      where: {
        orderId,
        status: PaymentHoldStatus.held,
        frozenByRefundId: null,
        ...releaseDateFilter,
      },
    });

    if (!hold) {
      throw new NotFoundException(
        i18nMessage("server.payment.holdNotReleasable"),
      );
    }

    // Atomik son guard: held + frozenByRefundId:null WHERE içinde — eşzamanlı açılan
    // bir iade (freeze) yarışını kapatır (TOCTOU yok).
    const released = await this.prisma.paymentHold.updateMany({
      where: {
        id: hold.id,
        status: PaymentHoldStatus.held,
        frozenByRefundId: null,
        ...releaseDateFilter,
      },
      data: {
        status: PaymentHoldStatus.released,
        releasedAt: now,
      },
    });

    if (released.count === 0) {
      throw new NotFoundException(
        i18nMessage("server.payment.holdNotReleasable"),
      );
    }

    // In production: transfer funds to seller
    this.logger.log(
      `Payment hold ${hold.id} released to seller ${hold.sellerId}`,
    );

    return { success: true, holdId: hold.id, amount: Number(hold.amount) };
  }

  /**
   * Release all payment holds whose releaseAt date has passed (for cron).
   * Also releases TradeCashPayment (safe-trade escrow) records whose
   * holdReleaseAt has passed.
   * Returns the number of order holds and trade cash payments released.
   */
  /**
   * Teslimde çağrılır: ürünün PaymentHold(ler)inin releaseAt'ini
   * deliveredAt + returnWindowDays + payoutGraceDays olarak ayarlar.
   * Tek otorite kaynağı: hold serbestliği SADECE bu tarihten sonra (ve açık iade
   * yokken) olur. Idempotent: held olmayan hold'a dokunmaz.
   */
  async scheduleHoldReleaseOnDelivery(
    orderId: string,
    deliveredAt: Date,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    const db = tx ?? this.prisma;
    const releaseAt = new Date(deliveredAt.getTime());
    releaseAt.setDate(
      releaseAt.getDate() + this.returnWindowDays + this.payoutGraceDays,
    );
    await db.paymentHold.updateMany({
      where: { orderId, status: PaymentHoldStatus.held },
      data: { releaseAt },
    });
    this.logger.log(
      `Hold release scheduled for order ${orderId} at ${releaseAt.toISOString()} (teslim+${this.returnWindowDays}+${this.payoutGraceDays}g)`,
    );
  }

  /**
   * Tek kanonik TESLİM handler'ı. Bir sipariş teslim edildiğinde çağrılır — hangi
   * yoldan gelirse gelsin (generic webhook, worker, Sürat poll cron, admin). İki işi
   * ATOMIK bir mantıkta birleştirir:
   *   1) Order.status/deliveredAt/confirmationDeadline'ı FEATURE_48H'e göre ayarlar,
   *   2) escrow release'ini planlar (scheduleHoldReleaseOnDelivery) — satıcıya ödemenin
   *      TEK tetikleyicisi budur; atlanırsa PaymentHold.releaseAt null kalır ve satıcı
   *      hiç ödenmez.
   *
   * Idempotent + güvenli: yalnız HENÜZ teslim edilmemiş (deliveredAt null) ve terminal
   * olmayan (completed/cancelled/refund_requested/refunded değil) bir siparişte ilerler.
   * Böylece re-poll/replay deliveredAt'i TAŞIMAZ → releaseAt kaymaz; iptal/iade edilmiş
   * sipariş yanlışlıkla "delivered"a çekilmez. Eski poll'un status=delivered ama
   * deliveredAt=null bıraktığı takılı siparişler bir sonraki teslim çağrısında iyileşir.
   *
   * Bildirim ÇAĞIRANDA kalır (metod acted + use48h + confirmationDeadline + buyerId döner)
   * ki teslim I/O'su alıcı bildirim çağrısını beklemesin ve mevcut çağıran davranışı korunsun.
   */
  /**
   * TESLİM DUYURUSU — post-commit, `handleOrderDelivered` acted=true döndüğünde
   * çağrılır (poller, webhook, admin: hangisi teslimi ilk yazdıysa yalnız o).
   *
   * Teslim, alıcı için sürecin en kritik anıdır: 14 günlük iade hakkı ve satıcı
   * ödemesinin saati o an başlar. Buna rağmen 48 saatlik onay penceresi bayrağı
   * KAPALIYKEN (varsayılan) hiçbir bildirim gitmiyordu — `emitOrderDelivered` ve
   * `ORDER_DELIVERED` şablonu tanımlı ama çağrısız duruyordu. Sessiz teslim,
   * "kargom geldi mi, iade sürem başladı mı" bileti demektir.
   *
   * KOLİ BAŞINA TEK: bir koli birden çok sipariş satırı taşır (Shipment satırı
   * sipariş başına). Paket kimliğiyle tekilleştirilir, aksi halde tek koli için
   * kalem sayısı kadar bildirim gider.
   */
  async announceOrderDelivered(orderId: string): Promise<void> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        orderNumber: true,
        buyerId: true,
        packageId: true,
        buyer: { select: { email: true, ...PUBLIC_NAME_SELECT } },
        seller: { select: { email: true, ...PUBLIC_NAME_SELECT } },
      },
    });
    if (!order?.buyerId) return;

    if (!(await this.claimPackageAnnouncement("delivered", order))) return;

    try {
      await this.notificationService.notifyOrderDelivered(
        order.buyerId,
        order.id,
      );
    } catch (e: any) {
      this.logger.warn(
        `notifyOrderDelivered failed for ${orderId}: ${e?.message}`,
      );
    }

    try {
      await this.eventService.emitOrderDelivered({
        orderId: order.id,
        orderNumber: order.orderNumber,
        buyerEmail: order.buyer?.email ?? "",
        sellerEmail: order.seller?.email ?? "",
        buyerName: publicName(order.buyer),
        sellerName: publicName(order.seller),
      });
    } catch (e: any) {
      this.logger.warn(
        `emitOrderDelivered failed for ${orderId}: ${e?.message}`,
      );
    }
  }

  /**
   * Koli başına tek duyuru hakkı. Aynı koliye ait ilk sipariş satırı hakkı alır,
   * kardeşleri sessiz kalır. Paketsiz (eski/manuel) siparişte sipariş kimliğiyle
   * çalışır — davranış değişmez. Cache yoksa duyuru yapılır: eksik bildirimdense
   * fazlası yeğdir.
   */
  async claimPackageAnnouncement(
    kind: "shipped" | "delivered",
    order: { id: string; packageId: string | null },
  ): Promise<boolean> {
    if (!this.cache) return true;
    const scope = order.packageId
      ? `pkg:${order.packageId}`
      : `ord:${order.id}`;
    const key = `notif:order-${kind}:${scope}`;
    try {
      if (await this.cache.get(key)) return false;
      await this.cache.set(key, 1, { ttl: 7 * 24 * 3600 });
    } catch {
      return true;
    }
    return true;
  }

  async handleOrderDelivered(
    orderId: string,
    deliveredAt: Date,
    tx?: Prisma.TransactionClient,
  ): Promise<{
    acted: boolean;
    use48h: boolean;
    confirmationDeadline: Date | null;
    buyerId: string | null;
  }> {
    const db = tx ?? this.prisma;
    const use48h =
      this.configService.get<string>("FEATURE_48H_CONFIRMATION_WINDOW") ===
      "true";
    const confirmationDeadline = use48h
      ? new Date(deliveredAt.getTime() + 48 * 60 * 60 * 1000)
      : null;
    const targetStatus = use48h
      ? OrderStatus.awaiting_buyer_confirmation
      : OrderStatus.delivered;

    const updated = await db.order.updateMany({
      where: {
        id: orderId,
        deliveredAt: null,
        status: {
          notIn: [
            OrderStatus.completed,
            OrderStatus.cancelled,
            OrderStatus.refund_requested,
            OrderStatus.refunded,
          ],
        },
      },
      data: {
        status: targetStatus,
        deliveredAt,
        confirmationDeadline,
        version: { increment: 1 },
      },
    });

    if (updated.count === 0) {
      // Zaten teslim işlenmiş / teslim-uygun değil → no-op (replay-safe).
      return {
        acted: false,
        use48h,
        confirmationDeadline: null,
        buyerId: null,
      };
    }

    // Escrow saatini teslimden başlat — para akışının TEK tetikleyicisi.
    await this.scheduleHoldReleaseOnDelivery(orderId, deliveredAt, tx);

    // Teslim gelir faturalarını AYNI tx'te dayanıklı olarak kuyruğa al. Eskiden
    // faturalama yalnız 2 dakikalık backfill cron'una bağlıydı; cron'un aday
    // penceresi doyduğunda veya cron gecikince e-Arşiv'in 7 günlük yasal süresi
    // kaçırılabiliyordu. Outbox at-least-once + issue* idempotent olduğu için
    // cron ile birlikte çalışması güvenli.
    if (this.outbox && tx) {
      await this.outbox.enqueue(tx, {
        type: OUTBOX_ORDER_REVENUE_INVOICE,
        payload: { orderId } satisfies OrderRevenueInvoicePayload,
        dedupeKey: `${OUTBOX_ORDER_REVENUE_INVOICE}:${orderId}`,
      });
    }

    const order = await db.order.findUnique({
      where: { id: orderId },
      select: { buyerId: true },
    });
    return {
      acted: true,
      use48h,
      confirmationDeadline,
      buyerId: order?.buyerId ?? null,
    };
  }

  async releaseHoldsDue(): Promise<{
    count: number;
    tradeCashReleased: number;
  }> {
    const now = new Date();

    // 1) Sipariş ödeme bekletmeleri (PaymentHold) — atomik: sadece held VE
    // dondurulmamış (frozenByRefundId null) olanları release et. releaseAt artık
    // teslim + return + grace olduğu için süre dolduğunda iade penceresi zaten
    // kapanmıştır; açık iade varsa frozen + status guard'ları release'i engeller.
    const dueHolds = await this.prisma.paymentHold.findMany({
      where: {
        status: PaymentHoldStatus.held,
        releaseAt: { lte: now },
        frozenByRefundId: null,
      },
    });

    // Y1: Escrow yalnızca ürün en az sevk edildiyse VE açık bir iade/itiraz yoksa
    // serbest bırakılmalı. releaseAt ödeme anında NULL'dır; yalnız teslimde
    // handleOrderDelivered/scheduleHoldReleaseOnDelivery ile teslim+return+grace olarak
    // set edilir. Bu yüzden aşağıdaki durum guard'ı ek bir güvenlik katmanıdır: teslim
    // edilmemiş ya da iadesi açık bir siparişte (releaseAt bir şekilde geçmişte olsa bile)
    // parayı satıcıya BIRAKMAYIZ (held bırakmak, yanlış ödemekten güvenlidir). preparing'de
    // takılan siparişler zaten handleExpiredPreparingOrders tarafından iptal+iade edilir.
    let holdCount = 0;
    for (const hold of dueHolds) {
      const order = await this.prisma.order.findUnique({
        where: { id: hold.orderId },
        select: {
          status: true,
          refundRequests: {
            where: { status: { in: OPEN_REFUND_STATUSES } },
            select: { id: true },
            take: 1,
          },
        },
      });
      if (
        !order ||
        !PAYOUT_ELIGIBLE_ORDER_STATUSES.includes(order.status) ||
        order.refundRequests.length > 0
      ) {
        // Henüz serbest bırakma — bir sonraki cron turunda tekrar denenir.
        continue;
      }
      // Atomik son guard: frozenByRefundId null kontrolü WHERE içinde — bu cron
      // turuyla eşzamanlı açılan bir iade (freeze) yarışını kapatır (TOCTOU yok).
      const updated = await this.prisma.paymentHold.updateMany({
        where: {
          id: hold.id,
          status: PaymentHoldStatus.held,
          frozenByRefundId: null,
        },
        data: { status: PaymentHoldStatus.released, releasedAt: now },
      });
      if (updated.count > 0) holdCount++;
    }
    if (holdCount > 0) {
      this.logger.log(
        `Released ${holdCount} payment hold(s) (releaseAt <= ${now.toISOString()})`,
      );
    }

    // 2) Safe-trade nakit ödemeleri: holdReleaseAt süresi geçmiş olanları bırak
    let tradeCashReleased = 0;
    const dueTradeCash = await this.prisma.tradeCashPayment.findMany({
      where: {
        status: PaymentStatus.completed,
        holdReleaseAt: { lte: now },
        releasedAt: null,
        refundedAt: null,
      },
    });

    for (const tcp of dueTradeCash) {
      // Takas nakit guard: takas yalnızca COMPLETED ise payout serbest bırakılır.
      // returning/disputed/cancelled/admin_reviewing'de SERBEST BIRAKMA — aksi halde
      // iade/iptal sürecindeki takasta satıcıya da para gider (çift-ödeme açığı).
      const trade = await this.prisma.trade.findUnique({
        where: { id: tcp.tradeId },
        select: { status: true },
      });
      if (!trade || trade.status !== TradeStatus.completed) {
        continue;
      }
      // Atomik guard: sadece hâlâ released/refunded olmamış olanları güncelle
      const updated = await this.prisma.tradeCashPayment.updateMany({
        where: { id: tcp.id, releasedAt: null, refundedAt: null },
        data: { releasedAt: now },
      });
      if (updated.count > 0) tradeCashReleased++;
    }

    if (tradeCashReleased > 0) {
      this.logger.log(
        `Released ${tradeCashReleased} trade cash payment(s) (holdReleaseAt <= ${now.toISOString()})`,
      );
    }

    return { count: holdCount, tradeCashReleased };
  }

  /**
   * Try to release payment hold for an order (e.g. on delivery). Idempotent: no-op if already released or not found.
   */
  async releasePaymentIfHeld(orderId: string): Promise<boolean> {
    // frozenByRefundId dolu (açık iade) hold ASLA serbest bırakılamaz — defansif:
    // bu metod artık teslim akışlarında çağrılmıyor (teslim→scheduleHoldReleaseOnDelivery)
    // ama başka çağıran olursa frozen invaryantı bozulmasın.
    const now = new Date();
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: {
        status: true,
        refundRequests: {
          where: { status: { in: OPEN_REFUND_STATUSES } },
          select: { id: true },
          take: 1,
        },
      },
    });
    if (
      !order ||
      !PAYOUT_ELIGIBLE_ORDER_STATUSES.includes(order.status) ||
      order.refundRequests.length > 0
    ) {
      return false;
    }
    const updated = await this.prisma.paymentHold.updateMany({
      where: {
        orderId,
        status: PaymentHoldStatus.held,
        frozenByRefundId: null,
        releaseAt: { lte: now },
      },
      data: { status: PaymentHoldStatus.released, releasedAt: now },
    });
    if (updated.count === 0) return false;
    this.logger.log(`Payment hold released for order ${orderId}`);
    return true;
  }
}
