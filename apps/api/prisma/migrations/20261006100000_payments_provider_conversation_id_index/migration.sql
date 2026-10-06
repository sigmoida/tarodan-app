-- PayTR "sipariş no" (merchant_oid) ile arama: Operasyon → Siparişler ekranı bir
-- PayTR id'sini `payments.provider_conversation_id` üzerinde TAM eşleşmeyle arar.
-- Bu kolonda yalnız tam-metin (GIN) indeksi vardı; eşitlik sorgusuna hizmet
-- etmez. CANLI VERİ GÜVENLİĞİ: yalnız indeks eklenir, veri değişmez.
CREATE INDEX IF NOT EXISTS "payments_provider_conversation_id_idx"
  ON "payments" ("provider_conversation_id");
