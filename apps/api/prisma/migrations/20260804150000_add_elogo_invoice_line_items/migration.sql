-- Çok kalemli fatura satırlarının snapshot'ı.
--
-- Platform satışı bir ÜRÜN faturasıdır: ürünün adı, adedi, kargo ve hizmet
-- bedeli ayrı satırlarda ve her satır kendi KDV oranıyla durmalıdır. Satırlar
-- kesim anında dondurulur ki fiyat/oran/ürün adı sonradan değişse bile gönderim
-- retry'ları aynı belgeyi üretsin.
--
-- Hizmet faturaları (komisyon, hizmet bedeli, üyelik, boost, takas) tek
-- kalemlidir; onlarda bu kolon NULL kalır ve eski davranış korunur.
ALTER TABLE "elogo_invoices" ADD COLUMN IF NOT EXISTS "line_items" JSONB;
