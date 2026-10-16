-- Push teslimatı düzeltmeleri (yalnız şema, yalnız ekleme).
--
-- push_tokens.device_model: cihaz modeli ayrı kolona taşındı. `device_id`
-- artık kurulum başına sabit kimliktir (mobil ≥ 1.0.7); eski sürümlerin
-- yazdığı model adları yerinde kalır, cihaz yeni sürümle kaydolunca düzelir.
--
-- scheduled_notifications.data: zamanlanmış yönetici bildirimi de anında
-- gönderim gibi `data` (ör. derin bağlantı `link`) taşır. Eski satırlar NULL.
--
-- CANLI VERİ GÜVENLİĞİ: yalnız boş (NULL) kolon ekler; satır değiştirilmez.
ALTER TABLE "push_tokens" ADD COLUMN "device_model" TEXT;

ALTER TABLE "scheduled_notifications" ADD COLUMN "data" JSONB;
