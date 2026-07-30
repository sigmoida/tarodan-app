import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { InjectQueue } from "@nestjs/bull";
import { Queue } from "bull";
import { registerRepeatableCron } from "../../monitoring/bull-cron.helper";
import { QUEUE_NAMES } from "../../workers/constants";
import { ConfigService } from "@nestjs/config";
import { OrderStatus, TradeStatus, PaymentStatus } from "@prisma/client";
import { PrismaService } from "../../prisma";
import { OrderService } from "./order.service";
import { ElogoInvoicingService } from "../elogo/elogo-invoicing.service";

const OPEN_REFUND_STATUSES = [
  "pending_review",
  "approved",
  "wait_for_delivery",
  "return_shipment_open",
  "return_in_transit",
  "return_delivered",
  "disputed",
] as const;

@Injectable()
export class OrderSchedulerService implements OnModuleInit {
  private readonly logger = new Logger(OrderSchedulerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly orderService: OrderService,
    private readonly configService: ConfigService,
    private readonly elogoInvoicing: ElogoInvoicingService,
    @InjectQueue(QUEUE_NAMES.SCHEDULED) private readonly scheduledQueue: Queue,
  ) {}

  async onModuleInit(): Promise<void> {
    await registerRepeatableCron(
      this.scheduledQueue,
      "order-auto-complete",
      "*/10 * * * *",
      this.logger,
    );
    await registerRepeatableCron(
      this.scheduledQueue,
      "process-delivered-orders",
      "*/2 * * * *",
      this.logger,
    );
  }

  /**
   * 48h penceresi dolan siparişleri otomatik tamamla.
   * Spec: Bölüm 6.3.
   * Feature flag korumalı: FEATURE_48H_CONFIRMATION_WINDOW=true gerekli.
   * Gerçek iş — Bull processor 'order-auto-complete' buradan çağırır.
   */
  async runAutoCompleteConfirmedOrders(log: (msg: string) => void = () => {}) {
    if (
      this.configService.get<string>("FEATURE_48H_CONFIRMATION_WINDOW") !==
      "true"
    ) {
      log("FEATURE_48H_CONFIRMATION_WINDOW kapalı, atlandı");
      return { summary: "Özellik kapalı, atlandı", stats: { skipped: 1 } };
    }

    const candidates = await this.prisma.order.findMany({
      where: {
        status: OrderStatus.awaiting_buyer_confirmation,
        confirmationDeadline: { lt: new Date() },
      },
      select: { id: true },
      take: 100,
    });

    if (candidates.length === 0) {
      log("Onay süresi dolmuş sipariş yok");
      return {
        summary: "0 aday sipariş",
        stats: { processed: 0, skipped: 0, failed: 0 },
      };
    }

    let processed = 0;
    let skipped = 0;
    let failed = 0;

    for (const { id } of candidates) {
      try {
        const openRefund = await this.prisma.refundRequest.findFirst({
          where: { orderId: id, status: { in: OPEN_REFUND_STATUSES as any } },
          select: { id: true },
        });
        if (openRefund) {
          skipped++;
          continue;
        }

        const result = await this.orderService.completeOrder(
          id,
          "auto_timeout",
        );
        if (result.completed) processed++;
        else skipped++;
      } catch (e: any) {
        failed++;
        this.logger.error(
          `auto-complete failed for ${id}: ${e?.message}`,
          e?.stack,
        );
      }
    }

    this.logger.log(
      `autoCompleteConfirmedOrders: processed=${processed} skipped=${skipped} failed=${failed} total=${candidates.length}`,
    );
    log(
      `${candidates.length} aday · ${processed} tamamlandı · ${skipped} atlandı · ${failed} başarısız`,
    );
    return {
      summary: `${processed} tamamlandı · ${skipped} atlandı · ${failed} başarısız`,
      stats: { candidates: candidates.length, processed, skipped, failed },
    };
  }

