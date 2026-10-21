/**
 * Pure serialiser for "Save this search": turns the live listings filters into
 * the `POST /saved-searches` body. Sits next to `buildListApiParams` and reuses
 * it, so a saved search is exactly the query the grid sends to `GET /products`.
 * The canonical form and the empty rule come from the shared contract
 * (`@tarodan/types`); nothing here duplicates the allow-list.
 */
import {
  canonicalizeSavedSearchLabels,
  canonicalizeSavedSearchQuery,
  isEmptySavedSearchQuery,
  savedSearchDefaultName,
  type CreateSavedSearchInput,
  type SavedSearchLabels,
  type SavedSearchQuery,
} from "@tarodan/types";
import { PAGE_LIMIT, buildListApiParams, type Filters } from "./params";

export interface SavedSearchDraft {
  /** Canonical query, in `GET /products` form. */
  query: SavedSearchQuery;
  /** Display names of the id-keyed filters (a snapshot at save time). */
  labels: SavedSearchLabels;
  /** True when there is nothing but a sort: such a search cannot be saved. */
  isEmpty: boolean;
  /** The automatic name (may be empty); prefills the name field. */
  defaultName: string;
}

/**
 * `filters` carries the display names (`category`, `brand`, `manufacturer`,
 * `carModel`) next to the ids; `categoryId` is the resolved id (a category can
 * arrive as a slug and be resolved to an id later).
 */
export function buildSavedSearchDraft(
  filters: Filters,
  resolvedCategoryId: string | undefined,
): SavedSearchDraft {
  // page and limit are not part of a search; the shared canonicaliser drops them.
  const query = canonicalizeSavedSearchQuery(
    buildListApiParams(filters, resolvedCategoryId, 1, PAGE_LIMIT),
  );
  const labels = canonicalizeSavedSearchLabels(
    {
      categoryId: filters.category,
      brandId: filters.brand,
      manufacturerId: filters.manufacturer,
      carModelId: filters.carModel,
    },
    query,
  );
  return {
    query,
    labels,
    isEmpty: isEmptySavedSearchQuery(query),
    defaultName: savedSearchDefaultName(query, labels),
  };
}

/** The request body for a draft; a blank name lets the API derive its own. */
export function toCreateSavedSearchInput(
  draft: Pick<SavedSearchDraft, "query" | "labels">,
  name: string,
): CreateSavedSearchInput {
  const trimmed = name.trim();
  return {
    ...(trimmed ? { name: trimmed } : {}),
    query: { ...draft.query },
    labels: draft.labels,
  };
}
