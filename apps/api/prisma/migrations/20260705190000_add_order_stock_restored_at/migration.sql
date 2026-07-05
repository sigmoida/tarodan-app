-- İptal edilen (ödenmiş) siparişte fiziksel stok geri yüklemesini PayTR iadesinden
-- ayırmak için idempotency marker. Stok yalnız bir kez geri yüklenir (cancel VEYA
-- processRefund hangisi önce çalışırsa); diğeri stockRestoredAt doluysa atlar.
ALTER TABLE "orders" ADD COLUMN "stock_restored_at" TIMESTAMP(3);
