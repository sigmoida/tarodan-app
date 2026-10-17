-- AlterEnum: AdPosition = topbar | header | footer | inline | popup.
--
-- `topbar` YENİ: her web sayfasının en üstündeki ince şerit. Şerit eskiden
-- `header` pozisyonundan okunuyordu; `header` artık site başlığının altındaki
-- büyük banner'dır. `sidebar` KALKIYOR: web'de hiçbir sayfa onu render
-- etmiyordu, admin'de seçilebilir olması "yayında ama görünmüyor" reklam
-- üretiyordu.
--
-- Mevcut `sidebar` satırları silinmez (tık/gösterim geçmişi korunur), `inline`'a
-- taşınır VE pasife alınır: inline ürün ızgarasının satır aralarında görünür —
-- hiç görünmemiş bir reklamın göç sonrası habersizce yayına girmesini
-- istemiyoruz. Admin gözden geçirip yeniden açar.
--
-- `header` satırları olduğu gibi kalır; üst şerit olarak kullanılanlar admin
-- tarafından `topbar` olarak yeniden oluşturulmalı (operasyon notu).
--
-- `ADD VALUE` yerine tip yeniden kuruluyor: Postgres'te değer kaldırmanın tek
-- yolu bu. Kalıp: 20260619185258_remove_product_draft_status.
BEGIN;
UPDATE "advertisements"
   SET "position" = 'inline', "is_active" = false, "updated_at" = NOW()
 WHERE "position" = 'sidebar';
CREATE TYPE "AdPosition_new" AS ENUM ('topbar', 'header', 'footer', 'inline', 'popup');
ALTER TABLE "advertisements" ALTER COLUMN "position" DROP DEFAULT;
ALTER TABLE "advertisements" ALTER COLUMN "position" TYPE "AdPosition_new" USING ("position"::text::"AdPosition_new");
ALTER TYPE "AdPosition" RENAME TO "AdPosition_old";
ALTER TYPE "AdPosition_new" RENAME TO "AdPosition";
DROP TYPE "AdPosition_old";
ALTER TABLE "advertisements" ALTER COLUMN "position" SET DEFAULT 'header';
COMMIT;
