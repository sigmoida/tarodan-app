-- tsvector GIN indexes for all tables that use text search.
-- Replaces contains/ILIKE with index-backed tsvector/tsquery across the application.

-- ============================================================================
-- 1. User-facing tables (collections, brands, categories, manufacturers, users)
-- ============================================================================

-- Collections: name + description
CREATE INDEX IF NOT EXISTS collections_fts_idx
  ON collections
  USING GIN (to_tsvector('simple', name || ' ' || coalesce(description, '')));

-- Brands: name
CREATE INDEX IF NOT EXISTS brands_fts_idx
  ON brands
  USING GIN (to_tsvector('simple', name));

-- Categories: name
CREATE INDEX IF NOT EXISTS categories_fts_idx
  ON categories
  USING GIN (to_tsvector('simple', name));

-- Manufacturers: name
CREATE INDEX IF NOT EXISTS manufacturers_fts_idx
  ON manufacturers
  USING GIN (to_tsvector('simple', name));

-- Users: display_name (collection search by username, admin user search)
CREATE INDEX IF NOT EXISTS users_display_name_fts_idx
  ON users
  USING GIN (to_tsvector('simple', coalesce(display_name, '')));

-- Users: email (admin user search)
CREATE INDEX IF NOT EXISTS users_email_fts_idx
  ON users
  USING GIN (to_tsvector('simple', coalesce(email, '')));

-- ============================================================================
-- 2. Admin / operational tables
-- ============================================================================

-- Payments: provider_payment_id, provider_conversation_id
CREATE INDEX IF NOT EXISTS payments_fts_idx
  ON payments
  USING GIN (to_tsvector('simple', coalesce(provider_payment_id, '') || ' ' || coalesce(provider_conversation_id, '')));

-- Orders: order_number
CREATE INDEX IF NOT EXISTS orders_fts_idx
  ON orders
  USING GIN (to_tsvector('simple', coalesce(order_number, '')));

-- Discounts: name + code
CREATE INDEX IF NOT EXISTS discounts_fts_idx
  ON discounts
  USING GIN (to_tsvector('simple', coalesce(name, '') || ' ' || coalesce(code, '')));

-- Tags: name + description
CREATE INDEX IF NOT EXISTS tags_fts_idx
  ON tags
  USING GIN (to_tsvector('simple', name || ' ' || coalesce(description, '')));

-- Attribute groups: name + description
CREATE INDEX IF NOT EXISTS attribute_groups_fts_idx
  ON attribute_groups
  USING GIN (to_tsvector('simple', name || ' ' || coalesce(description, '')));

-- Attributes: value + display_value
CREATE INDEX IF NOT EXISTS attributes_fts_idx
  ON attributes
  USING GIN (to_tsvector('simple', coalesce(value, '') || ' ' || coalesce(display_value, '')));

-- Product ratings: title + review
CREATE INDEX IF NOT EXISTS product_ratings_fts_idx
  ON product_ratings
  USING GIN (to_tsvector('simple', coalesce(title, '') || ' ' || coalesce(review, '')));

-- Security logs: email + ip_address
CREATE INDEX IF NOT EXISTS security_logs_fts_idx
  ON security_logs
  USING GIN (to_tsvector('simple', coalesce(email, '') || ' ' || coalesce(ip_address, '')));

-- Email logs: "to" + subject
CREATE INDEX IF NOT EXISTS email_logs_fts_idx
  ON email_logs
  USING GIN (to_tsvector('simple', coalesce("to", '') || ' ' || coalesce(subject, '')));

-- Shipping methods: name + code (admin shipping search)
CREATE INDEX IF NOT EXISTS shipping_methods_fts_idx
  ON shipping_methods
  USING GIN (to_tsvector('simple', coalesce(name, '') || ' ' || coalesce(code, '')));

-- Shipping carriers: name + code
CREATE INDEX IF NOT EXISTS shipping_carriers_fts_idx
  ON shipping_carriers
  USING GIN (to_tsvector('simple', coalesce(name, '') || ' ' || coalesce(code, '')));

-- Tax regions: name
CREATE INDEX IF NOT EXISTS tax_regions_fts_idx
  ON tax_regions
  USING GIN (to_tsvector('simple', coalesce(name, '')));

-- Shipping zones: name
CREATE INDEX IF NOT EXISTS shipping_zones_fts_idx
  ON shipping_zones
  USING GIN (to_tsvector('simple', coalesce(name, '')));

-- Error logs: message (admin error log search)
CREATE INDEX IF NOT EXISTS error_logs_fts_idx
  ON error_logs
  USING GIN (to_tsvector('simple', coalesce(message, '')));

-- Ticket messages: message (admin support search)
CREATE INDEX IF NOT EXISTS ticket_messages_fts_idx
  ON ticket_messages
  USING GIN (to_tsvector('simple', coalesce(message, '')));

-- Refunds (payments with status=refunded are searched by failure_reason)
-- We reuse payments_fts_idx above. Additionally index orders for order_number (done above).
-- For refund-specific search we rely on payment join to order + buyer display_name,
-- which are already indexed via users_display_name_fts_idx and orders_fts_idx.
