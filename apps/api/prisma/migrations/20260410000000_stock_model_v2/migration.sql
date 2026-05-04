-- Stock Model V2: reservedQuantity korunuyor, yeni OfferStatus + Offer cancelReason

-- 1. reserved_quantity yoksa ekle (idempotent)
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "reserved_quantity" INTEGER DEFAULT 0;

-- 2. payment_expired enum değeri ekle
ALTER TYPE "OfferStatus" ADD VALUE IF NOT EXISTS 'payment_expired';

-- 3. offers tablosuna cancel_reason kolonu ekle
ALTER TABLE "offers" ADD COLUMN IF NOT EXISTS "cancel_reason" TEXT;
