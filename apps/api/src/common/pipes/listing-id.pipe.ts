import {
  ArgumentMetadata,
  Param,
  ParseUUIDPipe,
  PipeTransform,
} from "@nestjs/common";
import { type MessageKey } from "@tarodan/i18n";
import { toListingId } from "../transforms/listing-id";
import { uuidParamPipe } from "./uuid-param.decorator";

/**
 * Product id route param that also takes the listing URL segment
 * `<slug>-<uuid>` (ADR 0017) and resolves it to the lower-case UUID; the slug
 * is ignored (`toListingId`, shared with the body-field `ListingIdField`).
 *
 * Why: the live apps route `/listings/<segment>` deep links to their product
 * screen and send the whole segment wherever that screen (and the edit screen
 * a `/listings/<segment>/edit` link opens) uses the product id. Taking the
 * trailing UUID here keeps those screens working on app versions that do not
 * parse the segment themselves.
 *
 * Anything else goes to `uuidPipe` unchanged, so garbage fails with the
 * route's UUID 400 (`UuidParam` semantics: status 400 with a catalog key).
 * Only for params that are always a product id; other ids stay `UuidParam`.
 */
export class ListingIdPipe implements PipeTransform<unknown, Promise<string>> {
  constructor(private readonly uuidPipe: ParseUUIDPipe = uuidParamPipe()) {}

  transform(value: unknown, metadata: ArgumentMetadata): Promise<string> {
    return this.uuidPipe.transform(toListingId(value) as string, metadata);
  }
}

/** Swagger description of a route param read through `ListingIdParam`. */
export const LISTING_ID_PARAM_DESCRIPTION =
  "Product UUID or listing URL segment `<slug>-<uuid>`";

/**
 * `@ListingIdParam("id")`: a product id route param that accepts a bare UUID
 * or `<slug>-<uuid>`, the listing counterpart of `UuidParam`. A malformed id
 * is a 400 with `i18nKey` (default `server.common.invalidId`).
 */
export function ListingIdParam(
  name: string,
  i18nKey?: MessageKey,
): ParameterDecorator {
  return Param(name, new ListingIdPipe(uuidParamPipe(i18nKey)));
}
