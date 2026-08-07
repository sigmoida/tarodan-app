CREATE TYPE "CarrierCancellationTaskStatus" AS ENUM ('pending', 'resolved', 'dismissed');

ALTER TABLE "order_packages" ADD COLUMN "carrier_reference" TEXT;
UPDATE "order_packages"
SET "carrier_reference" = "package_number"
WHERE "carrier_reference" IS NULL;

CREATE TABLE "carrier_cancellation_tasks" (
    "id" TEXT NOT NULL,
    "dedupe_key" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "CarrierCancellationTaskStatus" NOT NULL DEFAULT 'pending',
    "metadata" JSONB,
    "requested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMP(3),
    "resolved_by" TEXT,
    "resolution" TEXT,

    CONSTRAINT "carrier_cancellation_tasks_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "carrier_cancellation_tasks_dedupe_key_key"
ON "carrier_cancellation_tasks"("dedupe_key");

CREATE INDEX "carrier_cancellation_tasks_status_requested_at_idx"
ON "carrier_cancellation_tasks"("status", "requested_at");

CREATE INDEX "carrier_cancellation_tasks_entity_type_entity_id_idx"
ON "carrier_cancellation_tasks"("entity_type", "entity_id");
