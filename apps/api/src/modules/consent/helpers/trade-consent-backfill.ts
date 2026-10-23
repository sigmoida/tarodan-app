import { ConsentAction, Prisma, type PrismaClient } from "@prisma/client";
import { isTradeConsentUniqueViolation } from "./distance-sales-trade";

/**
 * `backfill:prod:consent-trade-cash-payments`: copies the trade cash payment
 * reference of a trade distance sales consent written before
 * `consent_records.trade_cash_payment_id` existed from `details` into the
 * column. The append-only guard allows exactly this change (NULL -> the row's
 * own `details->>'tradeCashPaymentId'`); every other column stays as it is.
 *
 * A row is filled only when the cash payment it names still exists (the FK).
 * The partial unique index allows one granted row per payment, so when an
 * earlier race left two granted rows for one payment, only the earliest is
 * filled and the others stay as they are (still found through `details` while
 * the legacy fallback exists, and listed by the dry run).
 */

/** A legacy trade consent row: column NULL, reference in `details`. */
export interface TradeConsentCandidate {
  id: string;
  action: ConsentAction;
  tradeCashPaymentId: string;
  createdAt: Date;
}

export type TradeConsentBackfillOutcome =
  /** The column gets the reference. */
  | "set"
  /** The cash payment no longer exists (test-lane purge): left NULL. */
  | "payment_missing"
  /** Another granted row of the same payment holds (or gets) it: left NULL. */
  | "duplicate";

export interface TradeConsentBackfillRow {
  consentRecordId: string;
  tradeCashPaymentId: string;
  outcome: TradeConsentBackfillOutcome;
}

export interface TradeConsentApplyResult {
  updated: number;
  /** Already filled, or taken by another row, between the plan and the write. */
  skipped: number;
}

export type TradeConsentBackfillDb = Pick<
  PrismaClient,
  "$queryRaw" | "consentRecord" | "tradeCashPayment"
>;

/** Keeps `IN (...)` lists well under PostgreSQL's bind parameter limit. */
const ID_CHUNK = 1000;

function chunks<T>(items: readonly T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += ID_CHUNK) {
    out.push(items.slice(i, i + ID_CHUNK));
  }
  return out;
}

/**
 * The plan, pure. `candidates` must be in write order (oldest first), so the
 * earliest granted row of a payment is the one kept.
 */
export function planTradeConsentBackfill(input: {
  candidates: readonly TradeConsentCandidate[];
  existingPaymentIds: ReadonlySet<string>;
  /** Payments that already have a granted row with the column set. */
  heldPaymentIds: ReadonlySet<string>;
}): TradeConsentBackfillRow[] {
  const claimed = new Set(input.heldPaymentIds);
  return input.candidates.map((candidate) => {
    const row = {
      consentRecordId: candidate.id,
      tradeCashPaymentId: candidate.tradeCashPaymentId,
    };
    if (!input.existingPaymentIds.has(candidate.tradeCashPaymentId)) {
      return { ...row, outcome: "payment_missing" };
    }
    if (candidate.action === ConsentAction.granted) {
      if (claimed.has(candidate.tradeCashPaymentId)) {
        return { ...row, outcome: "duplicate" };
      }
      claimed.add(candidate.tradeCashPaymentId);
    }
    return { ...row, outcome: "set" };
  });
}

/** Reads the candidates and builds the plan (no write). */
export async function planTradeConsentBackfillFromDb(
  db: TradeConsentBackfillDb,
): Promise<TradeConsentBackfillRow[]> {
  const candidates = await db.$queryRaw<TradeConsentCandidate[]>(Prisma.sql`
    SELECT
      id,
      action,
      details ->> 'tradeCashPaymentId' AS "tradeCashPaymentId",
      created_at AS "createdAt"
    FROM consent_records
    WHERE document = 'distance_sales'
      AND trade_cash_payment_id IS NULL
      AND jsonb_typeof(details -> 'tradeCashPaymentId') = 'string'
    ORDER BY created_at ASC, id ASC`);
  const paymentIds = [...new Set(candidates.map((c) => c.tradeCashPaymentId))];

  const existingPaymentIds = new Set<string>();
  const heldPaymentIds = new Set<string>();
  for (const ids of chunks(paymentIds)) {
    const payments = await db.tradeCashPayment.findMany({
      where: { id: { in: ids } },
      select: { id: true },
    });
    for (const p of payments) existingPaymentIds.add(p.id);
    const held = await db.consentRecord.findMany({
      where: {
        document: "distance_sales",
        action: ConsentAction.granted,
        tradeCashPaymentId: { in: ids },
      },
      select: { tradeCashPaymentId: true },
    });
    for (const h of held) {
      if (h.tradeCashPaymentId) heldPaymentIds.add(h.tradeCashPaymentId);
    }
  }

  return planTradeConsentBackfill({
    candidates,
    existingPaymentIds,
    heldPaymentIds,
  });
}

/**
 * Writes the `set` rows of a plan. Each write is a compare-and-set on the
 * column still being NULL, so a re-run, or a row filled in between, changes
 * nothing; a row whose payment another row took in between (the unique index)
 * is skipped. Any other error stops the run and is rethrown with the count
 * written so far (a re-run is safe).
 */
export async function applyTradeConsentBackfill(
  db: TradeConsentBackfillDb,
  plan: readonly TradeConsentBackfillRow[],
): Promise<TradeConsentApplyResult> {
  const result: TradeConsentApplyResult = { updated: 0, skipped: 0 };
  for (const row of plan) {
    if (row.outcome !== "set") continue;
    try {
      const { count } = await db.consentRecord.updateMany({
        where: { id: row.consentRecordId, tradeCashPaymentId: null },
        data: { tradeCashPaymentId: row.tradeCashPaymentId },
      });
      if (count === 1) result.updated += 1;
      else result.skipped += 1;
    } catch (error) {
      if (isTradeConsentUniqueViolation(error)) {
        result.skipped += 1;
        continue;
      }
      throw new TradeConsentBackfillError(result, error);
    }
  }
  return result;
}

/** A write failed part-way: what was written before it stays (re-run is safe). */
export class TradeConsentBackfillError extends Error {
  constructor(
    readonly progress: TradeConsentApplyResult,
    readonly failure: unknown,
  ) {
    super(
      `Backfill stopped after ${progress.updated} updated and ${progress.skipped} skipped rows: ` +
        (failure instanceof Error ? failure.message : String(failure)),
    );
    this.name = "TradeConsentBackfillError";
  }
}
