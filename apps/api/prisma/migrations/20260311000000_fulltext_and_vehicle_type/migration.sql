-- 1) Full-text search: GIN index on products (title + description)
--    Uses 'simple' config (universally available, word-level tokenization).
--    Can be upgraded to 'turkish' config later for stemming support.
CREATE INDEX IF NOT EXISTS products_fts_idx
  ON products
  USING GIN (to_tsvector('simple', coalesce(title, '') || ' ' || coalesce(description, '')));

-- 2) Trigram support for fuzzy / partial matching (requires pg_trgm extension)
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS products_title_trgm_idx ON products USING GIN (title gin_trgm_ops);

-- 3) Composite indexes for common filter patterns
CREATE INDEX IF NOT EXISTS products_status_category_idx ON products (status, category_id);
CREATE INDEX IF NOT EXISTS products_status_price_idx ON products (status, price);

-- 4) vehicle_type attribute group + attributes (idempotent)
INSERT INTO attribute_groups (id, name, slug, description, is_required, is_active, sort_order, created_at, updated_at)
VALUES (
  gen_random_uuid(),
  'Araç Türü',
  'vehicle_type',
  'Ürünün temsil ettiği araç kategorisi',
  false,
  true,
  3,
  now(),
  now()
)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO attributes (id, group_id, value, slug, display_value, sort_order, is_active, created_at, updated_at)
SELECT
  gen_random_uuid(),
  g.id,
  v.value,
  v.slug,
  v.display_value,
  v.sort_order,
  true,
  now(),
  now()
FROM (VALUES
  ('car',          'car',          'Araba',              1),
  ('motorcycle',   'motorcycle',   'Motosiklet',         2),
  ('motorsports',  'motorsports',  'Motorsports',        3),
  ('truck',        'truck',        'Ticari Araç',        4),
  ('emergency',    'emergency',    'Acil Durum Aracı',   5),
  ('construction', 'construction', 'İnşaat Aracı',       6),
  ('agriculture',  'agriculture',  'Tarım Aracı',        7),
  ('military',     'military',     'Askeri Araç',        8),
  ('ship',         'ship',         'Gemi / Tekne',       9),
  ('train',        'train',        'Tren',              10),
  ('aircraft',     'aircraft',     'Uçak / Helikopter', 11),
  ('bus',          'bus',          'Otobüs / Minibüs',  12)
) AS v(value, slug, display_value, sort_order)
CROSS JOIN attribute_groups g
WHERE g.slug = 'vehicle_type'
ON CONFLICT (group_id, slug) DO NOTHING;
