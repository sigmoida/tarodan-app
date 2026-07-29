ALTER TABLE "products"
  ADD COLUMN "model_code" TEXT,
  ADD COLUMN "color" TEXT,
  ADD COLUMN "is_boxed" BOOLEAN;

CREATE OR REPLACE FUNCTION compute_product_search_text(p_id TEXT)
RETURNS TEXT
LANGUAGE sql
STABLE
AS $$
  SELECT
    coalesce(p.title, '')
    || ' ' || coalesce(p.description, '')
    || ' ' || coalesce(p.model_code, '')
    || ' ' || coalesce(p.color, '')
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

CREATE OR REPLACE FUNCTION products_refresh_search_text()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.search_text :=
    coalesce(NEW.title, '')
    || ' ' || coalesce(NEW.description, '')
    || ' ' || coalesce(NEW.model_code, '')
    || ' ' || coalesce(NEW.color, '')
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

DROP TRIGGER IF EXISTS products_search_text_trg ON "products";
CREATE TRIGGER products_search_text_trg
BEFORE INSERT OR UPDATE OF title, description, model_code, color ON "products"
FOR EACH ROW
EXECUTE FUNCTION products_refresh_search_text();

UPDATE "products" SET search_text = compute_product_search_text(id);
