-- =============================================================================
-- Product search_text column + triggers
-- =============================================================================
--
-- Previously the products full-text search used an expression GIN index
-- on `to_tsvector(title || ' ' || description)`. That meant manufacturer-scoped
-- attribute selections (Hot Wheels Segment, Assortment, Rarity, Wheel Type,
-- Designer, Body Color, Color Finishes) were invisible to the search bar:
-- a collector typing "treasure hunt" would never get hits unless the seller
-- had also typed those words into the title.
--
-- This migration denormalizes searchable text into a stored `search_text`
-- column on products. The column is maintained by:
--   1) A BEFORE INSERT/UPDATE trigger on `products` (title/description changes)
--   2) An AFTER INSERT/UPDATE/DELETE trigger on `product_attributes` (attribute
--      add/remove flips the parent product's text).
--
-- The GIN index moves from the inline expression to the stored column.
-- =============================================================================

-- 1. Add the column (nullable; backfilled below before any constraint).
ALTER TABLE "products" ADD COLUMN "search_text" TEXT;

-- 2. Helper function: compute the full search blob for a given product.
--    Concatenates: title + description + (display_value or value) of every
--    active attribute linked to the product. Inactive attributes are excluded
--    so deactivating a slug also drops it from search.
CREATE OR REPLACE FUNCTION compute_product_search_text(p_id UUID)
RETURNS TEXT
LANGUAGE sql
STABLE
AS $$
  SELECT
    coalesce(p.title, '')
    || ' ' || coalesce(p.description, '')
    || ' ' || coalesce(
      (
        SELECT string_agg(coalesce(a.display_value, a.value), ' ')
        FROM "product_attributes" pa
        JOIN "attributes" a ON a.id = pa.attribute_id
        WHERE pa.product_id = p.id AND a.is_active = TRUE
      ),
      ''
    )
  FROM "products" p
  WHERE p.id = p_id;
$$;

-- 3. Trigger function for products: recompute on title/description change.
--    Reads NEW.title/NEW.description (not yet committed) but joins existing
--    product_attributes rows to include attribute text.
CREATE OR REPLACE FUNCTION products_refresh_search_text()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.search_text :=
    coalesce(NEW.title, '')
    || ' ' || coalesce(NEW.description, '')
    || ' ' || coalesce(
      (
        SELECT string_agg(coalesce(a.display_value, a.value), ' ')
        FROM "product_attributes" pa
        JOIN "attributes" a ON a.id = pa.attribute_id
        WHERE pa.product_id = NEW.id AND a.is_active = TRUE
      ),
      ''
    );
  RETURN NEW;
END;
$$;

CREATE TRIGGER products_search_text_trg
BEFORE INSERT OR UPDATE OF title, description ON "products"
FOR EACH ROW
EXECUTE FUNCTION products_refresh_search_text();

-- 4. Trigger function for product_attributes: when a slug is linked or unlinked,
--    refresh the parent product's search_text. Updates `search_text` column only,
--    so it does NOT re-fire the products trigger above (which watches
--    title/description only).
CREATE OR REPLACE FUNCTION product_attributes_refresh_product_search_text()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  affected_product_id UUID;
BEGIN
  IF TG_OP = 'DELETE' THEN
    affected_product_id := OLD.product_id;
  ELSE
    affected_product_id := NEW.product_id;
  END IF;

  UPDATE "products"
  SET search_text = compute_product_search_text(affected_product_id)
  WHERE id = affected_product_id;

  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER product_attributes_refresh_product_search_text_trg
AFTER INSERT OR UPDATE OR DELETE ON "product_attributes"
FOR EACH ROW
EXECUTE FUNCTION product_attributes_refresh_product_search_text();

-- 5. Backfill: compute search_text for every existing product. One-shot;
--    idempotent (safe to re-run via UPDATE on same data).
UPDATE "products" SET search_text = compute_product_search_text(id);

-- 6. New GIN index on the stored column. Replaces the expression-based index.
CREATE INDEX IF NOT EXISTS "products_search_text_fts_idx"
ON "products"
USING GIN (to_tsvector('simple', coalesce(search_text, '')));

-- 7. Drop the old expression index if present. The previous migration created
--    it as `products_fts_idx`. Safe-drop with IF EXISTS.
DROP INDEX IF EXISTS "products_fts_idx";

-- NOTE: Editing an Attribute's display_value (admin renames a slug) does NOT
-- propagate to existing products. That's a rare admin op; if needed, run:
--   UPDATE products SET search_text = compute_product_search_text(id)
--     WHERE id IN (SELECT product_id FROM product_attributes WHERE attribute_id = :attrId);
