CREATE TYPE "CouponReservationStatus" AS ENUM ('active', 'consumed', 'released');

CREATE TABLE "coupon_reservations" (
    "id" TEXT NOT NULL,
    "discount_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "voucher_code_id" TEXT,
    "amount" DECIMAL(10,2) NOT NULL,
    "status" "CouponReservationStatus" NOT NULL DEFAULT 'active',
    "expires_at" TIMESTAMP(3) NOT NULL,
    "consumed_at" TIMESTAMP(3),
    "released_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "coupon_reservations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "coupon_reservations_order_id_key"
ON "coupon_reservations"("order_id");

CREATE INDEX "coupon_reservations_discount_id_status_expires_at_idx"
ON "coupon_reservations"("discount_id", "status", "expires_at");

CREATE INDEX "coupon_reservations_user_id_discount_id_status_idx"
ON "coupon_reservations"("user_id", "discount_id", "status");

CREATE INDEX "coupon_reservations_voucher_code_id_status_idx"
ON "coupon_reservations"("voucher_code_id", "status");

ALTER TABLE "coupon_reservations"
ADD CONSTRAINT "coupon_reservations_discount_id_fkey"
FOREIGN KEY ("discount_id") REFERENCES "discounts"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "coupon_reservations"
ADD CONSTRAINT "coupon_reservations_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "coupon_reservations"
ADD CONSTRAINT "coupon_reservations_order_id_fkey"
FOREIGN KEY ("order_id") REFERENCES "orders"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "coupon_reservations"
ADD CONSTRAINT "coupon_reservations_voucher_code_id_fkey"
FOREIGN KEY ("voucher_code_id") REFERENCES "discount_codes"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
