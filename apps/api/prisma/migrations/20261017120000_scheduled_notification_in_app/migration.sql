-- Yönetici yayınında "Uygulama içi (zil)" artık açık bir kanal.
--
-- scheduled_notifications.in_app: zamanlanmış yayın gönderilirken zil satırı
-- yazılsın mı. Eski satırlar ve `inApp` göndermeyen çağıranlar her zaman zil
-- satırı yazıyordu; varsayılan true bu davranışı korur.
--
-- CANLI VERİ GÜVENLİĞİ: yalnız varsayılanlı kolon ekler; satır değiştirilmez.
ALTER TABLE "scheduled_notifications" ADD COLUMN "in_app" BOOLEAN NOT NULL DEFAULT true;
