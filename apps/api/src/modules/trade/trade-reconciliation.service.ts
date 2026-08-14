import { Injectable, Optional, Logger } from "@nestjs/common";
import { PrismaService } from "../../prisma";
import { CacheService } from "../cache/cache.service";
import { NotificationService } from "../notification/notification.service";
import { NotificationType } from "../notification/dto";
import { EventService } from "../events";
import {
  TradeStatus,
  ProductStatus,
  ShipmentStatus,
  PaymentStatus,
} from "@prisma/client";
import {
  computeTradeHoldReleaseAt,
  startTradeConfirmationWindowIfDelivered,
  tradeLostParcelGraceDays,
} from "../../common/helpers/trade-escrow";
import { safeDecrementReserved } from "../product/helpers/product-availability.helper";
import { getProductStatusFromQuantity } from "../product/helpers/product-status.helper";
import { PaymentService } from "../payment/payment.service";
import { TradeShipmentService } from "./trade-shipment.service";
import { TradeCommonService } from "./trade-common.service";
import { TRADE_CANCEL_REASON } from "./trade-cancel-reasons";
import { adminUrl } from "../../config/app-urls";

/**
 * Zamanlanmış (cron) takas mutabakat işleri — TradeService'ten birebir taşındı.
 * auto-cancel / auto-confirm / eksik inbound kargo telafisi. Facade aynı
 * public imzalarla delege eder (order/trade split desenindeki gibi).
 */
@Injectable()
export class TradeReconciliationService {
  private readonly logger = new Logger(TradeReconciliationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
    private readonly notificationService: NotificationService,
    private readonly paymentService: PaymentService,
    @Optional()
    private readonly eventService: EventService,
    private readonly tradeShipment: TradeShipmentService,
    private readonly tradeCommon: TradeCommonService,
  ) {}

  // ==========================================================================
  // AUTO-CANCEL EXPIRED TRADES (Scheduled job)
  // ==========================================================================
  /**
   * Admin alarm linklerinin taban adresi — tüketici sitesi değil admin paneli.
   * Diğer adminLink üreticileriyle (refund/product-scheduler) aynı kural.
   */
  private adminBaseUrl(): string {
    return adminUrl();
  }

  /**
   * Elle müdahale bekleyen takaslar için aktif admin'lere in-app bildirim
   * gönderir. Her takas için 24s cache dedup uygular: cron 5 dk'da bir
   * çalıştığından spam olmaz, ama çözülmeyen takas TTL dolunca tekrar
   * hatırlatılır. Tamamen non-blocking — hata cron'u bozmaz.
   */
  private async notifyAdminsOnce(
    type: NotificationType,
    cachePrefix: string,
    items: Array<{ id: string; payload: Record<string, unknown> }>,
  ): Promise<void> {
    try {
      const fresh: typeof items = [];
      for (const item of items) {
        const key = `${cachePrefix}:${item.id}`;
        const already = await this.cache.get<boolean>(key);
        if (already) continue;
        fresh.push(item);
        await this.cache.set(key, true, { ttl: 24 * 60 * 60 });
      }
      if (fresh.length === 0) return;

      const admins = await this.prisma.adminUser.findMany({
        where: { isActive: true },
        select: { userId: true },
      });
      for (const item of fresh) {
        for (const a of admins) {
          try {
            await this.notificationService.createInAppNotification(
              a.userId,
              type,
              item.payload,
            );
          } catch (err: any) {
            this.logger.error(
              `Admin bildirimi başarısız (type=${type}, trade=${item.id}, admin=${a.userId}): ${err?.message}`,
            );
          }
        }
      }
    } catch (err: any) {
      this.logger.warn(`notifyAdminsOnce(${type}) failed: ${err?.message}`);
    }
  }

