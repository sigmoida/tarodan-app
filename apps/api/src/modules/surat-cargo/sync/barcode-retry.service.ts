import { Injectable, Logger } from "@nestjs/common";
import { ModuleRef } from "@nestjs/core";
import { CacheService } from "../../cache/cache.service";
import { PrismaService } from "../../../prisma";
import { Prisma, ShipmentStatus, OrderStatus } from "@prisma/client";
import { CronStepFailuresError } from "../../../monitoring/cron-step-runner";
import { OrderShipmentProvisioner } from "./order-shipment-provisioner.service";
import { notifyUser } from "./surat-tracking-support";

/** Kargo kodu (barkod) retry job istatistiği — yüzey başına. */
export interface BarcodeRetryStat {
  /** Bu tick'te kodu başarıyla tamamlanan kayıt sayısı. */
  retried: number;
  /** Denenip yine kod alamayan kayıt sayısı (geçici/kalıcı hata). */
  failed: number;
}

/**
 * BarcodeRetryService (Faz 11.3a): taşıyıcı ön kaydı tamamlanamamış `pending`
 * order/trade kayıtları için resmi gönderi oluşturmayı yaş-filtreli + üstel
 * backoff'lu yeniden dener; pencereden düşenleri alarmlar. `label_created` ve
 * providerTrackingId NULL ise bu normal şube-kabul bekleyişidir; takip poller'ı
 * gerçek KargoTakipNo'yu daha sonra doldurur.
 */
@Injectable()
export class BarcodeRetryService {
  private readonly logger = new Logger(BarcodeRetryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly moduleRef: ModuleRef,
    private readonly cache: CacheService,
    private readonly orderShipments: OrderShipmentProvisioner,
  ) {}

  // ─── Kargo kodu (barkod) retry job ────────────────────────────────────────
  // İlk create+tracking akışı NON-BLOCKING'tir: Sürat timeout'u veya takip
  // entegrasyonun o an kapalı olması ya da geçici hata yüzünden kayıt kodsuz
  // kaydının gecikmesi nedeniyle kayıt kodsuz (providerTrackingId NULL) kalabilir.
  // Bu iş aynı resmi oluşturma+takip akışını güvenle yeniden dener.
  //
  // Idempotency anahtarı ilk oluşturmayla AYNI (OzelKargoTakipNo bazlı) → retry
  // Sürat'ta mükerrer gönderi oluşturmaz; ilk başarıdan sonra cache'ten döner.
  // Aday şartı hep providerTrackingId IS NULL olduğundan kodu olan kayıt hiç
  // aday olmaz (başarılı kayda ikinci kez dokunulmaz).

  /** Çok yeni kaydı deneme: ilk senkron denemesi henüz bitti, anlık yarış/timeout
   * kendiliğinden düzelebilir. */
  private static readonly RETRY_MIN_AGE_MS = 5 * 60 * 1000; // 5 dk
  /** Bu kadar süredir kod alamayan kayıt geçici değil yapısal hatalıdır (bozuk
   * adres vb.). Sonsuz denemeyi bırak → admin müdahalesine düş. */
  private static readonly RETRY_MAX_AGE_MS = 48 * 60 * 60 * 1000; // 48 s
  /** API'yi boğmamak için tick başına yüzey başına üst sınır; kalanı sonraki tick. */
  private static readonly RETRY_BATCH = 25;
  /** M2: başarısız denemede üstel geri çekilme — taban bir tick (30 dk), tavan 8 s.
   * Kalıcı hatalı kayıt (bozuk adres vb.) böylece 48 saatte ~96 değil ~8-10 kez
   * denenir. Sayaç cache'te tutulur (migration yok); cache uçarsa backoff sıfırlanır
   * — kabul edilebilir, yalnız birkaç fazladan deneme demek. */
  private static readonly RETRY_BACKOFF_BASE_MS = 30 * 60 * 1000;
  private static readonly RETRY_BACKOFF_MAX_MS = 8 * 60 * 60 * 1000;

