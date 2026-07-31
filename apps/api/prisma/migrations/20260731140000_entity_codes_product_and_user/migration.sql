-- Varlık kodları (insan-okunur kalıcı kimlik): tek harf + 6 hane sıra no.
--   B = bireysel kullanıcı, K = kurumsal kullanıcı, U = ürün/ilan
-- İşlem referansları (ORD-/TKS-/RFD- ...) bu aileye dahil değildir; onlar
-- uygulama tarafında rastgele üretilir (bkz. common/helpers/code-prefixes.ts).

-- ---------------------------------------------------------------------------
-- 1) Ürün kodu: U + 6 hane
-- ---------------------------------------------------------------------------
-- Sayaç 10000'den başlar: lansmanda ilk ilan "U000001" olup katalog
-- büyüklüğünü dışarıya duyurmasın.
CREATE SEQUENCE IF NOT EXISTS product_code_seq START WITH 10000 INCREMENT BY 1 NO CYCLE;

CREATE OR REPLACE FUNCTION generate_product_code()
RETURNS TEXT
LANGUAGE SQL
VOLATILE
AS $$
  SELECT 'U' || lpad(nextval('product_code_seq')::text, 6, '0')
$$;

ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "product_code" TEXT;

-- Mevcut satırlar (dev/staging verisi) kayıt sırasına göre numaralanır.
UPDATE "products"
SET "product_code" = generate_product_code()
WHERE "product_code" IS NULL;

ALTER TABLE "products"
  ALTER COLUMN "product_code" SET DEFAULT generate_product_code(),
  ALTER COLUMN "product_code" SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "products_product_code_key" ON "products"("product_code");

-- ---------------------------------------------------------------------------
-- 2) Kullanıcı kodu: yalnızca B ve K kalıyor
-- ---------------------------------------------------------------------------
-- "S" (bireysel satıcı) öneki kaldırıldı: hesap tipi artık yalnızca bireysel
-- veya kurumsal. Satıcılık ayrı bir bayrak (is_seller), önek değil.
-- Sayaç B/K arasında ortak olduğu için numaralar globalde tekildir; önek
-- değişimi çakışma üretmez.
UPDATE "users"
SET "admin_code" = 'B' || substring("admin_code" FROM 2)
WHERE "admin_code" LIKE 'S%';

-- Ürün koduyla aynı gerekçe: üye sayısını sızdırmamak için 10000'den devam.
SELECT setval('user_admin_code_seq', GREATEST(nextval('user_admin_code_seq'), 10000), true);