  /**
   * Depoya ulaşıp süresi dolduğu için otomatik iptal edilemeyen ("stuck")
   * takaslar — admin force-cancel-stuck/reject ile çözer.
   */
  private async notifyAdminsOfStuckTrades(
    stuckTrades: Array<{
      id: string;
      tradeNumber: string;
      shippingDeadline: Date | null;
      firstWarehouseArrivalAt: Date | null;
    }>,
  ): Promise<void> {
    await this.notifyAdminsOnce(
      NotificationType.TRADE_STUCK_AT_WAREHOUSE,
      "stuck-trade-alerted",
      stuckTrades.map((t) => ({
        id: t.id,
        payload: {
          tradeId: t.id,
          tradeNumber: t.tradeNumber,
          arrivedAt: t.firstWarehouseArrivalAt?.toISOString(),
          deadline: t.shippingDeadline?.toISOString(),
          // Admin alarmı: hedef admin panelindeki takas dosyası (serbest link).
          adminLink: `${this.adminBaseUrl()}/operations/trades/${encodeURIComponent(t.id)}`,
        },
      })),
    );
  }

  /**
   * Kendini onaran tarama: çıkış sevkindeki, penceresi henüz kurulmamış
   * takaslar için pencereyi KALICI deliveredAt değerlerinden kurmayı dener.
   * Pencere kuruluşu normalde teslim OLAYINA bağlı tek seferlik bir yan etki
   * (Sürat poll'u / kullanıcı onayı / admin işareti); olay anındaki geçici bir
   * hata bacağı poll kümesinden düşürüp takası süresiz askıda bırakabilir.
   * Helper idempotent olduğundan bu tarama olay yollarıyla yarışsa da güvenli.
   */
  private async startPendingTradeConfirmationWindows(): Promise<number> {
    const candidates = await this.prisma.trade.findMany({
      where: {
        status: TradeStatus.shipping_to_recipients,
        confirmationDeadline: null,
        // Ön filtre (ucuz): en az bir teslim edilmiş çıkış bacağı olsun.
        // "Hepsi teslim + iptal/dönüş yok" kararını helper verir.
        shipments: {
          some: { leg: "from_warehouse", deliveredAt: { not: null } },
        },
      },
      select: { id: true },
      orderBy: { updatedAt: "asc" },
      take: 50,
    });

    let started = 0;
    for (const trade of candidates) {
      try {
        const startedAt = await startTradeConfirmationWindowIfDelivered(
          this.prisma,
          trade.id,
        );
        if (startedAt) {
          started++;
          this.logger.log(
            `Sweep: trade ${trade.id} onay penceresi ${startedAt.toISOString()} tarihine kuruldu`,
          );
        }
      } catch (err: any) {
        this.logger.error(
          `Sweep: trade ${trade.id} onay penceresi kurulamadı: ${err?.message}`,
        );
      }
    }
    return started;
  }

  /**
   * Çıkış kolisi (depo → kullanıcı) uzun süredir yolda ama taşıyıcıdan TESLİM
   * raporu gelmedi. Onay/itiraz penceresi teslimattan başladığı için bu
   * takaslar kendiliğinden tamamlanmaz — ve tamamlanmamalıdır: teslim kanıtı
   * yokken parayı açmak, düzelttiğimiz "koli yoldayken para serbest" hatasının
   * ta kendisidir. Bunun yerine admin'e alarm verilir; admin itiraz/tazminat
   * yollarıyla çözer. Eşik: çıkıştan TRADE_LOST_PARCEL_GRACE_DAYS gün sonra.
   */
  private async notifyAdminsOfUndeliveredOutboundTrades(
    now: Date,
  ): Promise<number> {
    const cutoff = new Date(
      now.getTime() - tradeLostParcelGraceDays() * 24 * 60 * 60 * 1000,
    );
    const candidates = await this.prisma.trade.findMany({
      where: {
        status: TradeStatus.shipping_to_recipients,
        confirmationDeadline: null,
        shipments: {
          some: { leg: "from_warehouse", shippedAt: { lt: cutoff } },
        },
      },
      select: { id: true, tradeNumber: true },
      // Deterministik sıra ŞART: sırasız take(20), 20'den kalabalık bir yığında
      // her turda aynı (çoktan dedup'lanmış) alt kümeyi döndürüp gerisini
      // sonsuza dek gizleyebilirdi. En eski önce → yığın sırayla boşalır.
      orderBy: { updatedAt: "asc" },
      take: 20,
    });
    if (candidates.length === 0) return 0;

    this.logger.warn(
      `Çıkış kolisi teslim raporu gelmeyen takaslar (admin müdahalesi): ${candidates
        .map((t) => `${t.tradeNumber}(id=${t.id})`)
        .join(", ")}`,
    );
    await this.notifyAdminsOnce(
      NotificationType.TRADE_OUTBOUND_DELIVERY_MISSING,
      "outbound-delivery-stuck-alerted",
      candidates.map((t) => ({
        id: t.id,
        payload: {
          tradeId: t.id,
          tradeNumber: t.tradeNumber,
          // Admin alarmı: hedef admin panelindeki takas dosyası (serbest link).
          adminLink: `${this.adminBaseUrl()}/operations/trades/${encodeURIComponent(t.id)}`,
        },
      })),
    );
    return candidates.length;
  }

