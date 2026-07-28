CREATE TYPE "RefundAttemptStatus" AS ENUM (
  'prepared',
  'submitting',
  'succeeded',
  'finalized',
  'failed',
  'manual_review'
);

CREATE TABLE "refund_attempts" (
  "id" TEXT NOT NULL,
  "payment_id" TEXT NOT NULL,
  "order_id" TEXT,
  "trade_id" TEXT,
  "idempotency_key" TEXT NOT NULL,
  "amount" DECIMAL(10, 2) NOT NULL,
  "provider" TEXT NOT NULL,
  "provider_reference" TEXT,
  "provider_refund_id" TEXT,
  "provider_response" JSONB,
  "status" "RefundAttemptStatus" NOT NULL DEFAULT 'prepared',
  "failure_reason" TEXT,
  "request_started_at" TIMESTAMP(3),
  "provider_succeeded_at" TIMESTAMP(3),
  "finalized_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "refund_attempts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "refund_attempts_exactly_one_target_check"
    CHECK (num_nonnulls("order_id", "trade_id") = 1),
  CONSTRAINT "refund_attempts_payment_id_fkey"
    FOREIGN KEY ("payment_id") REFERENCES "payments"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "refund_attempts_order_id_fkey"
    FOREIGN KEY ("order_id") REFERENCES "orders"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "refund_attempts_trade_id_fkey"
    FOREIGN KEY ("trade_id") REFERENCES "trades"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "refund_attempts_idempotency_key_key"
  ON "refund_attempts"("idempotency_key");
CREATE INDEX "refund_attempts_payment_id_order_id_idx"
  ON "refund_attempts"("payment_id", "order_id");
CREATE INDEX "refund_attempts_payment_id_trade_id_idx"
  ON "refund_attempts"("payment_id", "trade_id");
CREATE INDEX "refund_attempts_status_updated_at_idx"
  ON "refund_attempts"("status", "updated_at");

CREATE UNIQUE INDEX "refund_attempts_one_active_per_order"
  ON "refund_attempts"("payment_id", "order_id")
  WHERE "order_id" IS NOT NULL
    AND "status" IN ('prepared', 'submitting', 'succeeded', 'manual_review');
CREATE UNIQUE INDEX "refund_attempts_one_active_per_trade"
  ON "refund_attempts"("payment_id", "trade_id")
  WHERE "trade_id" IS NOT NULL
    AND "status" IN ('prepared', 'submitting', 'succeeded', 'manual_review');

-- A legacy metadata marker cannot prove whether PayTR accepted the request.
-- Backfill it as manual review instead of assuming provider success.
INSERT INTO "refund_attempts" (
  "id",
  "payment_id",
  "order_id",
  "idempotency_key",
  "amount",
  "provider",
  "provider_reference",
  "status",
  "failure_reason",
  "request_started_at",
  "created_at",
  "updated_at"
)
SELECT
  gen_random_uuid()::text,
  p."id",
  marker.key,
  'legacy-refund-marker:' || p."id" || ':' || marker.key,
  CASE
    WHEN jsonb_typeof(marker.value) = 'object'
      AND marker.value ? 'amount'
      AND (marker.value ->> 'amount') ~ '^[0-9]+([.][0-9]{1,2})?$'
      THEN (marker.value ->> 'amount')::DECIMAL(10, 2)
    ELSE p."amount"
  END,
  p."provider",
  COALESCE(NULLIF(p."provider_conversation_id", ''), marker.key),
  'manual_review',
  'Legacy refund marker has an unknown provider outcome',
  NULL,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "payments" p
CROSS JOIN LATERAL jsonb_each(
  COALESCE(p."metadata" -> 'refundInProgressOrders', '{}'::jsonb)
) AS marker
WHERE p."provider" = 'paytr'
  AND EXISTS (
    SELECT 1 FROM "orders" o WHERE o."id" = marker.key
  )
ON CONFLICT ("idempotency_key") DO NOTHING;

INSERT INTO "refund_attempts" (
  "id",
  "payment_id",
  "trade_id",
  "idempotency_key",
  "amount",
  "provider",
  "provider_reference",
  "status",
  "failure_reason",
  "request_started_at",
  "created_at",
  "updated_at"
)
SELECT
  gen_random_uuid()::text,
  p."id",
  tcp."trade_id",
  'legacy-trade-refund-marker:' || p."id",
  tcp."total_amount",
  p."provider",
  p."provider_conversation_id",
  'manual_review',
  'Legacy trade refund marker has an unknown provider outcome',
  NULL,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "payments" p
JOIN "trade_cash_payments" tcp
  ON tcp."id" = p."trade_cash_payment_id"
WHERE p."provider" = 'paytr'
  AND p."metadata" ? 'refundInProgressAt'
ON CONFLICT ("idempotency_key") DO NOTHING;
