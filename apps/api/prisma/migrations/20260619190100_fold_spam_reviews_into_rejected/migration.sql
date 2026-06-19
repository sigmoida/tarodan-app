-- "spam" durumu admin panelinden kaldırıldı (reddedildi ile işlevsel olarak aynıydı:
-- her ikisi de halka kapalı + ortalamaya dahil değil). Mevcut spam kayıtlarını
-- "rejected" altında topla ki UI'da statüsüz/etiketsiz kalmasınlar.
UPDATE "product_ratings" SET "status" = 'rejected' WHERE "status" = 'spam';
UPDATE "ratings" SET "status" = 'rejected' WHERE "status" = 'spam';
