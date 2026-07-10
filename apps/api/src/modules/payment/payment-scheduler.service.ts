import { Injectable, Logger, Optional, OnModuleInit } from "@nestjs/common";
import { CronExpression } from "@nestjs/schedule";
import { InjectQueue } from "@nestjs/bull";
import { Queue } from "bull";
import { TrackedCron } from "../../monitoring/tracked-cron.decorator";
import {
  moneyCronsViaBull,
  registerRepeatableCron,
} from "../../monitoring/bull-cron.helper";
import { QUEUE_NAMES } from "../../workers/constants";
import { PaymentService } from "./payment.service";
import { ProductLockService } from "../product/product-lock.service";
import { EventService } from "../events/event.service";
import { PayoutService } from "../payout/payout.service";

/**
 * Payment Scheduler Service
 * Automatically cancels expired pending payments and sweeps out-of-stock products.
 */
@Injectable()
export class PaymentSchedulerService implements OnModuleInit {
  private readonly logger = new Logger(PaymentSchedulerService.name);

  constructor(
    private readonly paymentService: PaymentService,
    private readonly productLockService: ProductLockService,
    private readonly eventService: EventService,
    @InjectQueue(QUEUE_NAMES.SCHEDULED) private readonly scheduledQueue: Queue,
    @Optional() private readonly payoutService?: PayoutService,
  ) {}

  async onModuleInit(): Promise<void> {
    const on = moneyCronsViaBull();
    await registerRepeatableCron(
      this.scheduledQueue,
      "payment-expired",
      "*/5 * * * *",
      on,
      this.logger,
    );
    await registerRepeatableCron(
      this.scheduledQueue,
      "payment-release-holds",
      "0 * * * *",
      on,
      this.logger,
    );
    await registerRepeatableCron(
      this.scheduledQueue,
      "payment-expired-preparing",
      "*/30 * * * *",
      on,
      this.logger,
    );
  }

  /**
   * Run every 5 minutes: release expired order reservations, cancel expired
   * payments, then sweep any quantity=0 products to ensure pending offers/trades
   * are cancelled.
   */
  /**
   * Run a single scheduler step in isolation. A failure in one step (ör. eksik
   * migration nedeniyle bir tablo/kolon yoksa) DİĞER adımları bloklamamalı —
   * aksi halde örn. reconcilePendingPaytrPayments patlayınca
   * releaseExpiredOrderReservations hiç çalışmaz ve rezervasyonlar takılı kalır.
   */
  // İzleme: handleExpiredPayments her adımı bu log'a yazar (Bull "Kayıtlar").
  // Bull processor'ı tek tek (concurrency 1) işlediği ve flag açıkken in-process
  // no-op olduğu için instance alanı kullanımı güvenli.
  private stepLog: (msg: string) => void = () => {};

  private async runStep(
    name: string,
    fn: () => Promise<Record<string, number> | void>,
    stats?: Record<string, number>,
  ): Promise<void> {
    try {
      const result = (await fn()) || {};
      if (stats) {
        for (const [k, v] of Object.entries(result)) {
          stats[k] = (stats[k] ?? 0) + v;
        }
      }
      const detail = Object.entries(result)
        .filter(([, v]) => v > 0)
        .map(([k, v]) => `${k}=${v}`)
        .join(" ");
      this.stepLog(`✓ ${name}${detail ? ` (${detail})` : ""}`);
    } catch (error: any) {
      this.logger.error(`Step "${name}" failed: ${error.message}`, error.stack);
      this.stepLog(`✗ ${name}: ${error.message}`);
      // Adım-seviyesi hata → job stats.errors artar → runTrackedJob işi FAILED yapar.
      if (stats) stats.errors = (stats.errors ?? 0) + 1;
    }
  }

