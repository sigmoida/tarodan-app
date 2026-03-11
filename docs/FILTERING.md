# Product Filtering Architecture

## Overview

Product listing filters are built on two engines:

- **Primary**: Elasticsearch (full-text search, fuzzy matching, n-gram, Turkish analyzers)
- **Fallback**: PostgreSQL via Prisma (tsvector/tsquery full-text, attribute joins, indexed filters)

The shared filter logic lives in `apps/api/src/modules/product/helpers/build-product-where.ts`.
Full-text search helper: `apps/api/src/modules/product/helpers/fulltext-search.ts`.

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

1. **Never use `contains` on title/description for structured filters** (scale, vehicleType, brand, manufacturer). These must go through attribute joins or relation equality.

2. **Text search (`search` param) is the only filter that searches in title/description text.** In the primary path it uses Elasticsearch. In fallback it uses `tsvector/tsquery` with GIN index (not ILIKE).

3. **Prefer ID-based filters over name-based.** Frontend sends `brandId` / `manufacturerId` / `categoryId` whenever available. Name-based params (`brand`, `manufacturer`) are fallbacks for when the user types in the search bar.

4. **vehicleType is a proper attribute group.** It works via `ProductAttribute` join in Postgres and `keyword` term filter in ES. Requires products to have `vehicle_type` attributes assigned.

5. **Sorting is always DB-level.** No in-memory scoring or pagination. Default sort (when no `sortBy` param): `viewCount desc, likeCount desc, createdAt desc`.

6. **discountOnly requires async service access** (DiscountService for campaign detection), so it's applied by the caller after `buildProductWhere()`.

---

## Database Indexes

| Index | Purpose |
|---|---|
| `products_fts_idx` (GIN) | Full-text search on `title + description` |
| `products_title_trgm_idx` (GIN, pg_trgm) | Trigram similarity on `title` for fuzzy search |
| `products_status_category_idx` | Composite index for status + category filtering |
| `products_status_price_idx` | Composite index for status + price range filtering |

---

## Files

| File | Role |
|---|---|
| `apps/api/src/modules/product/helpers/build-product-where.ts` | Shared Prisma where-clause builder |
| `apps/api/src/modules/product/helpers/fulltext-search.ts` | tsvector/tsquery + trigram search helper |
| `apps/api/src/modules/product/dto/product-query.dto.ts` | Filter DTO with validation |
| `apps/api/src/modules/product/product.service.ts` | `findAll`, `findAllViaElasticsearch`, `findAllViaPostgres` |
| `apps/api/src/modules/search/search.service.ts` | `searchProducts` (ES), `fallbackSearch` (PG) |
| `apps/web/src/app/listings/page.tsx` | Filter state, URL sync, API calls |
| `apps/web/src/components/SidebarFilters.tsx` | Filter UI (sends IDs when available) |
| `apps/web/src/components/layout/Navbar.tsx` | Search autocomplete (links include IDs) |
| `apps/api/prisma/migrations/20260311000000_fulltext_and_vehicle_type/migration.sql` | GIN indexes + vehicle_type attribute group |
