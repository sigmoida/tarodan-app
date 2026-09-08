-- Belgenin insan-okur kaynak referansı (koli kodu, ör. PKG-000123). Kesim anında
-- snapshot'lanır: fatura üzerinde "Sipariş No" olarak görünür ve admin listesinde
-- belgeyi siparişe bağlar. UUID sourceId bu iş için okunabilir değildi.
ALTER TABLE "elogo_invoices" ADD COLUMN "source_reference" TEXT;
