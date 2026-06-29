-- İade akışı tam otomatik: eski "pending_review" (ulaşılamayan/ölü) varsayılanı yerine
-- ulaşılabilir bir varsayılan. RefundRequest her zaman explicit status ile yaratıldığından
-- bu yalnız şema tutarlılığı içindir; mevcut satırları DEĞİŞTİRMEZ.
ALTER TABLE "refund_requests" ALTER COLUMN "status" SET DEFAULT 'approved';
