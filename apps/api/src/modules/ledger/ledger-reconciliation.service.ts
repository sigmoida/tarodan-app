import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectQueue } from "@nestjs/bull";
import { Queue } from "bull";
import { PrismaService } from "../../prisma";
import { PaymentStatus, LedgerDirection } from "@prisma/client";
import { TrackedCron } from "../../monitoring/tracked-cron.decorator";
import {
  moneyCronsViaBull,
  registerRepeatableCron,
} from "../../monitoring/bull-cron.helper";
import { QUEUE_NAMES } from "../../workers/constants";
import { LedgerBalanceService } from "./ledger-balance.service";

const EPSILON = 0.01;

export interface ReconciliationReport {
  ledgerGroupsChecked: number;
  unbalancedGroups: number;
  overRefundedPayments: number;
  /** Faz 6.3: defterden türetilen (Payment metadata'sından DEĞİL) sipariş-bazlı fazla-iade. */
  overRefundedOrders: number;
  driftAlarms: string[];
}

/**
 * LedgerReconciliationService (Faz 6.5) — GÜNLÜK drift denetimi. Yalnız OKUR (para
 * hareketi yok). Sert invaryantları kontrol eder ve ihlalde greplenebilir ALARM basar:
 *
 *  1) Defter dengesi: her entryGroupId'nin signed toplamı 0 olmalı (LedgerService
 *     yazımda zorlar; ihlal = bozulma/kısmi yazım → alarm).
 *  2) Fazla-iade: bir ödemenin refundedOrders toplamı ödeme tutarını AŞMAMALI.
 *
 * Not: "ledger vs Payment/Hold/Payout vs PSP" tam mutabakatı, para akışları deftere
 * TAŞININCA (6.3) sertleşir; bu pass sert-hesaplanabilir invaryantlarla başlar.
 */
@Injectable()
export class LedgerReconciliationService implements OnModuleInit {
  private readonly logger = new Logger(LedgerReconciliationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    @InjectQueue(QUEUE_NAMES.SCHEDULED) private readonly scheduledQueue: Queue,
  ) {}

  async onModuleInit(): Promise<void> {
    // Faz 7: MONEY_CRONS_VIA_BULL=true iken Bull repeatable 'ledger-reconcile' çalışır.
    await registerRepeatableCron(
      this.scheduledQueue,
      "ledger-reconcile",
      "0 4 * * *",
      moneyCronsViaBull(),
      this.logger,
    );
  }

  private get windowDays(): number {
    return parseInt(this.config.get("LEDGER_RECONCILE_WINDOW_DAYS") || "2", 10);
  }

  @TrackedCron("0 4 * * *")
  async handleReconcile() {
    if (moneyCronsViaBull()) {
      return;
    }
    return this.reconcile();
  }

  /** Gerçek iş — in-process cron ve (Faz 7) Bull processor buradan çağırır. */
  async reconcile(
    log: (msg: string) => void = () => {},
  ): Promise<ReconciliationReport> {
    const since = new Date();
    since.setDate(since.getDate() - this.windowDays);
    const driftAlarms: string[] = [];

    // 1) Defter dengesi — son penceredeki tüm gruplar signed toplamı 0 mı?
    //    (account + orderId de çekilir: 3. invaryant defter-native fazla-iade için.)
    const entries = await this.prisma.ledgerEntry.findMany({
      where: { createdAt: { gte: since } },
      select: {
        entryGroupId: true,
        direction: true,
        amount: true,
        account: true,
        orderId: true,
      },
    });
    const groupNet = new Map<string, number>();
    for (const e of entries) {
      const s =
        e.direction === LedgerDirection.debit
          ? Number(e.amount)
          : -Number(e.amount);
      groupNet.set(e.entryGroupId, (groupNet.get(e.entryGroupId) ?? 0) + s);
    }
    let unbalancedGroups = 0;
    for (const [gid, net] of groupNet) {
      if (Math.abs(net) > EPSILON) {
        unbalancedGroups++;
        const msg = `LEDGER_UNBALANCED group=${gid} net=${net.toFixed(4)}`;
        driftAlarms.push(msg);
        this.logger.error(`RECONCILE ALARM: ${msg}`);
      }
    }

    // 2) Fazla-iade — completed/refunded ödemelerde Σ(refundedOrders) > amount mı?
    const payments = await this.prisma.payment.findMany({
      where: {
        status: { in: [PaymentStatus.completed, PaymentStatus.refunded] },
        updatedAt: { gte: since },
      },
      select: { id: true, amount: true, metadata: true },
    });
    let overRefundedPayments = 0;
    for (const p of payments) {
      const meta = (p.metadata as Record<string, unknown> | null) ?? {};
      const refundedOrders = meta.refundedOrders as
        Record<string, number> | undefined;
      if (!refundedOrders) continue;
      const totalRefunded = Object.values(refundedOrders).reduce(
        (s, v) => s + (Number(v) || 0),
        0,
      );
      if (totalRefunded - Number(p.amount) > EPSILON) {
        overRefundedPayments++;
        const msg = `OVER_REFUND payment=${p.id} refunded=${totalRefunded.toFixed(2)} amount=${Number(p.amount).toFixed(2)}`;
        driftAlarms.push(msg);
        this.logger.error(`RECONCILE ALARM: ${msg}`);
      }
    }

    // 3) Faz 6.3 — defter-native fazla-iade: bir siparişin defterden TÜRETİLEN iade
    //    edilen brütü (Σ refund debit) yakalanan brütünü (Σ buyer_payment credit) aşamaz.
    //    Payment metadata'ya değil, değişmez ledger'a dayanır (aynı türetim otoritesi).
    let overRefundedOrders = 0;
    const orderBalances = LedgerBalanceService.deriveOrderBalances(entries);
    for (const [orderId, b] of orderBalances) {
      if (b.captured > EPSILON && b.refunded - b.captured > EPSILON) {
        overRefundedOrders++;
        const msg = `LEDGER_OVER_REFUND order=${orderId} refunded=${b.refunded.toFixed(2)} captured=${b.captured.toFixed(2)}`;
        driftAlarms.push(msg);
        this.logger.error(`RECONCILE ALARM: ${msg}`);
      }
    }

    const report: ReconciliationReport = {
      ledgerGroupsChecked: groupNet.size,
      unbalancedGroups,
      overRefundedPayments,
      overRefundedOrders,
      driftAlarms,
    };
    log(
      `Reconcile: ${groupNet.size} defter grubu · ${unbalancedGroups} dengesiz · ${overRefundedPayments} ödeme-fazla-iade · ${overRefundedOrders} sipariş-fazla-iade`,
    );
    if (driftAlarms.length === 0) {
      this.logger.log(
        `Ledger reconcile temiz: ${groupNet.size} grup, ${payments.length} ödeme kontrol edildi`,
      );
    }
    return report;
  }
}
