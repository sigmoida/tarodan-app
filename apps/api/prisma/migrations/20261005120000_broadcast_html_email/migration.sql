-- Toplu bildirimde e-postaya özel konu + HTML ve duyuru/pazarlama türü.
-- Yalnız ekleme: mevcut satırlar mailing_type = 'announcement' alır, e-posta
-- alanları NULL kalır (eski düz metin yolu aynen çalışır).
ALTER TABLE "scheduled_notifications"
  ADD COLUMN "email_subject" TEXT,
  ADD COLUMN "email_html" TEXT,
  ADD COLUMN "mailing_type" TEXT NOT NULL DEFAULT 'announcement';