  async autoCancelExpiredTrades(): Promise<number> {
    const now = new Date();

    // Find trades that have passed their deadlines
    const expiredPendingTrades = await this.prisma.trade.findMany({
      where: {
        status: TradeStatus.pending,
        responseDeadline: { lt: now },
      },
    });

    const expiredAcceptedTrades = await this.prisma.trade.findMany({
      where: {
        status: TradeStatus.accepted,
        shippingDeadline: { lt: now },
      },
    });

    // Safe-trade: cash payment timeout
    const expiredPaymentTrades = await this.prisma.trade.findMany({
      where: {
        status: TradeStatus.awaiting_payment,
        paymentDeadline: { lt: now },
      },
    });

    // Safe-trade: shipping-to-warehouse timeout. Kullanıcı iptal kilidiyle
    // AYNI eşik (computeTradeCanCancel): herhangi bir to_warehouse gönderisi
    // kargoya verildiyse (shippedAt) veya bir ürün depoya ulaştıysa oto-iptal
    // YAPILMAZ — koli yoldayken iptal etmek dönüş kargosu olmayan ölü bir
    // takasa mal taşımak demektir. Bunlar admin'e bırakılır
    // (reject veya force-cancel-stuck).
    const expiredShippingTrades = await this.prisma.trade.findMany({
      where: {
        status: TradeStatus.shipping_to_warehouse,
        shippingDeadline: { lt: now },
        firstWarehouseArrivalAt: null,
        shipments: {
          none: { leg: "to_warehouse", shippedAt: { not: null } },
        },
      },
    });

    // Stuck trades surface: deadline passed AND an item is already moving
    // (arrived at warehouse OR handed to cargo). These need manual admin
    // action (reject / force-cancel-stuck); we log them every run so they
    // don't sit silent.
    const stuckTrades = await this.prisma.trade.findMany({
      where: {
        status: TradeStatus.shipping_to_warehouse,
        shippingDeadline: { lt: now },
        OR: [
          { firstWarehouseArrivalAt: { not: null } },
          {
            shipments: {
              some: { leg: "to_warehouse", shippedAt: { not: null } },
            },
          },
        ],
      },
      select: {
        id: true,
        tradeNumber: true,
        shippingDeadline: true,
        firstWarehouseArrivalAt: true,
      },
    });
    if (stuckTrades.length > 0) {
      this.logger.warn(
        `Stuck trades requiring admin force-cancel-stuck: ${stuckTrades
          .map(
            (t) =>
              `${t.tradeNumber}(id=${t.id} arrived=${t.firstWarehouseArrivalAt?.toISOString()} deadline=${t.shippingDeadline?.toISOString()})`,
          )
          .join(", ")}`,
      );
      // Loglar sessiz kalmasın diye admin'lere bildirim de gönder. Cron her 5 dk
      // çalıştığından her takas için 24s cache dedup ile spam'i engelle; çözülmeyen
      // takas ertesi gün tekrar hatırlatılır (TTL dolunca). Non-blocking.
      await this.notifyAdminsOfStuckTrades(stuckTrades);
    }

    // Kayıp koli: kargoya verilmiş ama depoya HİÇ ulaşmamış takas, kargo
    // kilidi yüzünden oto-iptal kümesine girmez (koli hâlâ yolda olabilir).
    // Süresiz askıda da kalmamalı: son tarih + bekleme süresi (varsayılan 14
    // gün) geçtiyse koli kayıp sayılır ve takas otomatik çözülür.
    const lostResolved = await this.autoResolveLostParcelTrades(now);

    // Teslimatları tamamlanmış ama penceresi (olay anındaki geçici bir hata
    // yüzünden) kurulamamış takasları önce onar, kalan gerçek askıdakileri
    // admin'e alarm et.
    await this.startPendingTradeConfirmationWindows();

    // Çıkış bacağında teslim raporu hiç gelmeyen takaslar: otomatik
    // tamamlanmazlar (teslim kanıtı yok), admin'e alarm verilir.
    await this.notifyAdminsOfUndeliveredOutboundTrades(now);

    let cancelledCount = lostResolved;

    for (const trade of [
      ...expiredPendingTrades,
      ...expiredAcceptedTrades,
      ...expiredPaymentTrades,
      ...expiredShippingTrades,
    ]) {
      // Kusur ataması: ÖDEME süresi aşımında ödemesini yapmış taraf kusursuzdur
      // (takas karşı taraf ödemediği için bozuldu) → tam iade. Kargolama süresi
      // aşımında (bu kümeye yalnız HİÇBİR kolinin verilmediği takaslar girer)
      // iki taraf da üstüne düşeni yapmamıştır; kimse kusursuz sayılmaz.
      const paymentDefaultCancel = expiredPaymentTrades.some(
        (t) => t.id === trade.id,
      );
      try {
        // SIRA KRİTİK: önce KOŞULLU-ATOMİK iptal (tx içinde tüm uygunluk
        // koşulları yeniden doğrulanır), iade ANCAK iptal commit olduysa ve
        // sonrasında yapılır. Eski sıra (önce iade, sonra tx) iki yarışa
        // açıktı: (a) anlık görüntü ile tx arasında koli kargoya verildiyse
        // status değişmediği için iade + iptal yine işliyordu — dönüş legi
        // olmayan ölü takasa koli taşınıyordu; (b) awaiting_payment'ta PayTR
        // callback'i araya girerse yeni tahsil edilen ödeme iade ediliyor ama
        // tx statü değişikliğini görüp iptali atlıyordu — takas canlı, para
        // alıcıda. İade tx SONRASINDA tracked yoldan yapılır; hata iptali
        // geri almaz, marker + retryFailedTradeRefunds parayı toparlar
        // (status=cancelled süpürme kapsamındadır).
        const cancelled = await this.prisma.$transaction(async (tx) => {
          // FOR UPDATE: trade satırını kilitle; başka bir işlem (örn. acceptTrade)
          // bu trade'i aynı anda değiştirmeye çalışırsa bekler.
          await tx.$queryRaw`SELECT id FROM trades WHERE id = ${trade.id} FOR UPDATE`;

          // Kilitleme sonrası en güncel durumu oku ve UYGUNLUĞU yeniden doğrula.
          const freshTrade = await tx.trade.findUnique({
            where: { id: trade.id },
            select: { status: true, firstWarehouseArrivalAt: true },
          });
          // Başka bir akış zaten işleme almışsa bu trade'i atla
          if (!freshTrade || freshTrade.status !== trade.status) {
            return false;
          }
          // Kargo kilidi anlık görüntüde DEĞİL, kilitli tx içinde doğrulanır:
          // koli bu arada kargoya verildiyse ya da depoya vardıysa iptal etme —
          // takas stuck kümesine düşer, admin/kayıp-koli akışı ilgilenir.
          if (trade.status === TradeStatus.shipping_to_warehouse) {
            if (freshTrade.firstWarehouseArrivalAt) return false;
            const shippedLeg = await tx.tradeShipment.findFirst({
              where: {
                tradeId: trade.id,
                leg: "to_warehouse",
                shippedAt: { not: null },
              },
              select: { id: true },
            });
            if (shippedLeg) return false;
          }

          const allItems = await tx.tradeItem.findMany({
            where: { tradeId: trade.id },
          });

          // Release reservations for any non-pending trade being auto-cancelled
          const statusesWithReservation: TradeStatus[] = [
            TradeStatus.accepted,
            TradeStatus.awaiting_payment,
            TradeStatus.shipping_to_warehouse,
          ];
          if (
            statusesWithReservation.includes(trade.status) &&
            allItems.length > 0
          ) {
            const byProduct = new Map<string, number>();
            for (const item of allItems) {
              byProduct.set(
                item.productId,
                (byProduct.get(item.productId) ?? 0) + item.quantity,
              );
            }
            // Auto-cancel: kabul anında yapılan rezervasyonu geri al
            for (const [productId, qty] of byProduct) {
              await tx.$queryRaw`SELECT id FROM products WHERE id = ${productId} FOR UPDATE`;
              const prod = await tx.product.findUnique({
                where: { id: productId },
                select: { reservedQuantity: true },
              });
              if (prod) {
                const newReserved = safeDecrementReserved(
                  prod.reservedQuantity,
                  qty,
                );
                await tx.product.update({
                  where: { id: productId },
                  data: {
                    reservedQuantity: newReserved,
                    status:
                      newReserved > 0
                        ? ProductStatus.reserved
                        : ProductStatus.active,
                  },
                });
              }
            }
          }

          await tx.trade.update({
            where: { id: trade.id },
            data: {
              status: TradeStatus.cancelled,
              cancelReason: TRADE_CANCEL_REASON.autoExpired,
              cancelledAt: now,
            },
          });

          if (paymentDefaultCancel) {
            // Tamamlanmış her ödeme satırı, üstüne düşeni yapmış tarafa aittir.
            await tx.tradeCashPayment.updateMany({
              where: { tradeId: trade.id, status: PaymentStatus.completed },
              data: { fullRefundEntitled: true },
            });
          }
          return true;
        });
        if (!cancelled) continue;

        // İade YALNIZ iptal commit olduktan sonra (yukarıdaki sıra notu).
        await this.paymentService.refundTradeCashTracked(trade.id);

        await this.tradeCommon.invalidateProductCachesForTrade(trade.id);

        // Cancel Sürat shipments if any (best-effort)
        await this.tradeShipment.cancelSuratShipmentsForTrade(trade.id);

        cancelledCount++;

        // Transaction commit sonrası: iptal edilen takas katılımcılarına bildirim
        if (this.eventService) {
          try {
            await this.eventService.emitTradeAutoCancelled({
              tradeId: trade.id,
              initiatorId: trade.initiatorId,
              receiverId: trade.receiverId,
              reason: "Takas süresi dolduğu için otomatik iptal edildi",
            });
          } catch (err) {
            this.logger.error(
              `Failed to emit trade.auto-cancelled for trade ${trade.id}: ${err}`,
            );
          }
        }
      } catch (error) {
        this.logger.error("Failed to auto-cancel trade");
      }
    }

    return cancelledCount;
  }

