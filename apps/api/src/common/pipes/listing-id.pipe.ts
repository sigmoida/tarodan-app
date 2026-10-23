import {
  ArgumentMetadata,
  Param,
  ParseUUIDPipe,
  PipeTransform,
} from "@nestjs/common";
import { parseListingParam } from "@tarodan/types";

/**
 * Listing id route param that also takes the listing URL segment
 * `<slug>-<uuid>` (ADR 0017) and resolves it to the UUID; the slug is ignored.
 *
 * Why: the live apps route `/listings/<segment>` deep links to their product
 * screen and send the whole segment to the API (`GET /products/<segment>`,
 * reviews, similar, view). Taking the trailing UUID here keeps those links
 * opening on app versions that do not parse the segment themselves.
 *
 * Anything else goes to `uuidPipe` unchanged, so a bare UUID behaves as before
 * and garbage fails with the route's existing 400 (same status, message and
 * catalog key). Read routes only: write routes keep a bare-UUID contract.
 */
export class ListingIdPipe implements PipeTransform<unknown, Promise<string>> {
  constructor(private readonly uuidPipe: ParseUUIDPipe = new ParseUUIDPipe()) {}

  transform(value: unknown, metadata: ArgumentMetadata): Promise<string> {
    const id =
      typeof value === "string" ? (parseListingParam(value) ?? value) : value;
    return this.uuidPipe.transform(id as string, metadata);
  }
}

/** Swagger description of a route param read through `ListingIdParam`. */
export const LISTING_ID_PARAM_DESCRIPTION =
  "Product UUID or listing URL segment `<slug>-<uuid>`";

/**
 * `@ListingIdParam("id")`: a listing id route param that accepts a bare UUID
 * or `<slug>-<uuid>`. Pass the route's existing UUID pipe (for example
 * `uuidParamPipe("server.product.invalidIdFormat")`) to keep its 400.
 */
export function ListingIdParam(
  name: string,
  uuidPipe?: ParseUUIDPipe,
): ParameterDecorator {
  return Param(name, new ListingIdPipe(uuidPipe));
}