  private backoffKey(surface: string, id: string): string {
    return `surat:retry:backoff:${surface}:${id}`;
  }

  private attemptsKey(surface: string, id: string): string {
    return `surat:retry:attempts:${surface}:${id}`;
  }

  /** true → kayıt backoff penceresinde, bu tick atla (failed SAYILMAZ). */
  private async inRetryBackoff(surface: string, id: string): Promise<boolean> {
    return (await this.cache.get(this.backoffKey(surface, id))) != null;
  }

  /** Başarısız denemede sayacı artırıp üstel TTL'li backoff penceresi açar.
   * Sayaç pencereden UZUN yaşar (3 gün) ki pencere kapanınca üstel büyüme
   * sıfırlanmasın. */
  private async recordRetryFailure(surface: string, id: string): Promise<void> {
    const attempts =
      ((await this.cache.get<number>(this.attemptsKey(surface, id))) ?? 0) + 1;
    await this.cache.set(this.attemptsKey(surface, id), attempts, {
      ttl: 3 * 24 * 3600,
    });
    const delayMs = Math.min(
      BarcodeRetryService.RETRY_BACKOFF_BASE_MS * 2 ** (attempts - 1),
      BarcodeRetryService.RETRY_BACKOFF_MAX_MS,
    );
    await this.cache.set(this.backoffKey(surface, id), attempts, {
      ttl: Math.max(60, Math.floor(delayMs / 1000)),
    });
  }

  /** Başarıda backoff izlerini temizle. */
  private async clearRetryBackoff(surface: string, id: string): Promise<void> {
    await this.cache.del(this.backoffKey(surface, id));
    await this.cache.del(this.attemptsKey(surface, id));
  }

  /**
   * Kodsuz kalmış (providerTrackingId NULL) order/trade kayıtları için barkod
   * oluşturmayı yaş-filtreli olarak yeniden dener. Scheduler'dan periyodik
   * çağrılır. Her yüzey bağımsız — biri patlarsa diğeri devam eder.
   *
   * NOT (M4): refund iade barkodu için yüzey YOK — openReturnShipment blocking
   * olduğundan (başarısızsa throw, hiçbir şey yazmaz) "surat + kodsuz" aday
   * durumu oluşamaz; kurtarma refund-scheduler'ın 10-dk tam-açılış retry'ıdır.
   */
  async retryPendingBarcodes(): Promise<{
    order: BarcodeRetryStat;
    trade: BarcodeRetryStat;
  }> {
    const now = Date.now();
    // Aday penceresi:  (now - MAX)  <  createdAt  <  (now - MIN)
    const createdBefore = new Date(now - BarcodeRetryService.RETRY_MIN_AGE_MS);
    const createdAfter = new Date(now - BarcodeRetryService.RETRY_MAX_AGE_MS);

    const empty: BarcodeRetryStat = { retried: 0, failed: 0 };
    let order = empty;
    let trade = empty;
    const failedSteps: string[] = [];
    const failureDetails: string[] = [];

    try {
      order = await this.retryPendingOrderBarcodes(createdAfter, createdBefore);
    } catch (e: any) {
      this.logger.error(`Order barcode retry failed: ${e?.message}`);
      failedSteps.push("order-barcode-retry");
      failureDetails.push(`order-barcode-retry: ${e?.message ?? e}`);
    }
    try {
      trade = await this.retryPendingTradeBarcodes(createdAfter, createdBefore);
    } catch (e: any) {
      this.logger.error(`Trade barcode retry failed: ${e?.message}`);
      failedSteps.push("trade-barcode-retry");
      failureDetails.push(`trade-barcode-retry: ${e?.message ?? e}`);
    }

    // M2: pencereden kodsuz düşen kayıtlar sessizce kaybolmasın.
    try {
      await this.alertAgedOutBarcodes(createdAfter);
    } catch (e: any) {
      this.logger.error(`Barcode age-out alert failed: ${e?.message}`);
      failedSteps.push("barcode-ageout-alert");
      failureDetails.push(`barcode-ageout-alert: ${e?.message ?? e}`);
    }

    if (failedSteps.length > 0) {
      throw new CronStepFailuresError(failedSteps, failureDetails);
    }
    return { order, trade };
  }

