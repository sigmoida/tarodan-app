import { Prisma } from "@prisma/client";
import { round2 } from "../finance-reconciliation.types";

/**
 * The installment rows of the finance summary (ADR 0019, plan 4.6.4 and 5.6):
 * the vade farkı the buyers paid ("Vade farkı geliri") and the installment
 * cost segment rules made the platform absorb ("Taksit kampanya maliyeti"),
 * by installment count and buyer segment. Read from the frozen columns: the
 * captured charge attempt (count, segment, fee VAT rate, expected cost P),
 * the payment's fee F, the refunds' fee shares and the ledger's booked
 * `installment_platform_cost`. Live lane only, like every finance figure.
 */

/** One (count, segment) row, TL. */
export interface InstallmentSummaryRow {
  installmentCount: number;
  /** `InstallmentSegment` of the captured attempt (`guest`, `free`, ...). */
  segment: string;
  /** Captured installment payments. */
  payments: number;
  /** Σ F of the captured payments, VAT included (what the buyers paid). */
  feeCollected: number;
  /** Σ fee shares given back with refunds (D7). */
  feeRefunded: number;
  /** (collected - refunded) without its VAT, at each attempt's fee VAT rate. */
  feeIncomeNet: number;
  /** Σ P snapshotted at signing: the cost the rules were expected to cost. */
  platformCostExpected: number;
  /** Σ `installment_platform_cost` booked from PayTR's deductions. */
  platformCostBooked: number;
}

export type InstallmentSummaryTotals = Omit<
  InstallmentSummaryRow,
  "installmentCount" | "segment"
>;

export interface InstallmentSummary {
  rows: InstallmentSummaryRow[];
  totals: InstallmentSummaryTotals;
}

/** A row as the SQL returns it (Decimal sums, unrounded net). */
export interface InstallmentSummaryRawRow {
  installment_count: number;
  segment: string;
  payments: number;
  fee_collected: Prisma.Decimal | null;
  fee_refunded: Prisma.Decimal | null;
  fee_income_net: Prisma.Decimal | null;
  platform_cost_expected: Prisma.Decimal | null;
  platform_cost_booked: Prisma.Decimal | null;
}

const num = (value: Prisma.Decimal | number | null | undefined): number =>
  value == null ? 0 : Number(value);

/** Rounds each row at the kuruş and sums the rounded rows (what is shown adds up). */
export function assembleInstallmentSummary(
  raw: readonly InstallmentSummaryRawRow[],
): InstallmentSummary {
  const rows = raw.map((r): InstallmentSummaryRow => ({
    installmentCount: num(r.installment_count),
    segment: r.segment,
    payments: num(r.payments),
    feeCollected: round2(num(r.fee_collected)),
    feeRefunded: round2(num(r.fee_refunded)),
    feeIncomeNet: round2(num(r.fee_income_net)),
    platformCostExpected: round2(num(r.platform_cost_expected)),
    platformCostBooked: round2(num(r.platform_cost_booked)),
  }));
  const totals = rows.reduce<InstallmentSummaryTotals>(
    (acc, row) => ({
      payments: acc.payments + row.payments,
      feeCollected: round2(acc.feeCollected + row.feeCollected),
      feeRefunded: round2(acc.feeRefunded + row.feeRefunded),
      feeIncomeNet: round2(acc.feeIncomeNet + row.feeIncomeNet),
      platformCostExpected: round2(
        acc.platformCostExpected + row.platformCostExpected,
      ),
      platformCostBooked: round2(
        acc.platformCostBooked + row.platformCostBooked,
      ),
    }),
    {
      payments: 0,
      feeCollected: 0,
      feeRefunded: 0,
      feeIncomeNet: 0,
      platformCostExpected: 0,
      platformCostBooked: 0,
    },
  );
  return { rows, totals };
}

/**
 * One reporting query (raw SQL in the owning domain): every captured,
 * collected installment payment of the live lane with its attempt, its fee
 * refunds and its booked platform cost, grouped by count and segment.
 */
export async function loadInstallmentSummary(
  db: Pick<Prisma.TransactionClient, "$queryRaw">,
): Promise<InstallmentSummary> {
  const raw = await db.$queryRaw<InstallmentSummaryRawRow[]>`
    WITH paid AS (
      SELECT
        p.id,
        p.installment_fee_amount  AS fee,
        a.installment_count       AS installment_count,
        a.buyer_segment::text     AS segment,
        a.fee_vat_rate_pct        AS vat_rate,
        a.platform_cost_amount    AS platform_cost
      FROM payments p
      JOIN payment_charge_attempts a ON a.id = p.charge_attempt_id
      WHERE p.status IN ('completed', 'refunded')
        AND p.is_test = false
        AND a.installment_count > 1
    ),
    refunded AS (
      SELECT r.payment_id, SUM(r.installment_fee_amount) AS fee
      FROM refund_attempts r
      JOIN paid ON paid.id = r.payment_id
      WHERE r.status IN ('succeeded', 'finalized')
      GROUP BY r.payment_id
    ),
    booked AS (
      SELECT l.payment_id, SUM(l.amount) AS cost
      FROM ledger_entries l
      JOIN paid ON paid.id = l.payment_id
      WHERE l.account = 'installment_platform_cost'
        AND l.direction = 'debit'
        AND l.is_test = false
      GROUP BY l.payment_id
    )
    SELECT
      paid.installment_count                                  AS installment_count,
      paid.segment                                            AS segment,
      COUNT(*)::int                                           AS payments,
      COALESCE(SUM(paid.fee), 0)                              AS fee_collected,
      COALESCE(SUM(COALESCE(refunded.fee, 0)), 0)             AS fee_refunded,
      COALESCE(SUM((paid.fee - COALESCE(refunded.fee, 0))
                   / (1 + paid.vat_rate / 100)), 0)           AS fee_income_net,
      COALESCE(SUM(paid.platform_cost), 0)                    AS platform_cost_expected,
      COALESCE(SUM(COALESCE(booked.cost, 0)), 0)              AS platform_cost_booked
    FROM paid
    LEFT JOIN refunded ON refunded.payment_id = paid.id
    LEFT JOIN booked ON booked.payment_id = paid.id
    GROUP BY paid.installment_count, paid.segment
    ORDER BY paid.installment_count, paid.segment
  `;
  return assembleInstallmentSummary(raw);
}
