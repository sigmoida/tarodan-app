-- PSP ücret mutabakatı: durum-sorgu kesinti_tutari / net_tutar denetim günlüğüne yazılır.
ALTER TABLE "payment_provider_events" ADD COLUMN "provider_fee" DECIMAL(12,2);
ALTER TABLE "payment_provider_events" ADD COLUMN "provider_net" DECIMAL(12,2);