  /** Bakım turu stats'ından sıfır-olmayan sayılarla kısa özet üretir (PII YOK). */
  private buildMaintenanceSummary(stats: Record<string, number>): string {
    const parts: string[] = [];
    const push = (label: string, key: string): void => {
      if ((stats[key] ?? 0) > 0) parts.push(`${label}=${stats[key]}`);
    };
    push("paytr", "paytrCompleted");
    push("rezervasyon", "reservationsReleased");
    push("qty-fix", "qtyReconciled");
    push("sipariş-iptal", "ordersExpired");
    push("ödeme-iptal", "paymentsCancelled");
    push("oto-iade", "autoRefunded");
    push("iade-başarısız", "autoRefundFailed");
    push("fatura", "invoicesGenerated");
    push("stok-teklif-iptal", "stockOffersCancelled");
    push("stok-takas-iptal", "stockTradesCancelled");
    if ((stats.errors ?? 0) > 0) parts.push(`ADIM-HATASI=${stats.errors}`);
    return parts.length ? parts.join(" · ") : "yapılacak iş yok (temiz)";
  }

  @TrackedCron("*/5 * * * *") // Every 5 minutes
  async handleExpiredPayments() {
    if (moneyCronsViaBull()) {
      return;
    }
    return this.runHandleExpiredPayments();
  }

  /** Gerçek iş — in-process cron ve Bull processor buradan çağırır. */
  async runHandleExpiredPayments(log: (msg: string) => void = () => {}) {
    this.stepLog = log;
    this.logger.log("Checking for expired reservations and payments...");
    const stats: Record<string, number> = {};

    await this.runStep(
      "reconcile-paytr",
      async () => {
        const r = await this.paymentService.reconcilePendingPaytrPayments();
        return { paytrChecked: r.checked, paytrCompleted: r.completed };
      },
      stats,
    );

    await this.runStep(
      "release-reservations",
      async () => {
        const r = await this.paymentService.releaseExpiredOrderReservations();
        return { reservationsReleased: r.count };
      },
      stats,
    );

    await this.runStep(
      "reconcile-reserved-qty",
      async () => {
        const r = await this.paymentService.reconcileReservedQuantities();
        return { qtyReconciled: r.count };
      },
      stats,
    );

    await this.runStep(
      "expire-unpaid-orders",
      async () => {
        const r = await this.paymentService.expireUnpaidOrders();
        return { ordersExpired: r.count };
      },
      stats,
    );

    await this.runStep(
      "cancel-expired-payments",
      async () => {
        const r = await this.paymentService.cancelExpiredPayments();
        return { paymentsCancelled: r.count };
      },
      stats,
    );

    // K3: Alıcının iptal ettiği (status=refunded) ama henüz iade edilmemiş siparişleri
    // bul ve gerçek PayTR iadesini + hold iptalini tamamla.
    await this.runStep(
      "auto-refund-cancelled",
      async () => {
        const r = await this.paymentService.processRefundedOrders();
        return { autoRefunded: r.refunded, autoRefundFailed: r.failed };
      },
      stats,
    );

    // O6: Ödendi ama faturası oluşmamış siparişleri telafi et (best-effort retry).
    await this.runStep(
      "reconcile-missing-invoices",
      async () => {
        const r = await this.paymentService.reconcileMissingInvoices();
        return { invoicesGenerated: r.generated };
      },
      stats,
    );

    // Güvenlik ağı: stoğu biten ürünleri süpür, asılı teklif/takasları iptal et.
    await this.runStep(
      "sweep-out-of-stock",
      async () => {
        const sweepResult =
          await this.productLockService.sweepOutOfStockProducts();
        // NOT (mükerrer bildirim fix): iptal edilen TEKLİFLER zaten sweep içinde
        // (IN_APP + PUSH) bildiriliyor; burada yalnız TAKAS bildirimi gönderilir
        // (sweep takasları bildirmez). cancelledTrades boşsa döngü hiçbir şey yapmaz.
        const cancelReason = "Stok tükendiği için otomatik iptal edildi";
        for (const trade of sweepResult.cancelledTrades) {
          try {
            await this.eventService.emitTradeAutoCancelled({
              tradeId: trade.tradeId,
              initiatorId: trade.initiatorId,
              receiverId: trade.receiverId,
              reason: cancelReason,
            });
          } catch (err: any) {
            this.logger.error(
              `Failed to notify trade ${trade.tradeId}: ${err.message}`,
            );
          }
        }
        return {
          stockOffersCancelled: sweepResult.offersCancelled,
          stockTradesCancelled: sweepResult.tradesCancelled,
          stockProductsScanned: sweepResult.productsScanned,
        };
      },
      stats,
    );

    this.stepLog = () => {};

    const summary = this.buildMaintenanceSummary(stats);
    this.logger.log(`Süre dolumu bakım turu tamamlandı — ${summary}`);
    return { summary, stats };
  }

