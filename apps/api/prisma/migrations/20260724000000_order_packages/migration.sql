-- Satici-paketi ("cati"): bir CheckoutGroup icinde AYNI saticinin siparisleri tek
-- pakette birlesir. Kargo ucreti (ve Faz 2'de fiziksel Surat gonderisi) paket basinadir
-- -> 2 farkli satici = 2 paket = 2 kargo (urun sayisindan bagimsiz). Order.package_id
-- nullable: Faz 1'de grup/direct checkout doldurur, eski/diger yollar null kalabilir.

-- CreateTable
CREATE TABLE "order_packages" (
    "id" TEXT NOT NULL,
    "checkout_group_id" TEXT,
    "seller_id" TEXT NOT NULL,
    "buyer_id" TEXT NOT NULL,
    "shipping_cost" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "order_packages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "order_packages_checkout_group_id_idx" ON "order_packages"("checkout_group_id");
CREATE INDEX "order_packages_seller_id_idx" ON "order_packages"("seller_id");

-- AlterTable
ALTER TABLE "orders" ADD COLUMN "package_id" TEXT;

-- CreateIndex
CREATE INDEX "orders_package_id_idx" ON "orders"("package_id");

-- AddForeignKey
ALTER TABLE "order_packages" ADD CONSTRAINT "order_packages_checkout_group_id_fkey" FOREIGN KEY ("checkout_group_id") REFERENCES "checkout_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_package_id_fkey" FOREIGN KEY ("package_id") REFERENCES "order_packages"("id") ON DELETE SET NULL ON UPDATE CASCADE;