  /**
   * YENİ MODEL (alıcı onayı kaldırıldı): teslim edilen siparişlerde
   *  (1) FATURA TESLİMDE kesilir — henüz e-Arşiv kesilmemiş `delivered` siparişlere teslim faturaları,
   *  (2) TAMAMLANMA iade penceresi kapanınca — teslim + RETURN_WINDOW_DAYS dolan + açık iadesi olmayan
   *      `delivered` siparişler 'completed'e geçer (fatura zaten kesilmiş).
   * Tüm teslim yollarını (webhook + worker) yakalar; idempotent.
   * Gerçek iş — Bull processor 'process-delivered-orders' buradan çağırır.
   */
  /**
   * Faturalama sağlığı alarmları.
   *
   * 1) Uzun süre `shipped`'te takılı siparişler: kargo poll'u teslimatı hiç
   *    raporlamazsa sipariş asla `delivered` olmaz ve faturalama filtresine hiç
   *    girmez → gerçekten teslim edilmiş sipariş faturasız kalır (eskiden bunu
   *    gösteren hiçbir sinyal yoktu; tek kurtarma admin'in elle işaretlemesiydi).
   * 2) Teslim edilmiş olup yasal süre (e-Arşiv 7 gün) içinde faturalanamayanlar.
   */
  async reportInvoiceStaleness(): Promise<{
    stuckShipped: number;
    uninvoicedDelivered: number;
  }> {
    const stuckDays =
      Number(
        this.configService.get<string>("SHIPPED_STALE_ALERT_DAYS") ?? "10",
      ) || 10;
    const invoiceDeadlineDays =
      Number(this.configService.get<string>("INVOICE_DEADLINE_DAYS") ?? "5") ||
      5;

    const [stuckShipped, uninvoicedDelivered] = await Promise.all([
      this.prisma.order.count({
        where: {
          status: OrderStatus.shipped,
          updatedAt: {
            lt: new Date(Date.now() - stuckDays * 24 * 60 * 60 * 1000),
          },
        },
      }),
      this.prisma.order.count({
        where: {
          status: { in: [OrderStatus.delivered, OrderStatus.completed] },
          commissionLedger: { isNot: null },
          revenueInvoicedAt: null,
          deliveredAt: {
            lt: new Date(
              Date.now() - invoiceDeadlineDays * 24 * 60 * 60 * 1000,
            ),
          },
        },
      }),
    ]);

    if (stuckShipped > 0) {
      this.logger.error(
        `ORDERS_STUCK_SHIPPED count=${stuckShipped} — ${stuckDays} günden uzun süre kargoda; teslimat poll'lanmadıysa fatura hiç kesilmez`,
      );
    }
    if (uninvoicedDelivered > 0) {
      this.logger.error(
        `ORDERS_DELIVERED_UNINVOICED count=${uninvoicedDelivered} — teslimden ${invoiceDeadlineDays} günden uzun süre geçti, gelir faturası hâlâ kesilmedi (e-Arşiv süresi riski)`,
      );
    }
    return { stuckShipped, uninvoicedDelivered };
  }