  /**
   * Run every hour: release payment holds whose releaseAt date has passed
   */
  @TrackedCron("0 * * * *") // Every hour at minute 0
  async handleReleaseHoldsDue() {
    if (moneyCronsViaBull()) {
      return;
    }
    return this.runHandleReleaseHoldsDue();
  }

  /** Gerçek iş — in-process cron ve Bull processor buradan çağırır. */
  async runHandleReleaseHoldsDue(log: (msg: string) => void = () => {}) {
    this.stepLog = log;
    this.logger.log("Checking for payment holds due for release...");

    let releasedHolds = 0;
    let tradeCash = 0;
    let payoutsCreated = 0;
    const stepStats: Record<string, number> = {};

    await this.runStep(
      "releaseHoldsDue",
      async () => {
        const result = await this.paymentService.releaseHoldsDue();
        releasedHolds = result.count;
        tradeCash = result.tradeCashReleased;
        if (result.count > 0) {
          this.logger.log(`Released ${result.count} payment hold(s)`);
        }
        if (result.tradeCashReleased > 0) {
          this.logger.log(
            `Released ${result.tradeCashReleased} trade cash payment(s)`,
          );
        }
      },
      stepStats,
    );

    // Y2 (payout starvation): Payout oluşturmayı release SONUCUNDAN BAĞIMSIZ her turda
    // çalıştır. Teslimat/48h/manuel gibi başka yollarla released olmuş ama henüz payout'u
    // olmayan hold'lar da yakalanır. createPayoutsForReleasedHolds idempotenttir
    // (payoutTransfer:null filtresi → payout'u olanları atlar), bu yüzden koşulsuz güvenli.
    if (this.payoutService) {
      await this.runStep(
        "createPayoutsForReleasedHolds",
        async () => {
          payoutsCreated =
            await this.payoutService!.createPayoutsForReleasedHolds();
          if (payoutsCreated > 0) {
            this.logger.log(
              `Created ${payoutsCreated} payout transfer(s) for released holds`,
            );
          }
        },
        stepStats,
      );
    }

    this.stepLog = () => {};
    return {
      summary: `${releasedHolds} hold serbest · ${payoutsCreated} payout oluşturuldu`,
      stats: {
        releasedHolds,
        tradeCash,
        payoutsCreated,
        ...(stepStats.errors ? { errors: stepStats.errors } : {}),
      },
    };
  }

  /**
   * Run every 30 minutes: check for orders stuck in "preparing" past deadline.
   * Warns sellers 24h before deadline, auto-cancels + refunds when deadline passes.
   */
  @TrackedCron("*/30 * * * *") // Every 30 minutes
  async handleExpiredPreparingOrders() {
    if (moneyCronsViaBull()) {
      return;
    }
    return this.runHandleExpiredPreparingOrders();
  }

  /** Gerçek iş — in-process cron ve Bull processor buradan çağırır. */
  async runHandleExpiredPreparingOrders(log: (msg: string) => void = () => {}) {
    this.logger.log("Checking for expired preparing orders...");

    try {
      const result = await this.paymentService.handleExpiredPreparingOrders();
      log(
        `${result.warned} satıcı uyarıldı · ${result.cancelled} sipariş oto-iptal`,
      );
      if (result.warned > 0) {
        this.logger.log(
          `Warned ${result.warned} seller(s) about preparing deadline`,
        );
      }
      if (result.cancelled > 0) {
        this.logger.log(
          `Auto-cancelled ${result.cancelled} order(s) past preparing deadline`,
        );
      }
      return {
        summary: `${result.warned} uyarı · ${result.cancelled} oto-iptal`,
        stats: { warned: result.warned, cancelled: result.cancelled },
      };
    } catch (error: any) {
      this.logger.error(
        `Error in expired preparing orders job: ${error.message}`,
        error.stack,
      );
      log(`HATA: ${error.message}`);
      return { summary: `Hata: ${error.message}`, stats: { errors: 1 } };
    }
  }
}
