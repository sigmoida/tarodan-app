import { createHash } from "crypto";
import type { SavedSearchQuery } from "@tarodan/types";

/**
 * The dedupe key of a saved search: SHA-256 hex of the JSON of its canonical
 * query. `canonicalizeSavedSearchQuery` writes keys in sorted order and
 * normalises every value, so equal searches give equal text and equal hashes.
 * Pass only a canonical query.
 */
export function savedSearchQueryHash(query: SavedSearchQuery): string {
  return createHash("sha256").update(JSON.stringify(query)).digest("hex");
}
