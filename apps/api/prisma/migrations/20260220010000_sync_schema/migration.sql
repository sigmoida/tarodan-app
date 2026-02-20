-- =============================================
-- 1. CREATE MISSING TABLES
-- =============================================

-- PaymentMethod
CREATE TABLE "payment_methods" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "card_brand" TEXT NOT NULL,
    "last_four" TEXT NOT NULL,
    "expiry_month" INTEGER NOT NULL,
    "expiry_year" INTEGER NOT NULL,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "token_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "payment_methods_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "payment_methods_user_id_idx" ON "payment_methods"("user_id");

-- CarModel
CREATE TABLE "car_models" (
    "id" TEXT NOT NULL,
    "brand_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "image" TEXT,
    "description" TEXT,
    "year_start" INTEGER,
    "year_end" INTEGER,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "car_models_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "car_models_slug_key" ON "car_models"("slug");
CREATE INDEX "car_models_brand_id_idx" ON "car_models"("brand_id");
CREATE INDEX "car_models_is_active_idx" ON "car_models"("is_active");
CREATE INDEX "car_models_sort_order_idx" ON "car_models"("sort_order");

-- ProductLike
CREATE TABLE "product_likes" (
    "id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "product_likes_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "product_likes_product_id_user_id_key" ON "product_likes"("product_id", "user_id");
CREATE INDEX "product_likes_product_id_idx" ON "product_likes"("product_id");
CREATE INDEX "product_likes_user_id_idx" ON "product_likes"("user_id");

-- Tag
CREATE TABLE "tags" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "color" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "usage_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "tags_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "tags_name_key" ON "tags"("name");
CREATE UNIQUE INDEX "tags_slug_key" ON "tags"("slug");
CREATE INDEX "tags_is_active_idx" ON "tags"("is_active");
CREATE INDEX "tags_usage_count_idx" ON "tags"("usage_count" DESC);

-- ProductTag
CREATE TABLE "product_tags" (
    "id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "tag_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "product_tags_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "product_tags_product_id_tag_id_key" ON "product_tags"("product_id", "tag_id");
CREATE INDEX "product_tags_product_id_idx" ON "product_tags"("product_id");
CREATE INDEX "product_tags_tag_id_idx" ON "product_tags"("tag_id");

-- AttributeGroup
CREATE TABLE "attribute_groups" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "is_required" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "attribute_groups_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "attribute_groups_name_key" ON "attribute_groups"("name");
CREATE UNIQUE INDEX "attribute_groups_slug_key" ON "attribute_groups"("slug");
CREATE INDEX "attribute_groups_is_active_idx" ON "attribute_groups"("is_active");
CREATE INDEX "attribute_groups_sort_order_idx" ON "attribute_groups"("sort_order");

-- Attribute
CREATE TABLE "attributes" (
    "id" TEXT NOT NULL,
    "group_id" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "display_value" TEXT,
    "color" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "attributes_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "attributes_group_id_slug_key" ON "attributes"("group_id", "slug");
CREATE INDEX "attributes_group_id_idx" ON "attributes"("group_id");
CREATE INDEX "attributes_is_active_idx" ON "attributes"("is_active");

-- ProductAttribute
CREATE TABLE "product_attributes" (
    "id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "attribute_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "product_attributes_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "product_attributes_product_id_attribute_id_key" ON "product_attributes"("product_id", "attribute_id");
CREATE INDEX "product_attributes_product_id_idx" ON "product_attributes"("product_id");
CREATE INDEX "product_attributes_attribute_id_idx" ON "product_attributes"("attribute_id");

-- ErrorLog
CREATE TABLE "error_logs" (
    "id" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "stack_trace" TEXT,
    "source" TEXT NOT NULL,
    "endpoint" TEXT,
    "user_id" TEXT,
    "request_id" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "error_logs_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "error_logs_severity_idx" ON "error_logs"("severity");
CREATE INDEX "error_logs_source_idx" ON "error_logs"("source");
CREATE INDEX "error_logs_created_at_idx" ON "error_logs"("created_at");

-- SecurityLog
CREATE TABLE "security_logs" (
    "id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "user_id" TEXT,
    "email" TEXT,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "location" TEXT,
    "details" JSONB,
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "resolved_by" TEXT,
    "resolved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "security_logs_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "security_logs_event_type_idx" ON "security_logs"("event_type");
CREATE INDEX "security_logs_severity_idx" ON "security_logs"("severity");
CREATE INDEX "security_logs_ip_address_idx" ON "security_logs"("ip_address");
CREATE INDEX "security_logs_user_id_idx" ON "security_logs"("user_id");
CREATE INDEX "security_logs_created_at_idx" ON "security_logs"("created_at");

-- EmailLog
CREATE TABLE "email_logs" (
    "id" TEXT NOT NULL,
    "message_id" TEXT,
    "to" TEXT NOT NULL,
    "from" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "template" TEXT,
    "status" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "user_id" TEXT,
    "error_message" TEXT,
    "sent_at" TIMESTAMP(3),
    "delivered_at" TIMESTAMP(3),
    "bounced_at" TIMESTAMP(3),
    "opened_at" TIMESTAMP(3),
    "clicked_at" TIMESTAMP(3),
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "email_logs_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "email_logs_to_idx" ON "email_logs"("to");
CREATE INDEX "email_logs_user_id_idx" ON "email_logs"("user_id");
CREATE INDEX "email_logs_status_idx" ON "email_logs"("status");
CREATE INDEX "email_logs_template_idx" ON "email_logs"("template");
CREATE INDEX "email_logs_created_at_idx" ON "email_logs"("created_at");

-- UserFollow
CREATE TABLE "user_follows" (
    "id" TEXT NOT NULL,
    "follower_id" TEXT NOT NULL,
    "following_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "user_follows_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "user_follows_follower_id_following_id_key" ON "user_follows"("follower_id", "following_id");
CREATE INDEX "user_follows_follower_id_idx" ON "user_follows"("follower_id");
CREATE INDEX "user_follows_following_id_idx" ON "user_follows"("following_id");

-- ShippingMethod
CREATE TABLE "shipping_methods" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "shipping_methods_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "shipping_methods_name_key" ON "shipping_methods"("name");
CREATE UNIQUE INDEX "shipping_methods_code_key" ON "shipping_methods"("code");
CREATE INDEX "shipping_methods_is_active_idx" ON "shipping_methods"("is_active");

-- ShippingCarrier
CREATE TABLE "shipping_carriers" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "logo" TEXT,
    "tracking_url" TEXT,
    "api_endpoint" TEXT,
    "api_key" TEXT,
    "api_secret" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "supports_labels" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "shipping_carriers_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "shipping_carriers_name_key" ON "shipping_carriers"("name");
CREATE UNIQUE INDEX "shipping_carriers_code_key" ON "shipping_carriers"("code");
CREATE INDEX "shipping_carriers_is_active_idx" ON "shipping_carriers"("is_active");

-- ShippingZone
CREATE TABLE "shipping_zones" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "countries" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "regions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "cities" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "shipping_zones_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "shipping_zones_is_active_idx" ON "shipping_zones"("is_active");

-- ShippingRate
CREATE TABLE "shipping_rates" (
    "id" TEXT NOT NULL,
    "zone_id" TEXT NOT NULL,
    "method_id" TEXT NOT NULL,
    "carrier_id" TEXT NOT NULL,
    "base_price" DECIMAL(10,2) NOT NULL,
    "price_per_kg" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "free_shipping_min" DECIMAL(10,2),
    "min_delivery_days" INTEGER NOT NULL,
    "max_delivery_days" INTEGER NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "shipping_rates_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "shipping_rates_zone_id_method_id_carrier_id_key" ON "shipping_rates"("zone_id", "method_id", "carrier_id");
CREATE INDEX "shipping_rates_is_active_idx" ON "shipping_rates"("is_active");

-- ScheduledNotification
CREATE TABLE "scheduled_notifications" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "channels" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "target_type" TEXT NOT NULL,
    "target_data" JSONB,
    "scheduled_for" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "sent_at" TIMESTAMP(3),
    "sent_count" INTEGER NOT NULL DEFAULT 0,
    "error_count" INTEGER NOT NULL DEFAULT 0,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "scheduled_notifications_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "scheduled_notifications_scheduled_for_status_idx" ON "scheduled_notifications"("scheduled_for", "status");
CREATE INDEX "scheduled_notifications_status_idx" ON "scheduled_notifications"("status");

-- =============================================
-- 2. ADD MISSING COLUMNS TO EXISTING TABLES
-- =============================================

-- Products
ALTER TABLE "products" ADD COLUMN "brand_id" TEXT;
ALTER TABLE "products" ADD COLUMN "car_model_id" TEXT;
ALTER TABLE "products" ADD COLUMN "bundle_size" INTEGER;
ALTER TABLE "products" ADD COLUMN "edition_number" TEXT;
ALTER TABLE "products" ADD COLUMN "edition_total" INTEGER;
ALTER TABLE "products" ADD COLUMN "is_limited" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "products" ADD COLUMN "is_preorder" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "products" ADD COLUMN "is_set" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "products" ADD COLUMN "release_date" TIMESTAMP(3);

-- Brands
ALTER TABLE "brands" ADD COLUMN "country" TEXT;
ALTER TABLE "brands" ADD COLUMN "founded_year" INTEGER;

-- Collections
ALTER TABLE "collections" ADD COLUMN "is_featured" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "collections" ADD COLUMN "category_id" TEXT;

-- User memberships
ALTER TABLE "user_memberships" ADD COLUMN "auto_renew" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "user_memberships" ADD COLUMN "payment_method_id" TEXT;

-- Discounts
ALTER TABLE "discounts" ADD COLUMN "buy_quantity" INTEGER;
ALTER TABLE "discounts" ADD COLUMN "get_quantity" INTEGER;
ALTER TABLE "discounts" ADD COLUMN "is_flash_sale" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "discounts" ADD COLUMN "min_quantity" INTEGER DEFAULT 1;

-- =============================================
-- 3. ADD INDEXES FOR NEW COLUMNS
-- =============================================
CREATE INDEX "products_brand_id_idx" ON "products"("brand_id");
CREATE INDEX "products_car_model_id_idx" ON "products"("car_model_id");
CREATE INDEX "products_is_preorder_idx" ON "products"("is_preorder");
CREATE INDEX "products_is_limited_idx" ON "products"("is_limited");
CREATE INDEX "products_is_set_idx" ON "products"("is_set");
CREATE INDEX "collections_category_id_idx" ON "collections"("category_id");

-- =============================================
-- 4. ADD FOREIGN KEYS
-- =============================================
ALTER TABLE "payment_methods" ADD CONSTRAINT "payment_methods_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "car_models" ADD CONSTRAINT "car_models_brand_id_fkey" FOREIGN KEY ("brand_id") REFERENCES "brands"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "product_likes" ADD CONSTRAINT "product_likes_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "product_likes" ADD CONSTRAINT "product_likes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "product_tags" ADD CONSTRAINT "product_tags_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "product_tags" ADD CONSTRAINT "product_tags_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "attributes" ADD CONSTRAINT "attributes_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "attribute_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "product_attributes" ADD CONSTRAINT "product_attributes_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "product_attributes" ADD CONSTRAINT "product_attributes_attribute_id_fkey" FOREIGN KEY ("attribute_id") REFERENCES "attributes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_follows" ADD CONSTRAINT "user_follows_follower_id_fkey" FOREIGN KEY ("follower_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_follows" ADD CONSTRAINT "user_follows_following_id_fkey" FOREIGN KEY ("following_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "shipping_rates" ADD CONSTRAINT "shipping_rates_zone_id_fkey" FOREIGN KEY ("zone_id") REFERENCES "shipping_zones"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "shipping_rates" ADD CONSTRAINT "shipping_rates_method_id_fkey" FOREIGN KEY ("method_id") REFERENCES "shipping_methods"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "shipping_rates" ADD CONSTRAINT "shipping_rates_carrier_id_fkey" FOREIGN KEY ("carrier_id") REFERENCES "shipping_carriers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "products" ADD CONSTRAINT "products_brand_id_fkey" FOREIGN KEY ("brand_id") REFERENCES "brands"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "products" ADD CONSTRAINT "products_car_model_id_fkey" FOREIGN KEY ("car_model_id") REFERENCES "car_models"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "collections" ADD CONSTRAINT "collections_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;
