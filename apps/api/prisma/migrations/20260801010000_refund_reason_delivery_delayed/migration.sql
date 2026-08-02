-- Gecikmeli teslimat, iade nedeni olarak da eklendi.
--
-- `delivery_delayed` yalnız OrderCancellationReason'da vardı. Kargoya teslim
-- edilmiş sipariş iptal edilemediği (iade talebine yönlendirildiği) için geç
-- teslimat iade tarafında karşılıksız kalıyor ve manuel incelemeye düşüyordu;
-- oysa kusur satıcıdadır.
ALTER TYPE "RefundReason" ADD VALUE IF NOT EXISTS 'delivery_delayed';
