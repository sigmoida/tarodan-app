import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import {
  LedgerAccount,
  LedgerDirection,
  LedgerEventType,
  PaymentHold,
  PaymentHoldStatus,
  Prisma,
} from "@prisma/client";
import { PrismaService } from "../../../prisma";
import { LedgerService } from "../../ledger/ledger.service";
import { i18nMessage } from "../../i18n";
import { errorMessage } from "../../../common/helpers/error-message";
import {
  HOLD_RELEASE_ORDER_SELECT,
  closedOrderHoldResidual,
  holdReleaseOrderFacts,
  holdResidualSettleable,
  isNamedSellerFaultRefund,
  type HoldReleaseOrderFacts,
} from "../../payout/helpers/hold-release-eligibility";
import {
  findClosedOrderHeldHolds,
  type HoldCandidateCursor,
} from "../../payout/helpers/closed-order-hold-candidates";

/** Kalıntı kapatmanın defter idempotency anahtarı — hold başına TEK kayıt. */
export const holdResidualSettleKey = (holdId: string) =>
  `hold-residual-settle:${holdId}`;

/** Toplu kapatmanın aday sayfası. */
const SETTLE_BATCH_SIZE = 200;

/**
 * The basis of the fault: `seller` when a finalized refund NAMES the seller
 * at fault (`isNamedSellerFaultRefund`); `unknown` when no finalized refund
 * names a fault (none at all, or only a legacy "in doubt" one). Neither is
 * paid to the seller; only `seller` is settled by the batch (D20).
 */
export type ResidualFaultBasis = "seller" | "unknown";

export interface SettledHoldResidual {
  holdId: string;
  orderId: string;
  sellerId: string;
  /** Platforma kapatılan tutar (TL) = kapatma anındaki `amount − refundedAmount`. */
  settledAmount: number;
  faultBasis: ResidualFaultBasis;
}

/**
 * Kapatmayla AYNI işlemde çalışan adım (admin katmanının zorunlu denetimi).
 * Fırlatırsa kapatma da geri alınır.
 */
export type HoldResidualAfterWrite = (
  tx: Prisma.TransactionClient,
  settled: SettledHoldResidual,
) => Promise<unknown>;

export interface SellerFaultResidualReportRow {
  holdId: string;
  orderId: string;
  sellerId: string;
  residualAmount: number;
  faultBasis: ResidualFaultBasis;
  /**
   * `manual_decision`: the fault is unknown (closed order, no finalized
   * refund). The batch never settles it (decision D20); an admin decides per
   * hold through `POST /admin/payouts/holds/:id/settle-residual`.
   */
  outcome: "would_settle" | "settled" | "failed" | "manual_decision";
  error?: string;
}

export interface SellerFaultResidualReport {
  dryRun: boolean;
  /** Candidates read (held holds of closed orders). */
  scanned: number;
  rows: SellerFaultResidualReportRow[];
  /** Total settled (in a dry run: to be settled). */
  totalAmount: number;
  /** Total of the `manual_decision` rows: listed, never settled by the batch. */
  manualDecisionAmount: number;
}

/**
 * Satıcı kusurlu KALINTININ platforma kapatılması.
 *
 * Kalıntı = iade/iptalle kapanmış siparişin hold'unda kalan `amount −
 * refundedAmount`; satıcının kargo payının tazmininden (`holdRetainedAmount`)
 * doğar. Kusur satıcıda DEĞİLSE bırakma yolları onu satıcıya öder. Kusur
 * satıcıdaysa o para PLATFORMUNDUR: alıcı ödediğinin tamamını (T) zaten geri
 * almıştır ve satıcı payı T'de değil, satıcının hak edişinden düşülmüştür —
 * alıcıya ikinci kez iade edilemez (PSP tavanı T). Bu servis o kalıntıyı PSP'ye
 * gitmeden kapatır: hold `cancelled`, `refundedAmount = amount`, ve dengeli
 * bir defter kaydı (seller_escrow → platform).
 *
 * Kaynak kapandı (satıcı kusurlu kargo öncesi iptal artık satıcı payını tazmin
 * etmez); bu servis birikmiş kalıntıları ve olası istisnaları kapatır. Karar
 * tek yüklemde: `holdResidualSettleable`.
 */
