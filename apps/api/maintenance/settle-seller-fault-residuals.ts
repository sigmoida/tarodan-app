/**
 * Settles seller-fault escrow RESIDUALS to the platform: one-off, after the
 * deploy.
 *
 * A residual is the `amount − refundedAmount` left in the hold of an order
 * closed by a refund or cancellation (the seller's shipping share retained
 * for them). With the seller at fault no release path pays it, so it stayed
 * locked in escrow. That money belongs to the platform, not the buyer: the
 * buyer already got back everything they paid (T), and the seller's share was
 * never in T but deducted from the seller's earnings. So there is no PSP call:
 * the hold becomes `cancelled` with `refundedAmount = amount` and a balanced
 * ledger group (seller_escrow -> platform) is written.
 *
 * Only rows where a finalized refund NAMES the seller at fault (the v2 fault
 * column or a v1 `seller_fault_*` code) are settled. A residual whose fault is
 * unknown (closed order with no finalized refund, or only a `legacy` refund
 * without a fault party) is listed as "decide manually"
 * and never settled by this script, not even with `--apply` (decision D20):
 * an admin settles it per hold with
 * `POST /admin/payouts/holds/:id/settle-residual` after looking at it.
 *
 * The logic lives in one place,
 * `PaymentHoldResidualService.settleSellerFaultResiduals`; the admin endpoint
 * uses the same settlement. Each hold is settled in its own transaction;
 * eligibility comes from one predicate (`holdResidualSettleable`). Re-running
 * is safe: a settled hold leaves the candidate set, and the ledger key
 * (`hold-residual-settle:<holdId>`) blocks a double entry in the database too.
 *
 * The Nest application context is loaded from the COMPILED app (`dist/`), on
 * purpose, to keep AppModule out of the seed graph (see tsconfig.seed.json).
 *
 * The default is a DRY RUN (report only): money moves cannot be undone, so
 * writing needs an explicit `--apply`.
 *
 * Usage (in the API container, after deploy + migrate):
 *   node dist-seed/maintenance/settle-seller-fault-residuals.js
 *   node dist-seed/maintenance/settle-seller-fault-residuals.js --apply
 */
import { join } from "node:path";
import type { INestApplicationContext, Type } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { pinProcessRole } from "../src/process-role";

/**
 * The service's report shape. Even an `import type` would pull the service
 * file (and the AppModule graph) into the seed build, so only the fields read
 * here are declared.
 */
interface SellerFaultResidualReport {
  dryRun: boolean;
  scanned: number;
  totalAmount: number;
  manualDecisionAmount: number;
  rows: Array<{
    holdId: string;
    orderId: string;
    sellerId: string;
    residualAmount: number;
    faultBasis: string;
    outcome: "would_settle" | "settled" | "failed" | "manual_decision";
    error?: string;
  }>;
}

interface ResidualServiceLike {
  settleSellerFaultResiduals(opts: {
    dryRun: boolean;
    actor: string;
    reason: string;
  }): Promise<SellerFaultResidualReport>;
}

const ACTOR = "maintenance:settle-seller-fault-residuals";
const REASON =
  "Seller-fault residual backlog: one-off settlement after the source fix";

function printReport(report: SellerFaultResidualReport): void {
  const manualRows = report.rows.filter(
    (row) => row.outcome === "manual_decision",
  );
  const settleRows = report.rows.filter(
    (row) => row.outcome !== "manual_decision",
  );
  console.log(
    report.dryRun
      ? "\n[DRY RUN] Nothing written. Pass --apply to write.\n"
      : "\nSettlement finished.\n",
  );
  console.log(`Holds scanned (closed orders)       : ${report.scanned}`);
  console.log(`Seller-fault residuals              : ${settleRows.length}`);
  console.log(
    `${report.dryRun ? "To settle" : "Settled"} total (TL)              : ${report.totalAmount.toFixed(2)}`,
  );
  console.log(`Unknown fault (decide manually)     : ${manualRows.length}`);
  console.log(
    `Unknown fault total (TL), not settled : ${report.manualDecisionAmount.toFixed(2)}`,
  );
  if (report.rows.length === 0) return;
  console.log("\nhold | order | seller | residual | fault | outcome");
  for (const row of report.rows) {
    console.log(
      [
        row.holdId,
        row.orderId,
        row.sellerId,
        row.residualAmount.toFixed(2),
        row.faultBasis,
        (row.outcome === "manual_decision"
          ? "DECIDE MANUALLY (never settled by this script)"
          : row.outcome) + (row.error ? ` (${row.error})` : ""),
      ].join(" | "),
    );
  }
  if (manualRows.length > 0) {
    console.log(
      `\n${manualRows.length} hold(s) have an unknown fault: review each and settle it, if at all, with POST /admin/payouts/holds/:id/settle-residual.`,
    );
  }
  const failed = report.rows.filter((row) => row.outcome === "failed").length;
  if (failed > 0) {
    console.log(`\n${failed} hold(s) failed; re-running the script is safe.`);
  }
}

async function main(): Promise<void> {
  const dryRun = !process.argv.includes("--apply");

  // Boots for a single service call: scheduled jobs (worker role) must NOT
  // run here, or they would double up with the running worker.
  pinProcessRole("web");

  const dist = join(__dirname, "..", "..", "dist");
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { AppModule } = require(join(dist, "app.module")) as {
    AppModule: Type<unknown>;
  };
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { PaymentHoldResidualService } = require(
    join(dist, "modules", "payment", "refund", "payment-hold-residual.service"),
  ) as { PaymentHoldResidualService: Type<ResidualServiceLike> };

  let app: INestApplicationContext | undefined;
  try {
    app = await NestFactory.createApplicationContext(AppModule, {
      logger: ["error", "warn", "log"],
    });
    const report = await app
      .get(PaymentHoldResidualService)
      .settleSellerFaultResiduals({ dryRun, actor: ACTOR, reason: REASON });
    printReport(report);
    if (report.rows.some((row) => row.outcome === "failed")) {
      process.exitCode = 1;
    }
  } finally {
    await app?.close();
  }
}

main().then(
  () => process.exit(process.exitCode ?? 0),
  (error: unknown) => {
    console.error(error);
    process.exit(1);
  },
);
