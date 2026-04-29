-- CreateEnum
CREATE TYPE "RefundReason" AS ENUM ('changed_mind', 'damaged', 'wrong_item', 'not_as_described', 'missing_parts', 'other');

-- CreateEnum
CREATE TYPE "RefundRequestStatus" AS ENUM ('pending_review', 'approved', 'wait_for_delivery', 'return_shipment_open', 'return_in_transit', 'return_delivered', 'refunded', 'rejected', 'disputed', 'cancelled');

-- CreateTable
CREATE TABLE "refund_requests" (
    "id" TEXT NOT NULL,
    "refund_number" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "requester_id" TEXT NOT NULL,
    "reason" "RefundReason" NOT NULL,
    "description" TEXT,
    "evidence_photo_urls" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "amount" DECIMAL(10,2) NOT NULL,
    "status" "RefundRequestStatus" NOT NULL DEFAULT 'pending_review',
    "seller_response" TEXT,
    "decided_by" TEXT,
    "decided_at" TIMESTAMP(3),
    "return_provider" TEXT,
    "return_tracking_number" TEXT,
    "return_status" "ShipmentStatus",
    "return_shipped_at" TIMESTAMP(3),
    "return_delivered_at" TIMESTAMP(3),
    "return_created_at" TIMESTAMP(3),
    "refunded_at" TIMESTAMP(3),
    "provider_refund_id" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "refund_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "refund_requests_refund_number_key" ON "refund_requests"("refund_number");

-- CreateIndex
CREATE INDEX "refund_requests_order_id_idx" ON "refund_requests"("order_id");

-- CreateIndex
CREATE INDEX "refund_requests_requester_id_idx" ON "refund_requests"("requester_id");

-- CreateIndex
CREATE INDEX "refund_requests_status_idx" ON "refund_requests"("status");

-- CreateIndex
CREATE INDEX "refund_requests_refund_number_idx" ON "refund_requests"("refund_number");

-- AddForeignKey
ALTER TABLE "refund_requests" ADD CONSTRAINT "refund_requests_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refund_requests" ADD CONSTRAINT "refund_requests_requester_id_fkey" FOREIGN KEY ("requester_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateSequence: atomic refund number generation, starts from 1
CREATE SEQUENCE IF NOT EXISTS refund_request_number_seq START WITH 1 INCREMENT BY 1 NO CYCLE;
