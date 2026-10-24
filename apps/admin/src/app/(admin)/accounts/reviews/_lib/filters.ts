import { dateRangeField, statusField } from "@/components/list/filters/fields";
import type { FilterField, TranslateFn } from "@/components/list/filters/types";
import { reviewStatusOptions } from "./types";

/** Both review tabs (product + seller) filter identically. */
export const reviewFilterFields = (t: TranslateFn): FilterField[] => [
  statusField(t, reviewStatusOptions(t)),
  dateRangeField(t),
];

/**
 * `id` has no control: a report deep link (`?tab=<kind>&id=<reviewId>`) narrows
 * the list to that one review, whatever its status, and opens its drawer.
 */
export const REVIEW_DEEP_LINK_FILTERS = { id: "" };
