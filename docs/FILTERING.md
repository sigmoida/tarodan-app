# Search & Filtering Architecture

## Overview

**All text search across the application uses `tsvector/tsquery` with GIN indexes. `contains`/ILIKE is never used for search.**

Product listing filters are built on two engines:

- **Primary**: Elasticsearch (full-text search, fuzzy matching, n-gram, Turkish analyzers)
- **Fallback**: PostgreSQL via Prisma (tsvector/tsquery full-text, attribute joins, indexed filters)

The shared filter logic lives in `apps/api/src/modules/product/helpers/build-product-where.ts`.
Product full-text helper: `apps/api/src/modules/product/helpers/fulltext-search.ts`.
Generic full-text helper (all other tables): `apps/api/src/common/helpers/fulltext-search.ts`.

---

## Filter Categories

Every filter param falls into one of five types:

| Type | Examples | Backend behavior |
|---|---|---|
| **Text search** | `search` | ES: full-text on title/description/brand/category. PG fallback: `tsvector/tsquery` with GIN index + trigram similarity fallback |
| **ID filters** | `categoryId`, `brandId`, `manufacturerId`, `carModelId`, `sellerId` | Exact match on indexed FK columns |
| **Attribute filters** | `scale`, `material`, `vehicleType` | Matched via `ProductAttribute` join (by attribute group slug) |
| **Flag/enum** | `condition`, `tradeOnly`, `discountOnly`, `preOrder`, `limited`, `set` | Exact match on indexed boolean/enum columns |
| **Range** | `minPrice`, `maxPrice` | `>=` / `<=` on indexed price column |

### Attribute-based filters

| Filter | Attribute Group Slug | How it works |
|---|---|---|
| `scale` | `scale` | Matches `attribute.value` or `attribute.slug` within the "scale" group |
| `material` | `material` | Matches `attribute.slug` within the "material" group |
| `vehicleType` | `vehicle_type` | Matches `attribute.slug` within the "vehicle_type" group. ES uses `keyword` term filter. |

### Name fallback filters

| Filter | How it works |
|---|---|
| `brand` (text) | Fallback when `brandId` is not available; uses `brand.name equals` (not `contains`) |
| `manufacturer` (text) | Fallback when `manufacturerId` is not available; uses `manufacturer.name equals` |

---

## Full-Text Search (Postgres)

When ES is unavailable, Postgres full-text search is used:

1. **Primary**: `to_tsvector('simple', title || description) @@ to_tsquery('simple', query)` — uses GIN index `products_fts_idx`
2. **Prefix matching**: Last word uses `:*` prefix operator for autocomplete-like behavior
3. **Trigram fallback**: If tsvector returns no results, `pg_trgm` similarity + ILIKE is used (index: `products_title_trgm_idx`)

The search returns ranked product IDs which are then passed to `buildProductWhere` via the `fulltextIds` option.

---

## Data Flow

```
Frontend (URL params)
  → buildListParams() in page.tsx
    → GET /products?categoryId=...&brandId=...&search=...
      → ProductQueryDto (validated by class-validator)
        → ProductService.findAll()
          ├─ ES available + has search/discountOnly → findAllViaElasticsearch()
          │    → SearchService.searchProductIds() → ES query → hydrate from Prisma
          └─ Otherwise → findAllViaPostgres()
               ├─ search? → fulltextProductSearch() → product IDs (tsvector/tsquery)
               └─ buildProductWhere({ fulltextIds }) → Prisma query with indexed filters
```

---

## Elasticsearch Index

The `products` ES index includes these keyword fields for structured filtering:

| ES Field | Source | Query type |
|---|---|---|
| `scale` | ProductAttribute (group: scale) | `term` filter |
| `material` | ProductAttribute (group: material) | `term` filter |
| `vehicleType` | ProductAttribute (group: vehicle_type) | `term` filter |
| `brandName.keyword` | Brand relation | `term` filter |
| `manufacturerName.keyword` | Manufacturer relation | `term` filter |
| `categoryName.keyword` | Category relation | `term` filter |
| `condition` | Product column | `term` filter |

---

## Key Rules

1. **`contains`/ILIKE is never used for text search anywhere in the codebase.** All search uses `tsvector/tsquery` + GIN index. This applies to products, collections, autocomplete, admin panels, discounts, and GraphQL.

2. **Text search pattern**: Helper returns matching IDs → Prisma hydrates with `id: { in: ids }` + other filters.

