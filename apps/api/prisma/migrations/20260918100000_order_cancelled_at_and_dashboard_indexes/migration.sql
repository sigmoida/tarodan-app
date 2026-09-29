-- Dashboard yeniden tasarımı: dönem metrikleri artık OLAY damgalarından okunuyor
-- (status + created_at değil). İptalin kendi damgası yoktu; "bu dönemde kaç sipariş
-- iptal edildi" sorusu siparişin OLUŞTUĞU tarihe bakmak zorunda kalıyordu.
ALTER TABLE "orders" ADD COLUMN "cancelled_at" TIMESTAMP(3);

-- GERİYE DÖNÜK DOLDURMA YOK. `updated_at` iptalden sonraki her dokunuşla
-- (bildirim, fatura alanı, stok sentinel'ı) kaydığı için iptal anını temsil
-- etmiyor; uydurma bir damga yazmaktansa eski satırlar null bırakılır. Sonuç:
-- geçmiş dönemlerin "iptal edilen sipariş" sayısı yalnız bu göç sonrasındaki
-- iptalleri kapsar. Tüm zamanlar figürü de aynı sınırı taşır.

-- ── Dashboard sorgularının indeksleri ───────────────────────────────────────
-- Dönem metrikleri (olay damgası aralığı) + 24 saat içinde dolacak hazırlama süresi.
CREATE INDEX "orders_cancelled_at_idx" ON "orders"("cancelled_at");
CREATE INDEX "orders_delivered_at_idx" ON "orders"("delivered_at");
CREATE INDEX "orders_preparing_deadline_idx" ON "orders"("preparing_deadline");

-- payments tablosunda hiç indeks yoktu: ödenen sipariş metriği ve PayTR
-- dökümünde karşılığı olmayan ödeme alarmı ikisi de (status, paid_at) tarar.
CREATE INDEX "payments_status_paid_at_idx" ON "payments"("status", "paid_at");

-- users.created_at indekssizdi (yeni kullanıcı metriği); last_activity_at da öyle.
CREATE INDEX "users_created_at_idx" ON "users"("created_at");
CREATE INDEX "users_last_activity_at_idx" ON "users"("last_activity_at");

-- Yayına giren ilan metriği yayın damgasından okunur.
CREATE INDEX "products_published_at_idx" ON "products"("published_at");

-- shipments.status indekssizdi. Takılı kargo alarmı (status + kargo yaşı) ve
-- taşıyıcı kodu hiç oluşmamış gönderi kuyruğu (provider_tracking_id IS NULL + yaş).
CREATE INDEX "shipments_status_shipped_at_idx" ON "shipments"("status", "shipped_at");
CREATE INDEX "shipments_provider_tracking_id_created_at_idx" ON "shipments"("provider_tracking_id", "created_at");

-- Escrow bakiyesi + süresi geçmiş hold kuyruğu.
CREATE INDEX "payment_holds_status_release_at_idx" ON "payment_holds"("status", "release_at");

-- Kampanyadan bağımsız, süresi geçmiş kupon rezervasyonu taraması.
CREATE INDEX "coupon_reservations_status_expires_at_idx" ON "coupon_reservations"("status", "expires_at");

-- Çözümlenmemiş döküm satırı alarmı + ödeme eşleşmesi aramaları.
CREATE INDEX "paytr_statement_lines_match_status_resolved_at_idx" ON "paytr_statement_lines"("match_status", "resolved_at");
CREATE INDEX "paytr_statement_lines_payment_id_idx" ON "paytr_statement_lines"("payment_id");

-- Satıcı başvuru kuyruğu: incelenmeyi bekleyen GÜNCEL belgeler.
CREATE INDEX "seller_documents_status_is_current_idx" ON "seller_documents"("status", "is_current");

-- Açık takas itirazı kuyruğu.
CREATE INDEX "trade_disputes_resolved_at_idx" ON "trade_disputes"("resolved_at");

-- Dönem metrikleri: tamamlanan takas, satın alınan öne çıkarma, üyelik geliri, iade.
CREATE INDEX "trades_completed_at_idx" ON "trades"("completed_at");
CREATE INDEX "product_boosts_purchased_at_idx" ON "product_boosts"("purchased_at");
CREATE INDEX "membership_payments_status_created_at_idx" ON "membership_payments"("status", "created_at");
CREATE INDEX "refund_requests_refunded_at_idx" ON "refund_requests"("refunded_at");