  /**
   * Kayıp koli otomatik çözümü: shippingDeadline + TRADE_LOST_PARCEL_GRACE_DAYS
   * (varsayılan 14 gün) geçmiş, en az bir to_warehouse kolisi kargoya verilmiş
   * ama depoya HİÇ varış kaydı olmayan takas kayıp sayılır. Koşullu-atomik
   * iptal → izlenen iade (matris gereği kargo hariç) → koli kaybolan tarafa
   * tazminat işareti. Kaybolan ürün yeniden satışa AÇILMAZ (birim fiziksel
   * olarak yok): adetleri düşülür; kargolanmamış tarafın ürünü normal şekilde
   * serbest kalır. Bu, kullanıcı iptal kilidinin (koli yolda → iptal yok)
   * süresiz askı üretmesini engeller.
   */
  private async autoResolveLostParcelTrades(now: Date): Promise<number> {
    const graceDays = tradeLostParcelGraceDays();
    const cutoff = new Date(now.getTime() - graceDays * 24 * 60 * 60 * 1000);
    const candidates = await this.prisma.trade.findMany({
      where: {
        status: TradeStatus.shipping_to_warehouse,
        shippingDeadline: { lt: cutoff },
        firstWarehouseArrivalAt: null,
        shipments: { some: { leg: "to_warehouse", shippedAt: { not: null } } },
      },
      select: {
        id: true,
        tradeNumber: true,
        initiatorId: true,
        receiverId: true,
      },
      take: 20,
    });

    let resolved = 0;
    for (const trade of candidates) {
      try {
        const claimed = await this.prisma.$transaction(async (tx) => {
          await tx.$queryRaw`SELECT id FROM trades WHERE id = ${trade.id} FOR UPDATE`;
          const fresh = await tx.trade.findUnique({
            where: { id: trade.id },
            select: { status: true, firstWarehouseArrivalAt: true },
          });
          // Bu arada depoya vardıysa ya da statü değiştiyse dokunma.
          if (
            !fresh ||
            fresh.status !== TradeStatus.shipping_to_warehouse ||
            fresh.firstWarehouseArrivalAt
          ) {
            return false;
          }
          const shippedLegs = await tx.tradeShipment.findMany({
            where: {
              tradeId: trade.id,
              leg: "to_warehouse",
              shippedAt: { not: null },
            },
            select: { shipperId: true },
          });
          if (shippedLegs.length === 0) return false;
          const lostShipperIds = new Set(shippedLegs.map((s) => s.shipperId));

          const items = await tx.tradeItem.findMany({
            where: { tradeId: trade.id },
            select: { productId: true, quantity: true, side: true },
          });
          const ownerOf = (side: string) =>
            side === "initiator" ? trade.initiatorId : trade.receiverId;
          for (const item of items) {
            await tx.$queryRaw`SELECT id FROM products WHERE id = ${item.productId} FOR UPDATE`;
            const prod = await tx.product.findUnique({
              where: { id: item.productId },
              select: { quantity: true, reservedQuantity: true },
            });
            if (!prod) continue;
            const qty = item.quantity ?? 1;
            const newReserved = safeDecrementReserved(
              prod.reservedQuantity,
              qty,
            );
            if (lostShipperIds.has(ownerOf(item.side))) {
              // Kaybolan birimler stoktan da düşer; ilan kalan stoğuna göre
              // durumunu alır (tekil üründe inactive/sold-out'a düşer).
              const newQuantity =
                prod.quantity === null
                  ? null
                  : Math.max(0, prod.quantity - qty);
              await tx.product.update({
                where: { id: item.productId },
                data: {
                  reservedQuantity: newReserved,
                  ...(prod.quantity === null ? {} : { quantity: newQuantity }),
                  status: getProductStatusFromQuantity(newQuantity),
                },
              });
            } else {
              // Kargolanmamış taraf: normal rezervasyon çözümü.
              await tx.product.update({
                where: { id: item.productId },
                data: {
                  reservedQuantity: newReserved,
                  status:
                    newReserved > 0
                      ? ProductStatus.reserved
                      : ProductStatus.active,
                },
              });
            }
          }

          // Koli taşıyıcıda kayboldu: hiçbir tarafın kusuru yok → iki ödeme de
          // hizmet bedeli ve kargo dahil TAM iade edilir.
          await tx.tradeCashPayment.updateMany({
            where: { tradeId: trade.id, status: PaymentStatus.completed },
            data: { fullRefundEntitled: true },
          });

          await tx.trade.update({
            where: { id: trade.id },
            data: {
              status: TradeStatus.cancelled,
              cancelReason: TRADE_CANCEL_REASON.lostParcel,
              cancelledAt: now,
              // Ücret iadesi koli bedelini kapsamaz ve kaybolan ÜRÜNÜN değeri
              // iade değildir — ops out-of-band tazmin eder (CompensationPanel).
              compensationPendingUserId: [...lostShipperIds][0],
              compensationResolvedAt: null,
            },
          });
          return true;
        });
        if (!claimed) continue;

        await this.paymentService.refundTradeCashTracked(trade.id);
        await this.tradeCommon.invalidateProductCachesForTrade(trade.id);
        await this.tradeShipment.cancelSuratShipmentsForTrade(trade.id);
        resolved++;

        if (this.eventService) {
          try {
            await this.eventService.emitTradeAutoCancelled({
              tradeId: trade.id,
              initiatorId: trade.initiatorId,
              receiverId: trade.receiverId,
              reason: TRADE_CANCEL_REASON.lostParcel,
            });
          } catch (err) {
            this.logger.error(
              `Failed to emit trade.auto-cancelled (lost parcel) for trade ${trade.id}: ${err}`,
            );
          }
        }
        this.logger.warn(
          `Lost-parcel auto-resolve: trade ${trade.tradeNumber} (${trade.id}) cancelled after ${graceDays}d grace; compensation flagged`,
        );
      } catch (error: any) {
        this.logger.error(
          `Lost-parcel auto-resolve failed for trade ${trade.id}: ${error?.message}`,
        );
      }
    }
    return resolved;
  }

