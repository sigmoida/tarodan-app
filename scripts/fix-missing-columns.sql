-- Eksik sütunları ekle (Prisma şeması ile DB senkronizasyonu)

-- products tablosu: quantity, max_quantity_per_order
ALTER TABLE products ADD COLUMN IF NOT EXISTS quantity INTEGER;
ALTER TABLE products ADD COLUMN IF NOT EXISTS max_quantity_per_order INTEGER;

-- user_memberships tablosu: auto_renew
ALTER TABLE user_memberships ADD COLUMN IF NOT EXISTS auto_renew BOOLEAN NOT NULL DEFAULT false;
