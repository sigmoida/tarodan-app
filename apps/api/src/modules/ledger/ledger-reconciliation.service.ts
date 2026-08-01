import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectQueue } from "@nestjs/bull";
import { Queue } from "bull";
import { PrismaService } from "../../prisma";
import {
  PaymentStatus,
  LedgerDirection,
  LedgerAccount,
  PaytrMatchStatus,
  PaytrStatementLineType,
} from "@prisma/client";
import { registerRepeatableCron } from "../../monitoring/bull-cron.helper";
import { QUEUE_NAMES } from "../../workers/constants";
import { LedgerBalanceService } from "./ledger-balance.service";

const EPSILON = 0.01;

export interface ReconciliationReport {
  ledgerGroupsChecked: number;
  unbalancedGroups: number;
  overRefundedPayments: number;
  /** Faz 6.3: defterden türetilen (Payment metadata'sından DEĞİL) sipariş-bazlı fazla-iade. */
  overRefundedOrders: number;
  /** Damgalı (ledgerRecordedAt dolu) PayTR döküm satırlarının kesinti toplamı. */
  pspFeeStampedTotal: number;
  /** Penceredeki ledger psp_fee DEBIT toplamı — damgalı toplama eşit olmalı. */
  pspFeeLedgerTotal: number;
  /** 2+ gündür damgalanmamış (deftere yazılamamış) eşleşmiş fee'li satır sayısı. */
  pspFeeAccrualLag: number;
  driftAlarms: string[];
}

/** PSP kesinti tahakkuku bu süreden uzun gecikirse alarm (gece cron'u art arda hata veriyordur). */
const PSP_FEE_LAG_DAYS = 2;

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
    // Bull repeatable 'ledger-reconcile' her gün 04:00'te çalışır (tek mekanizma).
    await registerRepeatableCron(
      this.scheduledQueue,
      "ledger-reconcile",
      "0 4 * * *",
      this.logger,
    );
  }

  private get windowDays(): number {
    return parseInt(this.config.get("LEDGER_RECONCILE_WINDOW_DAYS") || "2", 10);
  }

  /** Gerçek iş — Bull processor 'ledger-reconcile' buradan çağırır. */
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

    // 4) PSP kesinti bütünlüğü (Faz 6.5 "ledger vs PSP raporu" kapanışı):
    //    damgalı döküm satırlarının fee toplamı = penceredeki psp_fee DEBIT toplamı.
    //    Damga ile defter yazımı aynı anda atıldığından iki taraf da kendi zaman
    //    alanıyla (ledgerRecordedAt / createdAt) AYNI pencereye dilimlenir; sapma
    //    = kaybolan/çift yazılan defter satırı ya da damgalanıp yazılamayan satır.
    const stampedLines = await this.prisma.paytrStatementLine.findMany({
      where: { ledgerRecordedAt: { gte: since } },
      select: { fee: true },
    });
    const pspFeeStampedTotal = stampedLines.reduce(
      (sum, l) => sum + Number(l.fee ?? 0),
      0,
    );
    const pspFeeLedgerTotal = entries.reduce(
      (sum, e) =>
        e.account === LedgerAccount.psp_fee &&
        e.direction === LedgerDirection.debit
          ? sum + Number(e.amount)
          : sum,
      0,
    );
    if (Math.abs(pspFeeStampedTotal - pspFeeLedgerTotal) > EPSILON) {
      const msg = `PSP_FEE_LEDGER_DRIFT stamped=${pspFeeStampedTotal.toFixed(2)} ledger=${pspFeeLedgerTotal.toFixed(2)}`;
      driftAlarms.push(msg);
      this.logger.error(`RECONCILE ALARM: ${msg}`);
    }

    // 5) PSP kesinti tahakkuku birikmesi: eşleşmiş, fee'li ama 2+ gündür deftere
    //    yazılamamış satırlar — accruePspFees her gece hata veriyorsa burada patlar.
    const lagCutoff = new Date(
      Date.now() - PSP_FEE_LAG_DAYS * 24 * 60 * 60 * 1000,
    );
    const pspFeeAccrualLag = await this.prisma.paytrStatementLine.count({
      where: {
        type: PaytrStatementLineType.sale,
        matchStatus: PaytrMatchStatus.matched,
        ledgerRecordedAt: null,
        fee: { gt: 0 },
        transactionDate: { lt: lagCutoff },
      },
    });
    if (pspFeeAccrualLag > 0) {
      const msg = `PSP_FEE_ACCRUAL_LAG count=${pspFeeAccrualLag} — kesinti tahakkuku ${PSP_FEE_LAG_DAYS}+ gündür geride`;
      driftAlarms.push(msg);
      this.logger.error(`RECONCILE ALARM: ${msg}`);
    }

    const report: ReconciliationReport = {
      ledgerGroupsChecked: groupNet.size,
      unbalancedGroups,
      overRefundedPayments,
      overRefundedOrders,
      pspFeeStampedTotal: Math.round(pspFeeStampedTotal * 100) / 100,
      pspFeeLedgerTotal: Math.round(pspFeeLedgerTotal * 100) / 100,
      pspFeeAccrualLag,
      driftAlarms,
    };
    log(
      `Reconcile: ${groupNet.size} defter grubu · ${unbalancedGroups} dengesiz · ${overRefundedPayments} ödeme-fazla-iade · ${overRefundedOrders} sipariş-fazla-iade · psp-fee ${report.pspFeeStampedTotal}/${report.pspFeeLedgerTotal}${pspFeeAccrualLag ? ` · ${pspFeeAccrualLag} tahakkuk gecikmesi` : ""}`,
    );
    if (driftAlarms.length === 0) {
      this.logger.log(
        `Ledger reconcile temiz: ${groupNet.size} grup, ${payments.length} ödeme kontrol edildi`,
      );
    }
    return report;
  }
}
