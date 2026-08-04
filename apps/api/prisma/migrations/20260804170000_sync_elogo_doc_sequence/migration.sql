-- Belge numarası sayacını yazılmış faturaların ÖTESİNE taşı.
--
-- Seed, `elogo_invoices` satırlarını numaralarıyla birlikte yazıp
-- `elogo_doc_sequences` sayacını ilerletmeyi atlıyordu. Sonraki gerçek tahsis
-- 1'den başlıyor, unique `invoice_number` kısıtına takılıyor ve — artış aynı
-- SERIALIZABLE transaction'da olduğu için — sayaç artışı da geri sarıyor:
-- veritabanında hiçbir fatura kesilemeyen kalıcı bir kilit.
--
-- Seed artık sayacı kendisi ilerletiyor; bu migration ise ZATEN seed'lenmiş
-- veritabanlarını kurtarır. Numaradan önek ve yılı ayıklar, son 9 haneyi sıra
-- olarak okur ve sayacı her (önek, yıl) çifti için gözlenen en büyük değere
-- çeker. Sayaç zaten ileriyse GERİ ALINMAZ (GREATEST) — boşluksuz numara sırası
-- asla geri sarmamalıdır.
INSERT INTO "elogo_doc_sequences" ("id", "prefix", "year", "last_value")
SELECT gen_random_uuid(), "prefix", "year", "last_value"
FROM (
  SELECT
    substring("invoice_number" from 1 for length("invoice_number") - 13) AS "prefix",
    substring("invoice_number" from length("invoice_number") - 12 for 4)::int AS "year",
    MAX(substring("invoice_number" from length("invoice_number") - 8)::int) AS "last_value"
  FROM "elogo_invoices"
  WHERE "invoice_number" IS NOT NULL
    AND length("invoice_number") > 13
    -- Yalnız beklenen biçim: 4 hane yıl + 9 hane sıra ile bitenler.
    AND substring("invoice_number" from length("invoice_number") - 12) ~ '^[0-9]{13}$'
  GROUP BY 1, 2
) AS observed
ON CONFLICT ("prefix", "year") DO UPDATE
  SET "last_value" = GREATEST(
    "elogo_doc_sequences"."last_value",
    EXCLUDED."last_value"
  );