  /**
   * O11: shipping_to_warehouse durumundaki ama `to_warehouse` kargo etiketleri OLUŞMAMIŞ
   * takasları bul ve createInboundTradeShipments'i yeniden çağır (idempotent). Post-payment/
   * post-accept fire-and-forget kargo oluşturma hata verirse (para alındı ama etiket yok)
   * güvenilir bir telafi sağlar.
   */
  async reconcileMissingInboundShipments(): Promise<{ fixed: number }> {
    // Eksik bacak TARAF bazında aranır: yalnız "hiç bacağı olmayan" takasları
    // taramak, tek tarafın bacağı eksik kalmış takası (ör. adres sonradan
    // eklendi) sonsuza dek onarımsız bırakıyordu. createInboundTradeShipments
    // taraf bazında idempotenttir: var olan bacağa dokunmaz, eksiği tamamlar;
    // adressiz taraf için günde bir "adres ekle" bildirimi de orada atılır.
    const candidates = await this.prisma.trade.findMany({
      where: { status: TradeStatus.shipping_to_warehouse },
      select: {
        id: true,
        initiatorId: true,
        receiverId: true,
        shipments: {
          where: { leg: "to_warehouse" },
          select: { shipperId: true },
        },
      },
      take: 200,
    });
    const trades = candidates
      .filter((t) => {
        const shippers = new Set(t.shipments.map((s) => s.shipperId));
        return !shippers.has(t.initiatorId) || !shippers.has(t.receiverId);
      })
      .slice(0, 50);

    let fixed = 0;
    for (const t of trades) {
      try {
        await this.tradeShipment.createInboundTradeShipments(t.id);
        fixed++;
      } catch (e: any) {
        this.logger.error(
          `reconcileMissingInboundShipments: takas ${t.id} inbound kargo telafisi başarısız: ${e?.message}`,
        );
      }
    }
    return { fixed };
  }

