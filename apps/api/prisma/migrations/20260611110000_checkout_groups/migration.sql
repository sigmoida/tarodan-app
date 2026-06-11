-- CheckoutGroup: tek checkout'ta oluşan siparişleri bağlar; tek ödeme tüm grubu kapsar.

-- CreateTable
CREATE TABLE "checkout_groups" (
    "id" TEXT NOT NULL,
    "group_number" TEXT NOT NULL,
    "buyer_id" TEXT NOT NULL,
    "idempotency_key" TEXT,
    "total_amount" DECIMAL(10,2) NOT NULL,
    "is_guest" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "checkout_groups_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "checkout_groups_group_number_key" ON "checkout_groups"("group_number");
CREATE UNIQUE INDEX "checkout_groups_idempotency_key_key" ON "checkout_groups"("idempotency_key");
CREATE INDEX "checkout_groups_buyer_id_created_at_idx" ON "checkout_groups"("buyer_id", "created_at");

-- AddForeignKey
ALTER TABLE "checkout_groups" ADD CONSTRAINT "checkout_groups_buyer_id_fkey" FOREIGN KEY ("buyer_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AlterTable: orders
ALTER TABLE "orders" ADD COLUMN "checkout_group_id" TEXT;
CREATE INDEX "orders_checkout_group_id_idx" ON "orders"("checkout_group_id");
ALTER TABLE "orders" ADD CONSTRAINT "orders_checkout_group_id_fkey" FOREIGN KEY ("checkout_group_id") REFERENCES "checkout_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable: payments
ALTER TABLE "payments" ADD COLUMN "checkout_group_id" TEXT;
CREATE UNIQUE INDEX "payments_checkout_group_id_key" ON "payments"("checkout_group_id");
ALTER TABLE "payments" ADD CONSTRAINT "payments_checkout_group_id_fkey" FOREIGN KEY ("checkout_group_id") REFERENCES "checkout_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable: payment_holds — grup ödemesinde tek payment'a satıcı başına N hold
DROP INDEX "payment_holds_payment_id_key";
CREATE UNIQUE INDEX "payment_holds_payment_id_order_id_key" ON "payment_holds"("payment_id", "order_id");
CREATE INDEX "payment_holds_payment_id_idx" ON "payment_holds"("payment_id");

-- Backfill: her mevcut gerçek ürün siparişi kendi 1-siparişlik grubunu alır.
-- group_number = 'GRP' || order_number (order_number unique olduğundan çakışma olmaz).
-- membership-/boost- sanal siparişleri grupsuz kalır (alıcı listesinden zaten hariçler).
-- Bekleyen ödemelere checkout_group_id backfill YAPILMAZ: in-flight ödemeler legacy order_id yolundan tamamlanır.
INSERT INTO "checkout_groups" ("id", "group_number", "buyer_id", "total_amount", "is_guest", "created_at", "updated_at")
SELECT
    gen_random_uuid()::text,
    'GRP' || o."order_number",
    o."buyer_id",
    o."total_amount",
    COALESCE((o."shipping_address"->>'isGuestOrder')::boolean, false),
    o."created_at",
    o."updated_at"
FROM "orders" o
WHERE o."product_id" NOT LIKE 'membership-%'
  AND o."product_id" NOT LIKE 'boost-%';

UPDATE "orders" o
SET "checkout_group_id" = g."id"
FROM "checkout_groups" g
WHERE g."group_number" = 'GRP' || o."order_number";
