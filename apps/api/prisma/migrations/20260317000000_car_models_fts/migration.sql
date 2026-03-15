-- Full-text search index for car_models (name) – used by autocomplete like brands/categories
CREATE INDEX IF NOT EXISTS car_models_fts_idx
  ON car_models
  USING GIN (to_tsvector('simple', coalesce(name, '')));
