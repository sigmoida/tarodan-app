-- Analitik ekranının yeniden yazımı: her rakam kendi OLAY damgasından okunur.
-- Üç geçiş damgasızdı, bu yüzden huniler `status` alanına bakmak zorundaydı —
-- "şu an reddedilmiş" ile "bu dönemde reddedildi" aynı şey değildir.

-- Takasın reddedildiği an. Ret aynı zamanda bir iptaldir ve `cancelled_at` de
-- yazılmaya devam eder; analitik "iptal" çıkışını `rejected_at IS NULL` ile
-- ayırır, yoksa aynı takas iki çıkışta birden sayılırdı.
ALTER TABLE "trades" ADD COLUMN "rejected_at" TIMESTAMP(3);

-- İlanın satıldığı an — ilan hunisinin son adımı ve "satışa kadar geçen süre"
-- ölçümünün ikinci ucu.
ALTER TABLE "products" ADD COLUMN "sold_at" TIMESTAMP(3);

-- Teklifin cevaplandığı an (kabul, ret veya karşı teklifle kapanış). Süre
-- dolması ve teklifi verenin geri çekmesi cevap DEĞİLDİR, damgalanmaz.
ALTER TABLE "offers" ADD COLUMN "responded_at" TIMESTAMP(3);

-- GERİYE DÖNÜK DOLDURMA YOK — `updated_at` geçişten sonraki her dokunuşla
-- kaydığı için o anı temsil etmiyor. Sonuç: bu göçten ÖNCEKİ ret/satış/cevap
-- olayları hiçbir dönemde görünmez; ekran bunu açıkça söyler.

-- ── Analitik sorgularının indeksleri ────────────────────────────────────────

-- Yeni damgalar.
CREATE INDEX "trades_rejected_at_idx" ON "trades"("rejected_at");
CREATE INDEX "products_sold_at_idx" ON "products"("sold_at");
CREATE INDEX "offers_responded_at_idx" ON "offers"("responded_at");

-- Takas hunisinin ilk iki adımı.
CREATE INDEX "trades_created_at_idx" ON "trades"("created_at");
CREATE INDEX "trades_accepted_at_idx" ON "trades"("accepted_at");

-- `orders` tablosunda `created_at` üzerinde hiç indeks yoktu; ilan hunisi ve
-- sipariş akışının dönem taramaları bu kolondan geçiyor.
CREATE INDEX "orders_created_at_idx" ON "orders"("created_at");

-- Kategori/marka/fiyat bandı kırılımları siparişten ürüne join eder; Prisma
-- yabancı anahtar için indeks üretmiyor ve `product_id` indekssizdi.
CREATE INDEX "orders_product_id_idx" ON "orders"("product_id");

-- Ödeme BAŞARISIZLIK oranı `paid_at`ten okunamaz: başarısız ödeme hiç
-- damgalanmaz. Deneme sayısı bu yüzden (status, created_at) taranır.
CREATE INDEX "payments_status_created_at_idx" ON "payments"("status", "created_at");

-- Teslim süresi (paidAt → shippedAt → deliveredAt) kargonun teslim anını
-- dönemle sınırlar.
CREATE INDEX "shipments_delivered_at_idx" ON "shipments"("delivered_at");

-- İade ORANI iade edilen tutarın değil, dönem içinde AÇILAN talebin sayısına
-- da bakar; `created_at` indekssizdi.
CREATE INDEX "refund_requests_created_at_idx" ON "refund_requests"("created_at");
