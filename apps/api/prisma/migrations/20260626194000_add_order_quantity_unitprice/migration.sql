-- Sepet çoklu-adet: Order.quantity (default 1 → mevcut tüm siparişler etkilenmez) + unitPrice.
ALTER TABLE "orders" ADD COLUMN "quantity" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "orders" ADD COLUMN "unit_price" DECIMAL(10,2);