3. **Prefer ID-based filters over name-based.** Frontend sends `brandId` / `manufacturerId` / `categoryId` whenever available. Name-based params (`brand`, `manufacturer`) are fallbacks for when the user types in the search bar.

4. **vehicleType is a proper attribute group.** It works via `ProductAttribute` join in Postgres and `keyword` term filter in ES. Requires products to have `vehicle_type` attributes assigned.

5. **Sorting is always DB-level.** No in-memory scoring or pagination. Default sort (when no `sortBy` param): `viewCount desc, likeCount desc, createdAt desc`.

6. **discountOnly requires async service access** (DiscountService for campaign detection), so it's applied by the caller after `buildProductWhere()`.

---

## Database Indexes (Full-Text)

| Index | Table | Columns | Purpose |
|---|---|---|---|
| `products_fts_idx` | products | title + description | Product search |
| `products_title_trgm_idx` | products | title (pg_trgm) | Fuzzy/partial match fallback |
| `collections_fts_idx` | collections | name + description | Collection search |
| `brands_fts_idx` | brands | name | Brand autocomplete |
| `categories_fts_idx` | categories | name | Category autocomplete |
| `manufacturers_fts_idx` | manufacturers | name | Manufacturer autocomplete |
| `users_display_name_fts_idx` | users | display_name | Collection "search by user" |
| `users_email_fts_idx` | users | email | Admin user search |
| `payments_fts_idx` | payments | provider IDs | Admin payment search |
| `orders_fts_idx` | orders | order_number | Admin order search |
| `discounts_fts_idx` | discounts | name + code | Discount/coupon search |
| `tags_fts_idx` | tags | name + description | Admin tag search |
| `attribute_groups_fts_idx` | attribute_groups | name + description | Admin attr group search |
| `attributes_fts_idx` | attributes | value + display_value | Admin attribute search |
| `product_ratings_fts_idx` | product_ratings | title + review | Admin review search |
| `security_logs_fts_idx` | security_logs | email + ip_address | Admin security log search |
| `email_logs_fts_idx` | email_logs | to + subject | Admin email log search |
| `error_logs_fts_idx` | error_logs | message | Admin error log search |
| `ticket_messages_fts_idx` | ticket_messages | message | Admin support search |
| `shipping_methods_fts_idx` | shipping_methods | name + code | Admin shipping method search |
| `shipping_carriers_fts_idx` | shipping_carriers | name + code | Admin shipping carrier search |
| `shipping_zones_fts_idx` | shipping_zones | name | Admin shipping zone search |
| `tax_regions_fts_idx` | tax_regions | name | Admin tax region search |

### Other Indexes

| Index | Purpose |
|---|---|
| `products_status_category_idx` | Composite index for status + category filtering |
| `products_status_price_idx` | Composite index for status + price range filtering |

---

## Files

| File | Role |
|---|---|
| `apps/api/src/common/helpers/fulltext-search.ts` | Generic tsvector search helper (all tables) |
| `apps/api/src/modules/product/helpers/build-product-where.ts` | Shared Prisma where-clause builder |
| `apps/api/src/modules/product/helpers/fulltext-search.ts` | Product-specific tsvector + trigram search |
| `apps/api/src/modules/product/dto/product-query.dto.ts` | Filter DTO with validation |
| `apps/api/src/modules/product/product.service.ts` | `findAll`, `findAllViaElasticsearch`, `findAllViaPostgres` |
| `apps/api/src/modules/search/search.service.ts` | `searchProducts` (ES), `fallbackSearch` (PG), autocomplete |
| `apps/api/src/modules/collection/collection.service.ts` | Collection browse with tsvector fallback |
| `apps/api/src/modules/discount/discount.service.ts` | Discount listing with tsvector search |
| `apps/api/src/modules/admin/admin.service.ts` | All admin listings with tsvector search |
| `apps/api/src/modules/graphql/resolvers/product.resolver.ts` | GraphQL product query with tsvector search |
| `apps/web/src/app/listings/page.tsx` | Filter state, URL sync, API calls |
| `apps/web/src/components/SidebarFilters.tsx` | Filter UI (sends IDs when available) |
| `apps/web/src/components/layout/Navbar.tsx` | Search autocomplete (links include IDs) |
| `apps/api/prisma/migrations/20260311000000_fulltext_and_vehicle_type/migration.sql` | Phase 1: product GIN indexes + vehicle_type |
| `apps/api/prisma/migrations/20260312000000_fulltext_all_tables/migration.sql` | Phase 2: all remaining table GIN indexes |
