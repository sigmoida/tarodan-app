import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

try {
  const [ledgerMismatch, activeQuarantine, successfulAttempts, componentDrift] =
    await Promise.all([
      prisma.$queryRaw`
        SELECT COUNT(*)::int AS count
        FROM "commission_ledger"
        WHERE "component_breakdown_complete" = false
      `,
      prisma.$queryRaw`
        SELECT COUNT(*)::int AS count
        FROM "refund_requests"
        WHERE "status" NOT IN ('refunded', 'rejected', 'cancelled')
          AND "financial_review_required" = true
      `,
      prisma.$queryRaw`
        SELECT COUNT(DISTINCT rr."id")::int AS count
        FROM "refund_requests" rr
        JOIN "refund_attempts" ra ON ra."order_id" = rr."order_id"
        WHERE rr."status" NOT IN ('refunded', 'rejected', 'cancelled')
          AND ra."status" IN ('succeeded', 'finalized')
      `,
      prisma.$queryRaw`
        SELECT COUNT(*)::int AS count
        FROM "refund_requests" rr
        WHERE rr."policy_version" = 2
          AND rr."policy_finalized_at" IS NOT NULL
          AND ABS(
            rr."amount" - COALESCE((
              SELECT SUM(
                CASE
                  WHEN rfc."treatment" = 'buyer_refund' THEN rfc."gross_amount"
                  WHEN rfc."treatment" = 'buyer_charge' THEN -rfc."gross_amount"
                  ELSE 0
                END
              )
              FROM "refund_financial_components" rfc
              WHERE rfc."refund_request_id" = rr."id"
            ), 0)
          ) > 0.01
      `,
    ]);

  const report = {
    generatedAt: new Date().toISOString(),
    ledgerComponentMismatchCount: ledgerMismatch[0]?.count ?? 0,
    activeFinancialQuarantineCount: activeQuarantine[0]?.count ?? 0,
    activeSuccessfulRefundAttemptCount: successfulAttempts[0]?.count ?? 0,
    finalizedRefundComponentDriftCount: componentDrift[0]?.count ?? 0,
  };
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);

  if (
    report.ledgerComponentMismatchCount > 0 ||
    report.activeSuccessfulRefundAttemptCount > 0 ||
    report.finalizedRefundComponentDriftCount > 0
  ) {
    process.exitCode = 2;
  }
} finally {
  await prisma.$disconnect();
}
