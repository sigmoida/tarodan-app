# Saved searches

A signed-in user saves the product search they are looking at and runs it
again later from web or mobile. Plan: tarodan-ops
`plans/2026-10-21-gallery-trade-saved-searches.md` (section 2.3).

## Where things live

| What                                                                             | Where                                                                                                                    |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Allow-list, canonical form, empty check, default name, route params, error codes | `packages/types/src/saved-search.ts` (mobile vendors it into `src/types/`)                                               |
| Routes, limit, dedupe                                                            | `apps/api/src/modules/saved-search/`                                                                                     |
| Table                                                                            | `saved_searches` (`SavedSearch` in `schema.prisma`)                                                                      |
| Tier limit                                                                       | `MembershipTier.maxSavedSearches`, served as `maxSavedSearches` on `GET /membership/me/limits` and on the tier responses |

## Routes

All need a session (default closed).

| Route                                              | Answer                                                                         |
| -------------------------------------------------- | ------------------------------------------------------------------------------ |
| `GET /saved-searches?page&limit`                   | `{ data: SavedSearch[], meta }`, newest first; `limit` at most 100             |
| `POST /saved-searches` `{ name?, query, labels? }` | `201 SavedSearch`                                                              |
| `DELETE /saved-searches/:id`                       | `204`; `404 server.savedSearch.notFound` for a missing id or another user's id |

Refusals of `POST`, in this order:

1. An invalid filter value: `400`, the same validation as `GET /products`
   (`PickType(ProductQueryDto, SAVED_SEARCH_QUERY_KEYS)`, plus length caps).
2. Nothing but a sort left after canonicalising: `400 server.savedSearch.emptyQuery`.
3. The same canonical query already saved: `409 server.savedSearch.alreadySaved`,
   `errorCode: "SAVED_SEARCH_DUPLICATE"`. A duplicate needs no free slot, so it
   is reported before the limit.
4. The tier limit reached: `403 server.savedSearch.limitReached`,
   `errorCode: "SAVED_SEARCH_LIMIT"`, `limit` (403 like the listing limit).

Throttles: `POST` 20 per minute, `DELETE` 30 per minute.

## The stored query

`canonicalizeSavedSearchQuery` keeps only the allow-listed `GET /products`
filters, trims strings, drops empty values, `false` flags, `minPrice <= 0` and
`sortBy` values that are not an explicit sort, sorts and deduplicates `color`
and the `attrGroups` keys and slugs, and writes keys in sorted order. `page`
and `limit` are never stored. The stored query can be sent to
`GET /products` as it is; `savedSearchToRouteParams` turns it into the URL
params web `/listings` and mobile `/search` read (`attr.<group>=a,b`, plus
the display names from the labels).

`query_hash` is the SHA-256 hex of the JSON of the canonical query; the
unique index `(user_id, query_hash)` is the duplicate rule. Rows are
re-canonicalised on read, so a key later removed from the allow-list does not
reach clients.

`labels` are display names keyed by query key, a snapshot at save time (a
renamed category keeps the old label). `name` is the user's, else
`savedSearchDefaultName`, else `null` (clients show `savedSearch.untitled`).
There is no rename in v1.

## The limit under concurrency

The limit is read before the transaction (`getUserLimits`, the effective
tier; it may self-heal a past-due membership, which must not run under a
lock). The transaction then locks the user row `FOR NO KEY UPDATE`
(`lockActiveUserForQuota`), checks the duplicate, counts and inserts. Two
parallel saves of one user therefore run one after the other, and the second
sees the first one's row. The lock also refuses an account deleted meanwhile.

After a downgrade below the current count, existing searches stay and are
listed; new saves get `403` until the user is below the limit.

## Account deletion

`deleteAccount` anonymises the user row instead of deleting it, so the
relation's `onDelete: Cascade` never fires. The deletion transaction calls
`deleteSavedSearchesForAccountDeletion` instead.

## Privacy and tracing

The search text and the name are the user's own words: the service logs ids
and counts only. Requests carry the Sentry tag `feature: saved_search`. The
UAT refresh scrubs `name` as free text and `query`/`labels` as JSON
(`docs/UAT_REFRESH.md`).

## Not in v1

New-match notifications, rename, result counts and "last run" (tarodan-ops
`backlog.md`).
