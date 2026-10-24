import { Transform } from "class-transformer";
import { parseListingParam } from "@tarodan/types";

/**
 * The one listing id normalisation (ADR 0017): a bare UUID or a listing URL
 * segment `<slug>-<uuid>` becomes the lower-case UUID; any other value comes
 * back unchanged, so the field's or route's own UUID check still rejects it
 * with its existing 400.
 *
 * Why: live app versions route a `/listings/<slug>-<uuid>` link to their
 * product screen and then send the whole segment wherever that screen sends a
 * product id (route params and request bodies). `ListingIdParam` (route
 * params) and `ListingIdField` (body fields) both go through this function.
 */
export function toListingId(value: unknown): unknown {
  return typeof value === "string"
    ? (parseListingParam(value) ?? value)
    : value;
}

/**
 * Body field holding a product id that may arrive as a listing URL segment.
 * Keep the field's UUID validator: this only normalises the value before
 * validation runs. `when` limits it to bodies where the id is a product id
 * (a report's `targetId` only when `type` is `product`).
 */
export function ListingIdField(
  when?: (body: Record<string, unknown>) => boolean,
): PropertyDecorator {
  return Transform(({ value, obj }) =>
    when && !when(obj as Record<string, unknown>) ? value : toListingId(value),
  );
}
