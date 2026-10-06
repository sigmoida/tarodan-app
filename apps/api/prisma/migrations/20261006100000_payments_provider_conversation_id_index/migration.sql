-- PayTR "sipariş no" (merchant_oid) ile arama: Operasyon → Siparişler ekranı bir
-- PayTR id'sini `payments.provider_conversation_id` üzerinde TAM eşleşmeyle arar.
-- Bu kolonda yalnız tam-metin (GIN) indeksi vardı; eşitlik sorgusuna hizmet
-- etmez. CANLI VERİ GÜVENLİĞİ: yalnız indeks eklenir, veri değişmez.
--
-- NOT: düz CREATE INDEX, oluşurken `payments`a yazmayı kısa süre kilitler. Bu
-- repoda migration içinde CREATE INDEX CONCURRENTLY emsali yok (Prisma
-- migration'ı transaction içinde koşturur) ve tablo bugün küçük; mevcut
-- migration'larla aynı düz biçim korunur.
CREATE INDEX IF NOT EXISTS "payments_provider_conversation_id_idx"
  ON "payments" ("provider_conversation_id");
