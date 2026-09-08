-- Belgede gösterilen İSKONTO toplamı (KDV hariç). Kesinti kolonları indirim
-- SONRASI tutarı taşıdığı için fatura indirimi hiç görmüyordu; artık brüt bedel
-- birim fiyat, indirim ayrı iskonto satırı olarak basılıyor. Kalem kırılımı
-- line_items'ta durur, bu kolon raporlama içindir (JSON ayrıştırmadan okunur).
ALTER TABLE "elogo_invoices" ADD COLUMN "discount_total" DECIMAL(10,2) NOT NULL DEFAULT 0;
