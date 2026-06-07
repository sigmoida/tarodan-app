-- Buyer fee CommissionRule kaydi.
-- isActive=false: Faz 5'te super_admin tarafindan aktive edilecek.
-- buyerRate=3.0000: yuzde tam sayi (3 = %3). calculateCommission() bu degeri
-- subtotal ile carpip 100'e bolerek fee hesaplar.
-- Idempotent: ON CONFLICT DO NOTHING.

-- Not: "percentage" eski (legacy) alandir; fraksiyon olarak (0.03 = %3)
-- saklanir. NOT NULL kisitlamasi nedeniyle doldurmak gerekiyor; mevcut
-- calculateCommission() artik "buyer_rate" alanini kullaniyor ama uyumluluk
-- icin "percentage" da set ediyoruz.

INSERT INTO "commission_rules" (
  "id", "name", "rule_type", "applies_to",
  "percentage", "seller_rate", "buyer_rate",
  "buyer_min", "buyer_max",
  "is_active", "priority",
  "created_at", "updated_at"
)
VALUES (
  'buyer-fee-rule',
  'Platform Hizmet Bedeli (Alici)',
  'default',
  'BUYER',
  0.0300,
  NULL,
  3.0000,
  NULL,
  NULL,
  false,
  0,
  NOW(),
  NOW()
)
ON CONFLICT ("id") DO NOTHING;
