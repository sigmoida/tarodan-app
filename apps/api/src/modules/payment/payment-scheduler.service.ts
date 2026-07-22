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

  private async runStep(name: string, fn: () => Promise<void>): Promise<void> {
    try {
      await fn();
      this.stepLog(`✓ ${name}`);
    } catch (error: any) {
      this.logger.error(`Step "${name}" failed: ${error.message}`, error.stack);
      this.stepLog(`✗ ${name}: ${error.message}`);
    }
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

    await this.runStep("reconcilePendingPaytrPayments", async () => {
      const reconcile =
        await this.paymentService.reconcilePendingPaytrPayments();
      if (reconcile.completed > 0) {
        this.logger.log(
          `PayTR reconcile: completed ${reconcile.completed} of ${reconcile.checked} checked payment(s)`,
        );
      }
    });

    // FLOW-M3 (2.1): `failed` işaretli ama PayTR'da çekilmiş (orphan capture) ödemeleri
    // yakala → ödenebilirse telafi et, değilse ALARM (manuel iade).
    await this.runStep("detectOrphanCapturedFailedPayments", async () => {
      const orphan =
        await this.paymentService.detectOrphanCapturedFailedPayments();
      if (orphan.recovered > 0 || orphan.alarms > 0) {
        this.logger.warn(
          `PayTR orphan capture: recovered ${orphan.recovered}, review ${orphan.alarms} (checked ${orphan.checked})`,
        );
      }
    });

    await this.runStep("releaseExpiredOrderReservations", async () => {
      const released =
        await this.paymentService.releaseExpiredOrderReservations();
      if (released.count > 0) {
        this.logger.log(
          `Released ${released.count} expired order reservation(s)`,
        );
      }
    });

    await this.runStep("reconcileReservedQuantities", async () => {
      const recon = await this.paymentService.reconcileReservedQuantities();
      if (recon.count > 0) {
        this.logger.log(
          `Reconciled reservedQuantity drift on ${recon.count} product(s)`,
        );
      }
    });

    await this.runStep("expireUnpaidOrders", async () => {
      const expired = await this.paymentService.expireUnpaidOrders();
      if (expired.count > 0) {
        this.logger.log(
          `Expired ${expired.count} unpaid order(s) past 24h TTL`,
        );
      }
    });

    await this.runStep("cancelExpiredPayments", async () => {
      const result = await this.paymentService.cancelExpiredPayments();
      if (result.count > 0) {
        this.logger.log(`Cancelled ${result.count} expired payment(s)`);
      }
    });

    // MONEY-M4: PayTR iadesi yapılıp DB finalize'ı patlayan (refundInProgress marker'ı
    // takılı) siparişleri finalize et — yoksa payment completed kalır, payout çift-kayıp.
    await this.runStep("reconcileStuckRefundMarkers", async () => {
      const stuck = await this.paymentService.reconcileStuckRefundMarkers();
      if (stuck.recovered > 0) {
        this.logger.warn(
          `Stuck refund markers finalized: ${stuck.recovered} of ${stuck.checked}`,
        );
      }
    });

    // K3: Alıcının iptal ettiği (status=refunded) ama henüz iade edilmemiş siparişleri
    // bul ve iadeyi tetikle. OrderService.cancel yalnız status'u refunded yapıyordu;
    // bu adım gerçek PayTR iadesini + hold iptalini güvenilir şekilde tamamlar.
    await this.runStep("processRefundedOrders", async () => {
      const result = await this.paymentService.processRefundedOrders();
      if (result.refunded > 0 || result.failed > 0) {
        this.logger.log(
          `Auto-refund: ${result.refunded} iptal edilen sipariş iade edildi, ${result.failed} başarısız`,
        );
      }
    });

    // O6: Ödendi ama faturası oluşmamış siparişleri telafi et (tx-sonrası best-effort
    // fatura üretimi hata vermişse güvenilir retry).
    await this.runStep("reconcileMissingInvoices", async () => {
      const result = await this.paymentService.reconcileMissingInvoices();
      if (result.generated > 0) {
        this.logger.log(
          `Eksik fatura telafisi: ${result.generated} fatura üretildi`,
        );
      }
    });

    // Safety net: sweep out-of-stock products and cancel lingering offers/trades
    await this.runStep("sweepOutOfStockProducts", async () => {
      const sweepResult =
        await this.productLockService.sweepOutOfStockProducts();
      if (sweepResult.offersCancelled > 0 || sweepResult.tradesCancelled > 0) {
        this.logger.log(
          `Stock sweep: cancelled ${sweepResult.offersCancelled} offer(s) and ${sweepResult.tradesCancelled} trade(s) across ${sweepResult.productsScanned} out-of-stock product(s)`,
        );

        const cancelReason = "Stok tükendiği için otomatik iptal edildi";

        // NOT (mükerrer bildirim fix): İptal edilen TEKLİFLER zaten
        // sweepOutOfStockProducts() içinde notifyOfferCancelledOutOfStock()
        // (IN_APP + PUSH) ile bildiriliyor. Burada ayrıca emitOfferAutoRejected()
        // çağırmak aynı teklif için İKİNCİ bir bildirim üretiyordu (çift). Teklif
        // emit'i kaldırıldı; yalnız TAKAS bildirimi burada gönderiliyor (sweep
        // takasları bildirmez).
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
      }
    });

    this.stepLog = () => {};
    return { summary: "Süre dolumu bakım turu tamamlandı (9 adım)", stats: {} };
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

    await this.runStep("releaseHoldsDue", async () => {
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
    });

    // Y2 (payout starvation): Payout oluşturmayı release SONUCUNDAN BAĞIMSIZ her turda
    // çalıştır. Teslimat/48h/manuel gibi başka yollarla released olmuş ama henüz payout'u
    // olmayan hold'lar da yakalanır. createPayoutsForReleasedHolds idempotenttir
    // (payoutTransfer:null filtresi → payout'u olanları atlar), bu yüzden koşulsuz güvenli.
    if (this.payoutService) {
      await this.runStep("createPayoutsForReleasedHolds", async () => {
        payoutsCreated =
          await this.payoutService!.createPayoutsForReleasedHolds();
        if (payoutsCreated > 0) {
          this.logger.log(
            `Created ${payoutsCreated} payout transfer(s) for released holds`,
          );
        }
      });
    }

    this.stepLog = () => {};
    return {
      summary: `${releasedHolds} hold serbest · ${payoutsCreated} payout oluşturuldu`,
      stats: { releasedHolds, tradeCash, payoutsCreated },
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
