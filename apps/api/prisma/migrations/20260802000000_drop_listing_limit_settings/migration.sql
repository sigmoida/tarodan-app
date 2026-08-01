-- İlan limitleri artık YALNIZCA üyelik katmanlarından (membership_tiers) gelir.
--
-- Bu dört ayar katman limitlerini eziyordu. Seed'de hiç oluşturulmuyorlardı; ama
-- admin Sistem Ayarları sayfası olmayan bir ayar için uydurma varsayılan
-- gösteriyor (premium/business için -1 = sınırsız) ve Kaydet aktif sekmenin TÜM
-- alanlarını yazıyordu. Sonuç: "İlan" sekmesinde herhangi bir kaydetme, premium
-- (200) ve business (1000) katmanlarını sessizce SINIRSIZ yapıyor, ücretsiz
-- katmanın ücretsiz hakkını 5'ten 10'a çıkarıyordu.
--
-- Override kodu kaldırıldı; bu DELETE sahada oluşmuş kalıntı satırları temizler
-- ve katman limitlerini gerçek değerlerine geri döndürür.
DELETE FROM "platform_settings" WHERE "setting_key" IN (
  'free_listing_limit',
  'basic_listing_limit',
  'premium_listing_limit',
  'business_listing_limit'
);