  async runProcessDeliveredOrders(log: (msg: string) => void = () => {}) {
    // 1) Faturası kesilmemiş teslim EDİLMİŞ veya TAMAMLANMIŞ siparişler → teslim faturalarını kes.
    // NOT: deliveredAt bazı teslim yollarında NULL kalabiliyor + sipariş hızla `completed`'e
    // geçebiliyor → deliveredAt şartı VE sadece-delivered filtresi bu siparişleri kaçırıyordu.
    // "Fatura kesilmeden tamamlanmış" durumları da bu backfill yakalar (idempotent).
    // commissionLedger: isNot null → yalnız GERÇEK ürün siparişleri (ödeme anında ledger oluşur:
    // komisyon+hizmet bedeli+platform satış). Ledger'sız seed/sanal siparişler fatura üretmez →
    // her turda boşa yeniden işlenip yanıltıcı "yeniFatura" sayacı üretiyorlardı; onları eleriz.
    const delivered = await this.prisma.order.findMany({
      where: {
        status: { in: [OrderStatus.delivered, OrderStatus.completed] },
        commissionLedger: { isNot: null },
        // AÇIK işaret: faturası kesilmiş siparişler aday kümesinden ÇIKAR. Eskiden
        // filtre yoktu; tamamlanan siparişler kümede kaldığı için sırasız take:500
        // penceresi 500 sipariş sonrası YENİ teslimatları dışarıda bırakabiliyordu
        // (fatura 14 gün gecikiyor veya hiç kesilmiyor).
        revenueInvoicedAt: null,
      },
      // En yeni teslimat önce: 7 günlük e-Arşiv penceresi olan siparişler beklemez.
      orderBy: [{ deliveredAt: "desc" }, { updatedAt: "desc" }],
      select: {
        id: true,
        commissionLedger: {
          select: { buyerFee: true, sellerCommission: true },
        },
        seller: { select: { sellerType: true } },
      },
      take: 500,
    });
    let invoiced = 0;
    if (delivered.length > 0) {
      const invSources = await this.prisma.elogoInvoice.findMany({
        where: {
          sourceId: { in: delivered.map((o) => o.id) },
          type: { in: ["commission", "service_fee", "platform_sale"] as any },
        },
        select: { sourceId: true, type: true },
      });
      const invoicedKeys = new Set(
        invSources.map((i) => `${i.sourceId}:${i.type}`),
      );
      for (const o of delivered) {
        const expectedTypes =
          o.seller.sellerType === "platform"
            ? ["platform_sale"]
            : [
                ...(Number(o.commissionLedger?.sellerCommission) > 0
                  ? ["commission"]
                  : []),
                ...(Number(o.commissionLedger?.buyerFee) > 0
                  ? ["service_fee"]
                  : []),
              ];
        if (
          expectedTypes.every((type) => invoicedKeys.has(`${o.id}:${type}`))
        ) {
          continue;
        }
        try {
          await this.orderService.emitDeliveryRevenueInvoices(o.id);
          invoiced++;
        } catch (e: any) {
          this.logger.warn(
            `processDeliveredOrders fatura hatası ${o.id}: ${e?.message}`,
          );
        }
      }
    }

    // 2) İade penceresi kapanan teslim edilmiş siparişler → tamamlandı
    const returnWindowDays =
      Number(this.configService.get<string>("RETURN_WINDOW_DAYS") ?? "14") ||
      14;
    const cutoff = new Date(
      Date.now() - returnWindowDays * 24 * 60 * 60 * 1000,
    );
    const dueToComplete = await this.prisma.order.findMany({
      where: {
        status: OrderStatus.delivered,
        deliveredAt: { lte: cutoff },
        refundRequests: {
          none: { status: { in: OPEN_REFUND_STATUSES as any } },
        },
      },
      select: { id: true },
      take: 200,
    });
    let completed = 0;
    for (const o of dueToComplete) {
      try {
        const r = await this.orderService.autoCompleteDeliveredOrder(o.id);
        if (r.completed) completed++;
      } catch (e: any) {
        this.logger.warn(
          `processDeliveredOrders tamamlama hatası ${o.id}: ${e?.message}`,
        );
      }
    }

    // 3) TAKAS KOMİSYONU: ürünler DEPOYA varmış (at_warehouse+) + nakit ödemesi tamamlanmış
    // takasların komisyon e-Arşivi faturasızsa kes. Tüm at_warehouse yollarını (admin
    // mark-warehouse-received + Sürat sync) yakalar; idempotent (sourceId=tradeCashPayment.id).
    const paidWarehouseTcps = await this.prisma.tradeCashPayment.findMany({
      where: {
        status: PaymentStatus.completed,
        trade: {
          status: {
            in: [
              TradeStatus.at_warehouse,
              TradeStatus.shipping_to_recipients,
              TradeStatus.completed,
            ],
          },
        },
      },
      select: { id: true },
      // Sipariş tarafıyla aynı gerekçe: tamamlanan takaslar aday kümesinden hiç
      // çıkmadığı için sırasız pencere yeni takasları dışarıda bırakabiliyordu.
      orderBy: { updatedAt: "desc" },
      take: 200,
    });
    let tradeInvoiced = 0;
    if (paidWarehouseTcps.length > 0) {
      const invoicedTcp = new Set(
        (
          await this.prisma.elogoInvoice.findMany({
            where: {
              sourceId: { in: paidWarehouseTcps.map((c) => c.id) },
              type: "trade_commission" as any,
            },
            select: { sourceId: true },
          })
        ).map((i) => i.sourceId),
      );
      for (const c of paidWarehouseTcps) {
        if (invoicedTcp.has(c.id)) continue;
        try {
          await this.elogoInvoicing.issueTradeCashCommissionInvoice(c.id);
          tradeInvoiced++;
        } catch (e: any) {
          this.logger.warn(
            `processDeliveredOrders takas komisyonu hatası ${c.id}: ${e?.message}`,
          );
        }
      }
    }

    // Faturalama sağlığı: takılı kargo + süresi geçmiş faturasız teslimat alarmları.
    const staleness = await this.reportInvoiceStaleness();

    this.logger.log(
      `processDeliveredOrders: teslim=${delivered.length} yeniFatura=${invoiced} tamamlanan=${completed} takasFatura=${tradeInvoiced} takılıKargo=${staleness.stuckShipped} faturasız=${staleness.uninvoicedDelivered} (returnWindow=${returnWindowDays}g)`,
    );
    log(
      `${delivered.length} teslim · ${invoiced} yeni fatura · ${completed} tamamlandı · ${tradeInvoiced} takas faturası`,
    );
    return {
      stats: {
        delivered: delivered.length,
        invoiced,
        completed,
        tradeInvoiced,
      },
    };
  }
}