  /**
   * M2: 48 saat penceresinden hâlâ kodsuz düşen kayıtlar için kayıt başına BİR
   * kez (cache dedupe, 7 gün) ERROR seviyesinde alarm logla — log-tabanlı uyarı
   * altyapısı bu satırı yakalar; bu noktadan sonrası manuel müdahaledir.
   */
  private async alertAgedOutBarcodes(createdAfter: Date): Promise<void> {
    // Tarama alt sınırı: 7 günden eski kayıtlar zaten alarmlandı/koptu.
    const oldest = new Date(Date.now() - 7 * 24 * 3600 * 1000);

    const agedShipments = await this.prisma.shipment.findMany({
      where: {
        provider: "surat",
        providerTrackingId: null,
        status: ShipmentStatus.pending,
        createdAt: { lt: createdAfter, gte: oldest },
        order: { status: { in: [OrderStatus.paid, OrderStatus.preparing] } },
      },
      select: { id: true, trackingNumber: true },
      take: 50,
    });
    for (const s of agedShipments) {
      const key = `surat:retry:ageout:shipment:${s.id}`;
      if (await this.cache.get(key)) continue;
      await this.cache.set(key, 1, { ttl: 7 * 24 * 3600 });
      this.logger.error(
        `BARCODE AGE-OUT: order shipment ${s.id} (oid=${s.trackingNumber}) left the 48h retry window with NO cargo code — manual intervention required`,
      );
    }

    // Fulfillment finalizer kargo satırını persist edemeden çökerse outbox ve
    // 48 saatlik orphan retry bunu toparlar. Pencere yine de kaçırılırsa Shipment
    // satırı olmadığı için yukarıdaki alarm göremezdi; ödenmiş sipariş sessizce
    // kalıcı olarak kargosuz kalmasın.
    const agedOrphanOrders = await this.prisma.order.findMany({
      where: {
        status: { in: [OrderStatus.paid, OrderStatus.preparing] },
        updatedAt: { lt: createdAfter, gte: oldest },
        OR: [
          { shipment: null },
          { shipment: { status: ShipmentStatus.cancelled } },
        ],
        NOT: [
          { productId: { startsWith: "membership-" } },
          { productId: { startsWith: "boost-" } },
        ],
      },
      select: { id: true, orderNumber: true },
      take: 50,
    });
    for (const order of agedOrphanOrders) {
      const key = `surat:retry:ageout:order:${order.id}`;
      if (await this.cache.get(key)) continue;
      await this.cache.set(key, 1, { ttl: 7 * 24 * 3600 });
      this.logger.error(
        `BARCODE AGE-OUT: paid order ${order.orderNumber} (${order.id}) left the 48h retry window with NO active shipment row — manual intervention required`,
      );
    }

    const agedTradeLegs = await this.prisma.tradeShipment.findMany({
      where: {
        providerTrackingId: null,
        status: ShipmentStatus.pending,
        createdAt: { lt: createdAfter, gte: oldest },
        OR: [{ carrier: "surat" }, { leg: "return", carrier: "pending" }],
      },
      select: { id: true, leg: true, trackingNumber: true, tradeId: true },
      take: 50,
    });
    for (const t of agedTradeLegs) {
      const key = `surat:retry:ageout:trade:${t.id}`;
      if (await this.cache.get(key)) continue;
      await this.cache.set(key, 1, { ttl: 7 * 24 * 3600 });
      this.logger.error(
        `BARCODE AGE-OUT: trade ${t.leg} shipment ${t.id} (trade=${t.tradeId}, oid=${t.trackingNumber ?? "DRAFT"}) left the 48h retry window with NO cargo code — manual intervention required`,
      );
    }
  }

