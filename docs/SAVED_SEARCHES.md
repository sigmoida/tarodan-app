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
   The text filters take strings, as in a query string: an object or array
   there is a `400`, never turned into "[object Object]" by the implicit
   conversion. `attrGroups` takes its JSON text or the group -> slugs object
   (the same search either way); an array is a `400`.
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
the display names `category`, `brand`, `manufacturer` and `carModel` from the
labels, which the filter chips read next to the ids).

Price bounds travel as plain numbers with a dot (`minPrice=1250.5`), in the
stored query and in the route params. Both clients read a `minPrice` or
`maxPrice` param, and the typed field text, with the shared TL parser
(`parseTlAmount`), so a grouped "1.000" is refused and never read as 1 TL.
Empty, zero and refused text set no bound, and a run ignores that bound;
the two stored shapes this hits are a value with three decimals and a
`maxPrice` of 0. A bound above `SEARCH_PRICE_MAX` (`@tarodan/types`, the
search price bound; `GET /products` refuses a larger `maxPrice` with a 400)
is no bound either: the field shows `validation.maxValue` and the bound is
never sent, so a run of an older row holding one does not fail. The stored row and its hash do
not change.

`query_hash` is the SHA-256 hex of the JSON of the canonical query; the
unique index `(user_id, query_hash)` is the duplicate rule. Rows are
re-canonicalised on read, so a key later removed from the allow-list does not
reach clients.

**Changing the canonical form needs a re-hash.** Stored hashes are frozen at
save time. Removing a key from the allow-list, or any other change to
`canonicalizeSavedSearchQuery`, makes old rows read differently from their
hash: two rows of one user can then read as the same search, and a new save
of that search is not seen as a duplicate. Ship such a change with a
`maintenance/` script (dry run first, runbook entry in `docs/OPERATIONS.md`)
that re-canonicalises each row, recomputes `query_hash` and resolves the
rows of one user that now collide (keep the oldest).

`labels` are display names keyed by query key, a snapshot at save time (a
renamed category keeps the old label). `name` is the user's, else
`savedSearchDefaultName`, else `null` (clients show `savedSearch.untitled`).
There is no rename in v1.

## The limit under concurrency

The limit is read before the transaction (`MembershipService.getSavedSearchLimit`:
the effective tier only, by the same `isPremiumEntitled` rule as every other
gate, without the self-heal or the usage counts of `getUserLimits`, so a
database error stays a 5xx). A past-due member is on the free limit until
the membership heals. `GET /membership/me/limits` and `GET /membership/me`
run that heal and persist it, so the heal never makes the shown and the
enforced limit differ for longer than until the client's next read: a save
sent before any such read, after a paid renewal whose callback was lost, gets
the free `limit` in its `403` until a read or the reconciliation job heals
the membership. (A tier that really changes between a cached read and a save,
such as a period that ends, is enforced at once; the `403` carries the
enforced `limit`.)

The transaction then locks the user row `FOR NO KEY UPDATE`
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