@Injectable()
export class PaymentHoldResidualService {
  private readonly logger = new Logger(PaymentHoldResidualService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
  ) {}

  /**
   * Tek hold'un satıcı kusurlu kalıntısını platforma kapatır. Uygun değilse
   * 409 (`server.payment.holdResidualNotSettleable`); hold yoksa 404.
   *
   * İdempotent: kapatılmış hold artık `held` değildir → ikinci çağrı 409 alır
   * ve hiçbir şey yazmaz; defter anahtarı (`hold-residual-settle:<holdId>`)
   * çift kaydı DB'de de düşürür. Hold yazımı CAS'lıdır (durum + kilit +
   * okunan `refundedAmount`): karar ile yazım arasında açılan bir iade
   * (freeze) ya da tüketim kapatmayı düşürür.
   */
  async settleResidual(
    holdId: string,
    opts: {
      actor: string;
      reason: string;
      afterWrite?: HoldResidualAfterWrite;
    },
  ): Promise<SettledHoldResidual> {
    const now = new Date();
    return this.prisma.$transaction(async (tx) => {
      const { hold, facts } = await this.loadFacts(tx, holdId);
      if (!hold) {
        throw new NotFoundException(i18nMessage("server.admin.holdNotFound"));
      }
      if (!holdResidualSettleable(hold, facts, now)) {
        throw new ConflictException(
          i18nMessage("server.payment.holdResidualNotSettleable"),
        );
      }
      const residual = closedOrderHoldResidual(hold, facts);

      const claimed = await tx.paymentHold.updateMany({
        where: {
          id: hold.id,
          status: PaymentHoldStatus.held,
          frozenByRefundId: null,
          refundedAmount: hold.refundedAmount,
        },
        data: {
          status: PaymentHoldStatus.cancelled,
          refundedAmount: hold.amount,
        },
      });
      if (claimed.count !== 1) {
        throw new ConflictException(
          i18nMessage("server.payment.holdResidualNotSettleable"),
        );
      }

      const settled: SettledHoldResidual = {
        holdId: hold.id,
        orderId: hold.orderId,
        sellerId: hold.sellerId,
        settledAmount: residual.toNumber(),
        faultBasis: faultBasisOf(facts),
      };
      // Escrow'daki satıcı borcu kapanır, tutar platforma geçer. Append-only
      // defter: düzeltme gerekirse ters kayıt yazılır.
      const memo = `Satıcı kusurlu kalıntı platforma kapatıldı (hold ${hold.id}, sipariş ${hold.orderId})`;
      await this.ledger.record(tx, {
        eventType: LedgerEventType.adjustment,
        idempotencyKey: holdResidualSettleKey(hold.id),
        entries: [
          {
            account: LedgerAccount.seller_escrow,
            direction: LedgerDirection.credit,
            amount: settled.settledAmount,
            sellerId: hold.sellerId,
            memo,
          },
          {
            account: LedgerAccount.platform_commission,
            direction: LedgerDirection.debit,
            amount: settled.settledAmount,
            memo,
          },
        ],
        refs: {
          holdId: hold.id,
          orderId: hold.orderId,
          paymentId: hold.paymentId,
          sellerId: hold.sellerId,
        },
        metadata: {
          kind: "hold_residual_settle",
          faultBasis: settled.faultBasis,
          actor: opts.actor,
          reason: opts.reason,
          holdAmount: hold.amount.toString(),
          refundedAmountBefore: hold.refundedAmount.toString(),
        },
      });
      await opts.afterWrite?.(tx, settled);
      return settled;
    });
  }

