# Product Filtering Architecture

## Overview

Product listing filters are built on two engines:

- **Primary**: Elasticsearch (full-text search, fuzzy matching, n-gram, Turkish analyzers)
- **Fallback**: PostgreSQL via Prisma (index-friendly filters, attribute joins)

The shared filter logic lives in `apps/api/src/modules/product/helpers/build-product-where.ts`.

---

## Filter Categories

Every filter param falls into one of four types:

| Type | Examples | Backend behavior |
|---|---|---|
| **Text search** | `search` | ES: full-text on title/description/brand/category. PG fallback: `title/description contains` |
| **ID filters** | `categoryId`, `brandId`, `manufacturerId`, `carModelId`, `sellerId` | Exact match on indexed FK columns |
| **Flag/enum** | `condition`, `tradeOnly`, `discountOnly`, `preOrder`, `limited`, `set` | Exact match on indexed boolean/enum columns |
| **Range** | `minPrice`, `maxPrice` | `>=` / `<=` on indexed price column |

Special cases:

| Filter | How it works |
|---|---|
| `scale` | Matched via `ProductAttribute` join (group slug `scale`), NOT text search |
| `material` | Matched via `ProductAttribute` join (group slug `material`) |
| `vehicleType` | **ES only** – uses `multi_match` on title/description/category. Ignored in Postgres fallback (no DB column) |
| `brand` (text) | Fallback when `brandId` is not available; uses `brand.name equals` (not `contains`) |
| `manufacturer` (text) | Fallback when `manufacturerId` is not available; uses `manufacturer.name equals` |

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
               → buildProductWhere() → Prisma query with indexed filters
```

---

## Key Rules

1. **Never use `contains` on title/description for structured filters** (scale, vehicleType, brand, manufacturer). These must go through attribute joins or relation equality.

2. **Text search (`search` param) is the only filter that searches in title/description text.** In the primary path it uses Elasticsearch. In fallback it uses Prisma `contains` (acceptable for a fallback).

3. **Prefer ID-based filters over name-based.** Frontend sends `brandId` / `manufacturerId` / `categoryId` whenever available. Name-based params (`brand`, `manufacturer`) are fallbacks for when the user types in the search bar.

4. **vehicleType has no DB column/attribute.** It only works via ES text matching. If ES is down, vehicleType filtering is silently skipped.

5. **Sorting is always DB-level.** No in-memory scoring or pagination. Default sort (when no `sortBy` param): `viewCount desc, likeCount desc, createdAt desc`.

6. **discountOnly requires async service access** (DiscountService for campaign detection), so it's applied by the caller after `buildProductWhere()`.

---

## Files

| File | Role |
|---|---|
| `apps/api/src/modules/product/helpers/build-product-where.ts` | Shared Prisma where-clause builder |
| `apps/api/src/modules/product/dto/product-query.dto.ts` | Filter DTO with validation |
| `apps/api/src/modules/product/product.service.ts` | `findAll`, `findAllViaElasticsearch`, `findAllViaPostgres` |
| `apps/api/src/modules/search/search.service.ts` | `searchProducts` (ES), `fallbackSearch` (PG) |
| `apps/web/src/app/listings/page.tsx` | Filter state, URL sync, API calls |
| `apps/web/src/components/SidebarFilters.tsx` | Filter UI (sends IDs when available) |
| `apps/web/src/components/layout/Navbar.tsx` | Search autocomplete (links include IDs) |