  /** Order Shipment kodsuzları — kanonik OrderShipmentProvisioner'ı yeniden
   * kullanır (payload/idempotency birebir aynı). Ayrıca M1/H4: shipment satırı
   * hiç oluşmamış (Sürat OK ama lokal create patladı) veya iptal sonrası yeniden
   * ödemede `cancelled` kalmış CANLI siparişleri aynı provisioner ile
   * onarır. */
  private async retryPendingOrderBarcodes(
    createdAfter: Date,
    createdBefore: Date,
  ): Promise<BarcodeRetryStat> {
    const codelessWhere: Prisma.ShipmentWhereInput = {
      provider: "surat",
      providerTrackingId: null,
      status: ShipmentStatus.pending,
      trackingNumber: { not: null },
      createdAt: { gte: createdAfter, lte: createdBefore },
      // Siparişi hâlâ canlı olanlar; iptal/teslim/iade akışına düşmüş sipariş
      // için kod üretmenin anlamı yok.
      order: { status: { in: [OrderStatus.paid, OrderStatus.preparing] } },
    };
    const candidates = await this.prisma.shipment.findMany({
      where: codelessWhere,
      select: {
        id: true,
        orderId: true,
        trackingNumber: true,
        order: { select: { orderNumber: true, sellerId: true } },
      },
      take: BarcodeRetryService.RETRY_BATCH,
    });

    // M1/H4: satırsız veya `cancelled` satırlı canlı siparişler. Yaş penceresi
    // updatedAt üzerinden: yeniden ödeme updatedAt'i taşıdığı için deploy öncesi
    // takılmış siparişler de pencereye girer. Sanal siparişler (membership/boost)
    // kargo taşımaz — dışla.
    const orphanWhere: Prisma.OrderWhereInput = {
      status: { in: [OrderStatus.paid, OrderStatus.preparing] },
      updatedAt: { gte: createdAfter, lte: createdBefore },
      OR: [
        { shipment: null },
        { shipment: { status: ShipmentStatus.cancelled } },
      ],
      NOT: [
        { productId: { startsWith: "membership-" } },
        { productId: { startsWith: "boost-" } },
      ],
    };
    const orphanOrders = await this.prisma.order.findMany({
      where: orphanWhere,
      select: { id: true, orderNumber: true, sellerId: true },
      take: BarcodeRetryService.RETRY_BATCH,
    });

    // L8: batch dolduysa toplamı say — büyük yığın sessizce görünmez kalmasın.
    if (candidates.length === BarcodeRetryService.RETRY_BATCH) {
      const total = await this.prisma.shipment.count({ where: codelessWhere });
      if (total > BarcodeRetryService.RETRY_BATCH) {
        this.logger.warn(
          `Barcode retry backlog: ${total} code-less order shipments in window (processing ${BarcodeRetryService.RETRY_BATCH}/tick)`,
        );
      }
    }
    if (orphanOrders.length === BarcodeRetryService.RETRY_BATCH) {
      const total = await this.prisma.order.count({ where: orphanWhere });
      if (total > BarcodeRetryService.RETRY_BATCH) {
        this.logger.warn(
          `Barcode retry backlog: ${total} orphan orders (no/cancelled shipment) in window (processing ${BarcodeRetryService.RETRY_BATCH}/tick)`,
        );
      }
    }

    if (candidates.length === 0 && orphanOrders.length === 0) {
      return { retried: 0, failed: 0 };
    }

    let retried = 0;
    let failed = 0;

    // Önce onarım: satırı oluştur/revive et (kod da mümkünse hemen dolar; barkod
    // yine üretilemezse satır `pending`+kodsuz kalır ve aşağıdaki yüzey sonraki
    // tick'te tamamlar).
    for (const o of orphanOrders) {
      if (await this.inRetryBackoff("order-orphan", o.id)) continue;
      try {
        const res = await this.orderShipments.ensure(o.id);
        if (res === "created" || res === "revived") {
          const persisted = await this.prisma.shipment.findFirst({
            where: { orderId: o.id, provider: "surat" },
            select: { providerTrackingId: true, status: true },
          });
          if (persisted?.status === ShipmentStatus.label_created) {
            retried++;
            await this.clearRetryBackoff("order-orphan", o.id);
            this.logger.log(
              `Retry OK: shipment ${res} and registered with carrier for order ${o.orderNumber}`,
            );
            // Ekran "kargo kodu oluşturuluyor, hazır olunca bildireceğiz" diye
            // söz veriyor — kod dolduğunda sözü burada tutuyoruz.
            if (persisted.providerTrackingId) {
              await notifyUser(
                this.moduleRef,
                this.logger,
                o.sellerId,
                "CARGO_CODE_READY",
                { orderId: o.id, reference: o.orderNumber },
              );
            }
          } else {
            failed++;
            this.logger.warn(
              `Retry created shipment row but carrier registration is still pending for order ${o.orderNumber}`,
            );
          }
        } else if (res === "skipped") {
          failed++;
          await this.recordRetryFailure("order-orphan", o.id);
        }
        // "exists": eşzamanlı onarımla yarıştık — no-op, sayma.
      } catch (e: any) {
        failed++;
        await this.recordRetryFailure("order-orphan", o.id);
        this.logger.error(
          `Retry ensure-shipment threw order=${o.orderNumber}: ${e?.message}`,
        );
      }
    }
    for (const s of candidates) {
      if (await this.inRetryBackoff("order", s.id)) continue;
      try {
        const barcode = await this.orderShipments.createBarcode(
          s.orderId,
          // Revive edilmiş shipment yeni bir -R… referansı taşır. Retry'nin
          // packageNumber'a dönüp iptal edilmiş eski gönderiyi açmasını engelle.
          s.trackingNumber ?? undefined,
        );
        if (barcode) {
          await this.prisma.shipment.update({
            where: { id: s.id },
            data: {
              providerTrackingId: barcode.kargoTakipNo,
              labelZpl: barcode.labelZpl ?? null,
              status: ShipmentStatus.label_created,
            },
          });
          retried++;
          await this.clearRetryBackoff("order", s.id);
          this.logger.log(
            `Retry OK: order registered shipment=${s.id} oid=${s.trackingNumber} code=${barcode.kargoTakipNo ?? "pending-carrier-acceptance"}`,
          );
          // Kod gerçekten dolduysa gönderene haber ver (T2'nin vaadi). Taşıyıcı
          // kabulü hâlâ beklemedeyse kod yok demektir; bildirim gönderilmez.
          if (barcode.kargoTakipNo && s.order?.sellerId) {
            await notifyUser(
              this.moduleRef,
              this.logger,
              s.order.sellerId,
              "CARGO_CODE_READY",
              { orderId: s.orderId, reference: s.order.orderNumber },
            );
          }
        } else {
          failed++;
          await this.recordRetryFailure("order", s.id);
        }
      } catch (e: any) {
        failed++;
        await this.recordRetryFailure("order", s.id);
        this.logger.error(
          `Retry order barcode threw shipment=${s.id}: ${e?.message}`,
        );
      }
    }
    return { retried, failed };
  }