  /**
   * Scans the accumulated seller-fault residuals and, unless it is a dry run,
   * settles them: the one path of the maintenance script and of any future
   * bulk admin action. Each hold is settled by `settleResidual` in its OWN
   * transaction; one failure leaves the others alone and is reported as
   * `failed`. Re-running is safe: a settled hold leaves the candidate set.
   *
   * Only `faultBasis: "seller"` rows are settled. A residual whose fault is
   * unknown (closed order, no finalized refund) is listed as
   * `manual_decision` and never settled here (decision D20); the admin
   * endpoint settles it per hold after a person has looked at it.
   */
  async settleSellerFaultResiduals(opts: {
    dryRun: boolean;
    actor: string;
    reason: string;
  }): Promise<SellerFaultResidualReport> {
    const now = new Date();
    const report: SellerFaultResidualReport = {
      dryRun: opts.dryRun,
      scanned: 0,
      rows: [],
      totalAmount: 0,
      manualDecisionAmount: 0,
    };
    let total = new Prisma.Decimal(0);
    let manual = new Prisma.Decimal(0);
    let after: HoldCandidateCursor | undefined;
    for (;;) {
      const candidates = await findClosedOrderHeldHolds(this.prisma, {
        limit: SETTLE_BATCH_SIZE,
        after,
      });
      if (candidates.length === 0) break;
      after = candidates[candidates.length - 1];

      for (const candidate of candidates) {
        report.scanned += 1;
        const { hold, facts } = await this.loadFacts(this.prisma, candidate.id);
        if (!hold || !holdResidualSettleable(hold, facts, now)) continue;
        const residual = closedOrderHoldResidual(hold, facts);
        const row: SellerFaultResidualReportRow = {
          holdId: hold.id,
          orderId: hold.orderId,
          sellerId: hold.sellerId,
          residualAmount: residual.toNumber(),
          faultBasis: faultBasisOf(facts),
          outcome: "would_settle",
        };
        // D20: an unknown fault is not decided by a batch, in either mode.
        if (row.faultBasis === "unknown") {
          row.outcome = "manual_decision";
          manual = manual.plus(row.residualAmount);
          report.rows.push(row);
          continue;
        }
        if (!opts.dryRun) {
          try {
            const settled = await this.settleResidual(hold.id, {
              actor: opts.actor,
              reason: opts.reason,
            });
            row.residualAmount = settled.settledAmount;
            row.outcome = "settled";
          } catch (error: unknown) {
            row.outcome = "failed";
            row.error = errorMessage(error);
            this.logger.error(
              `Residual settlement failed hold=${hold.id}: ${row.error}`,
            );
          }
        }
        if (row.outcome !== "failed") {
          total = total.plus(row.residualAmount);
        }
        report.rows.push(row);
      }
    }
    report.totalAmount = total.toNumber();
    report.manualDecisionAmount = manual.toNumber();
    return report;
  }

  /** Hold + yüklemin sipariş girdisi — TEK okuma şekli. */
  private async loadFacts(
    db: Pick<Prisma.TransactionClient, "paymentHold" | "order">,
    holdId: string,
  ): Promise<{
    hold: PaymentHold | null;
    facts: HoldReleaseOrderFacts | null;
  }> {
    const hold = await db.paymentHold.findUnique({ where: { id: holdId } });
    if (!hold) return { hold: null, facts: null };
    const order = await db.order.findUnique({
      where: { id: hold.orderId },
      select: HOLD_RELEASE_ORDER_SELECT,
    });
    return { hold, facts: order ? holdReleaseOrderFacts(order) : null };
  }
}

function faultBasisOf(
  facts: Pick<HoldReleaseOrderFacts, "finalizedRefunds"> | null,
): ResidualFaultBasis {
  // Only a NAMED seller fault is "seller"; a legacy "in doubt" fault, or no
  // finalized refund at all, is "unknown" and left to a person (D20).
  return facts?.finalizedRefunds.some(isNamedSellerFaultRefund)
    ? "seller"
    : "unknown";
}
