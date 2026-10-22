/**
 * Copies the trade cash payment reference of trade distance sales consents
 * written before `consent_records.trade_cash_payment_id` existed (migration
 * `20261022180000_consent_records_trade_cash_payment`) from
 * `details.tradeCashPaymentId` into the column, so the payment gate reads them
 * by the indexed column and the admin search finds them by trade number.
 *
 * Run once after the release that writes the column (the previous image may
 * still write rows without it during the deploy), then the legacy `details`
 * fallback in `consent/helpers/distance-sales-trade.ts` can be removed.
 *
 * Safety:
 *  - DRY RUN by default: lists every candidate with its outcome and writes
 *    nothing. Writing needs `--apply --db=<database name>`; the name must
 *    match the DATABASE_URL target printed by the dry run (an unverifiable
 *    target, such as a socket URL, is refused).
 *  - Each write is a compare-and-set (`trade_cash_payment_id IS NULL`), and
 *    the append-only guard allows only the row's own `details` reference, so
 *    a re-run is safe and nothing else on the row can change.
 *  - A row is filled only when its cash payment still exists. When an earlier
 *    race left two granted rows for one payment, only the earliest is filled
 *    (the partial unique index); the others are listed as `duplicate`.
 *  - The report prints ids only (no personal data).
 *
 * Usage:
 *   node dist-seed/maintenance/backfill-consent-trade-cash-payments.js                    # dry run
 *   node dist-seed/maintenance/backfill-consent-trade-cash-payments.js --apply --db=<name> # writes
 */
import { PrismaClient } from "@prisma/client";
import {
  applyRefusal,
  describeDatabaseTarget,
  parseBackfillMode,
  parseDatabaseTarget,
} from "../src/modules/consent/helpers/test-account-backfill";
import {
  TradeConsentBackfillError,
  applyTradeConsentBackfill,
  planTradeConsentBackfillFromDb,
  type TradeConsentBackfillOutcome,
} from "../src/modules/consent/helpers/trade-consent-backfill";

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const mode = parseBackfillMode(process.argv);
  const target = parseDatabaseTarget(process.env.DATABASE_URL);
  console.log(
    `Target database: ${describeDatabaseTarget(process.env.DATABASE_URL)}`,
  );
  console.log(
    mode.kind === "apply"
      ? `Mode: WRITE (--apply --db=${mode.database})`
      : "Mode: dry run (writes nothing; to write: --apply --db=<database name>)",
  );
  const refusal = applyRefusal(mode, target);
  if (refusal) throw new Error(refusal);

  const plan = await planTradeConsentBackfillFromDb(prisma);
  const counts: Record<TradeConsentBackfillOutcome, number> = {
    set: 0,
    payment_missing: 0,
    duplicate: 0,
  };
  for (const row of plan) {
    counts[row.outcome] += 1;
    console.log(
      `${row.consentRecordId} tradeCashPayment=${row.tradeCashPaymentId} ${row.outcome}`,
    );
  }
  console.log(
    `Candidates: ${plan.length} (set: ${counts.set}, ` +
      `payment_missing: ${counts.payment_missing}, duplicate: ${counts.duplicate})`,
  );

  if (mode.kind === "dry-run") {
    console.log("\n[DRY RUN] Nothing written.");
    return;
  }

  try {
    const result = await applyTradeConsentBackfill(prisma, plan);
    console.log(
      `\nUpdated ${result.updated} / planned ${counts.set} ` +
        `(skipped: ${result.skipped}, filled or taken since the plan)`,
    );
  } catch (error) {
    if (error instanceof TradeConsentBackfillError) {
      console.error(
        `\nERROR: stopped part-way. Updated ${error.progress.updated}, ` +
          `skipped ${error.progress.skipped} / planned ${counts.set}. ` +
          "A re-run is safe (idempotent).",
      );
    }
    throw error;
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