  /** Takas bacakları kodsuzları: depoya-giriş (to_warehouse) bacaklarını
   * TradeShipmentService, iade (return: reject RET-INI/REC + stuck RET-STK
   * DRAFT'ları) bacaklarını AdminTradeWarehouseService kendi payload
   * builder'larıyla yeniden dener. (H3: return DRAFT'ları önceden hiçbir
   * otomatik mekanizmanın kapsamında değildi.) */
  private async retryPendingTradeBarcodes(
    createdAfter: Date,
    createdBefore: Date,
  ): Promise<BarcodeRetryStat> {
    const inboundWhere: Prisma.TradeShipmentWhereInput = {
      carrier: "surat",
      providerTrackingId: null,
      leg: "to_warehouse",
      status: ShipmentStatus.pending,
      trackingNumber: { not: null },
      fromAddressId: { not: null },
      createdAt: { gte: createdAfter, lte: createdBefore },
    };
    const inbound = await this.prisma.tradeShipment.findMany({
      where: inboundWhere,
      select: { id: true },
      take: BarcodeRetryService.RETRY_BATCH,
    });

    // Return DRAFT'ları: carrier "pending" (hiç submit olmamış) veya "surat" +
    // kodsuz (submit sonrası persist patlamış). Manuel fallback ("Tarodan
    // Warehouse") bilinçli — sorguya girmez.
    const returnWhere: Prisma.TradeShipmentWhereInput = {
      leg: "return",
      providerTrackingId: null,
      carrier: { in: ["pending", "surat"] },
      status: ShipmentStatus.pending,
      createdAt: { gte: createdAfter, lte: createdBefore },
    };
    const returns = await this.prisma.tradeShipment.findMany({
      where: returnWhere,
      select: { id: true },
      take: BarcodeRetryService.RETRY_BATCH,
    });

    // L8: batch dolduysa toplamı say — yığın görünür olsun.
    for (const [label, where, fetched] of [
      ["inbound", inboundWhere, inbound.length],
      ["return", returnWhere, returns.length],
    ] as const) {
      if (fetched === BarcodeRetryService.RETRY_BATCH) {
        const total = await this.prisma.tradeShipment.count({ where });
        if (total > BarcodeRetryService.RETRY_BATCH) {
          this.logger.warn(
            `Barcode retry backlog: ${total} code-less trade ${label} legs in window (processing ${BarcodeRetryService.RETRY_BATCH}/tick)`,
          );
        }
      }
    }

    if (inbound.length === 0 && returns.length === 0) {
      return { retried: 0, failed: 0 };
    }

    let retried = 0;
    let failed = 0;

    if (inbound.length > 0) {
      const { TradeShipmentService } =
        await import("../../trade/lifecycle/trade-shipment.service");
      const svc = this.moduleRef.get(TradeShipmentService, { strict: false });
      if (!svc) {
        this.logger.warn(
          `TradeShipmentService not resolvable; skipping ${inbound.length} trade inbound barcode retries`,
        );
        failed += inbound.length;
      } else {
        for (const ts of inbound) {
          if (await this.inRetryBackoff("trade-inbound", ts.id)) continue;
          try {
            const ok = await svc.retryInboundBarcode(ts.id);
            if (ok) {
              retried++;
              await this.clearRetryBackoff("trade-inbound", ts.id);
            } else {
              failed++;
              await this.recordRetryFailure("trade-inbound", ts.id);
            }
          } catch (e: any) {
            failed++;
            await this.recordRetryFailure("trade-inbound", ts.id);
            this.logger.error(
              `Retry trade barcode threw trade-shipment=${ts.id}: ${e?.message}`,
            );
          }
        }
      }
    }

    if (returns.length > 0) {
      const { AdminTradeWarehouseService } =
        await import("../../admin/trade/admin-trade-warehouse.service");
      const warehouseSvc = this.moduleRef.get(AdminTradeWarehouseService, {
        strict: false,
      });
      if (!warehouseSvc) {
        this.logger.warn(
          `AdminTradeWarehouseService not resolvable; skipping ${returns.length} trade return barcode retries`,
        );
        failed += returns.length;
      } else {
        for (const ts of returns) {
          if (await this.inRetryBackoff("trade-return", ts.id)) continue;
          try {
            const ok = await warehouseSvc.retryReturnBarcode(ts.id);
            if (ok) {
              retried++;
              await this.clearRetryBackoff("trade-return", ts.id);
            } else {
              failed++;
              await this.recordRetryFailure("trade-return", ts.id);
            }
          } catch (e: any) {
            failed++;
            await this.recordRetryFailure("trade-return", ts.id);
            this.logger.error(
              `Retry trade return barcode threw trade-shipment=${ts.id}: ${e?.message}`,
            );
          }
        }
      }
    }

    return { retried, failed };
  }
}
