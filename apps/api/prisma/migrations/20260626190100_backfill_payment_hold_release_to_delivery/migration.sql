-- YENİ ESCROW KURALI BACKFILL: mevcut HELD hold'ların release_at'ini ödeme+7'den
-- teslim+15 (return 14 + grace 1) modeline taşı. released/cancelled hold'lara dokunma.
--   - Teslim edilmiş (delivered_at dolu): release_at = delivered_at + 15 gün.
--   - Henüz teslim edilmemiş: release_at = NULL (teslimde hesaplanacak) → erken payout engellenir.
-- Açık iadesi olan order'ların hold'ları zaten releaseHoldsDue guard'ıyla bloke; ek freeze gerekmez.

UPDATE "payment_holds" h
SET "release_at" = (o."delivered_at" + INTERVAL '15 days')
FROM "orders" o
WHERE h."order_id" = o."id"
  AND h."status" = 'held'
  AND o."delivered_at" IS NOT NULL;

UPDATE "payment_holds" h
SET "release_at" = NULL
FROM "orders" o
WHERE h."order_id" = o."id"
  AND h."status" = 'held'
  AND o."delivered_at" IS NULL;