  /**
   * MONEY-H2: PayTR nakit iadesi başarısız olup `refundFailureReason` marker'ı
   * yazılmış takasları periyodik olarak yeniden dener. cancelTrade / resolveDispute /
   * rejectWarehouseTrade / retryTradeRefund akışlarında iade PayTR'da patlarsa para
   * alıcıda kalır; admin elle müdahale etmese bile bu süpürme onu toparlar.
   * `refundTradeCashTracked` başarıda marker'ı temizler, tekrar patlarsa mesajı
   * tazeler (kalıcı hatada döngü zararsızdır: aynı takas her turda yeniden denenir
   * ama çift-iade guard'ları PayTR'yi bir kez çağırır).
   */
  async retryFailedTradeRefunds(): Promise<{
    retried: number;
    recovered: number;
  }> {
    const stuck = await this.prisma.trade.findMany({
      where: {
        refundFailureReason: { not: null },
        status: {
          in: [
            TradeStatus.cancelled,
            TradeStatus.returning,
            TradeStatus.disputed,
            // compensate_* itiraz çözümü takası COMPLETED bırakır; başarısız
            // tazminat iadesi de marker yazar ve burada toparlanmalıdır.
            // Kapsamsız çağrı completed'da güvenlidir: satır bazlı niyet
            // filtresi (holdReleaseAt=null) yalnız iade borcu satırları görür.
            TradeStatus.completed,
          ],
        },
      },
      select: { id: true },
      take: 50,
    });

    let recovered = 0;
    for (const t of stuck) {
      const res = await this.paymentService.refundTradeCashTracked(t.id);
      // "recovered" = marker artık temizlenmiş demektir (iade yapıldı VEYA iade
      // edilecek tamamlanmış ödeme kalmadı). Yalnız `failed` olanlar marker'da kalır.
      if (!res.failed) recovered++;
    }

    if (stuck.length > 0) {
      this.logger.log(
        `retryFailedTradeRefunds: ${stuck.length} takas denendi, ${recovered} toparlandı`,
      );
    }
    return { retried: stuck.length, recovered };
  }

