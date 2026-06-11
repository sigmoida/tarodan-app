-- Stok 0'a düşmüş ama statüsü "active" kalmış eski kayıtları tükendi (inactive)
-- statüsüne çek. Satıcı update akışı artık bunu otomatik yapıyor; bu backfill
-- mevcut tutarsız satırları düzeltir ki listelerde stok bitenler her zaman
-- en altta sıralansın (ORDER BY status / ES inStock bayrağı).
UPDATE "products"
SET "status" = 'inactive', "updated_at" = NOW()
WHERE "status" = 'active' AND "quantity" = 0;