  /**
   * Auto-confirm receipt for trades stuck in shipping_to_recipients
   * when confirmationDeadline has passed.
   */
  async autoConfirmExpiredReceipts(): Promise<number> {
    const now = new Date();

    const expiredTrades = await this.prisma.trade.findMany({
      where: {
        status: TradeStatus.shipping_to_recipients,
        confirmationDeadline: { lt: now },
      },
      include: {
        shipments: {
          where: { leg: "from_warehouse" },
        },
      },
    });

    let confirmedCount = 0;

    for (const trade of expiredTrades) {
      try {
        await this.prisma.$transaction(async (tx) => {
          await tx.$queryRaw`SELECT id FROM trades WHERE id = ${trade.id} FOR UPDATE`;

          const freshTrade = await tx.trade.findUnique({
            where: { id: trade.id },
            select: { status: true, version: true },
          });
          if (
            !freshTrade ||
            freshTrade.status !== TradeStatus.shipping_to_recipients
          ) {
            return;
          }

          // Auto-confirm all unconfirmed from_warehouse shipments
          const unconfirmedShipments = await tx.tradeShipment.findMany({
            where: {
              tradeId: trade.id,
              leg: "from_warehouse",
              confirmedAt: null,
            },
          });

          for (const shipment of unconfirmedShipments) {
            await tx.tradeShipment.update({
              where: { id: shipment.id },
              data: {
                status: ShipmentStatus.delivered,
                // Onay penceresi ZATEN teslimattan sayıldığı için bacaklar bu
                // noktada teslim edilmiştir; taşıyıcıdan gelen gerçek teslim
                // tarihi otomatik onay anıyla EZİLMEZ.
                ...(shipment.deliveredAt ? {} : { deliveredAt: now }),
                confirmedAt: now,
              },
            });
          }

          // Complete the trade
          await tx.trade.update({
            where: { id: trade.id, version: freshTrade.version },
            data: {
              status: TradeStatus.completed,
              completedAt: now,
              version: { increment: 1 },
            },
          });

          // Decrement product quantities (same as confirmReceipt)
          const allItems = await tx.tradeItem.findMany({
            where: { tradeId: trade.id },
          });
          // #2 (LOST-UPDATE FIX): okumadan ÖNCE ürünleri FOR UPDATE ile (id-sıralı) kilitle →
          // eşzamanlı satış/takas düşümü stale mutlak-set yazamaz; deadlock önlenir.
          const lockIds = [...new Set(allItems.map((i) => i.productId))].sort();
          for (const pid of lockIds) {
            await tx.$queryRaw`SELECT id FROM products WHERE id = ${pid} FOR UPDATE`;
          }
          const products = await tx.product.findMany({
            where: { id: { in: allItems.map((i) => i.productId) } },
          });

          const qtyByProduct = new Map<string, number>();
          for (const item of allItems) {
            qtyByProduct.set(
              item.productId,
              (qtyByProduct.get(item.productId) ?? 0) + item.quantity,
            );
          }

          for (const product of products) {
            const tradedQty = qtyByProduct.get(product.id) ?? 1;
            let newQuantity: number | null;
            if (product.quantity !== null && product.quantity > 0) {
              newQuantity = Math.max(0, product.quantity - tradedQty);
            } else if (product.quantity === null) {
              newQuantity = null;
            } else {
              newQuantity = 0;
            }

            const updateData: any = {
              status: getProductStatusFromQuantity(newQuantity),
              reservedQuantity: safeDecrementReserved(
                product.reservedQuantity,
                tradedQty,
              ),
            };
            if (product.quantity !== null && product.quantity > 0) {
              updateData.quantity = newQuantity;
            }

            await tx.product.update({
              where: { id: product.id },
              data: updateData,
            });
          }

          // Set escrow hold for cash payment
          const cashPayment = await tx.tradeCashPayment.findFirst({
            where: { tradeId: trade.id },
          });
          if (cashPayment && cashPayment.status === PaymentStatus.completed) {
            await tx.tradeCashPayment.updateMany({
              where: { tradeId: trade.id },
              data: { holdReleaseAt: await computeTradeHoldReleaseAt(tx) },
            });
          }
        });

        await this.tradeCommon.invalidateProductCachesForTrade(trade.id);
        confirmedCount++;

        this.logger.log(
          `Auto-confirmed receipt for trade ${trade.id} (confirmationDeadline passed)`,
        );
      } catch (error: any) {
        this.logger.error(
          `Failed to auto-confirm trade ${trade.id}: ${error.message}`,
        );
      }
    }

    if (confirmedCount > 0) {
      this.logger.log(
        `Auto-confirmed ${confirmedCount} expired trade receipt(s)`,
      );
    }
    return confirmedCount;
  }
}
