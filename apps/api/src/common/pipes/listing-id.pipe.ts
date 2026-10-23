import {
  ArgumentMetadata,
  Param,
  ParseUUIDPipe,
  PipeTransform,
} from "@nestjs/common";
import { type MessageKey } from "@tarodan/i18n";
import { parseListingParam } from "@tarodan/types";
import { uuidParamPipe } from "./uuid-param.decorator";

/**
 * Listing id route param that also takes the listing URL segment
 * `<slug>-<uuid>` (ADR 0017) and resolves it to the UUID; the slug is ignored.
 *
 * Why: the live apps route `/listings/<segment>` deep links to their product
 * screen and send the whole segment to the API (`GET /products/<segment>`,
 * reviews, similar, view). Taking the trailing UUID here keeps those links
 * opening on app versions that do not parse the segment themselves.
 *
 * Anything else goes to `uuidPipe` unchanged, so garbage fails with the
 * route's UUID 400 (`UuidParam` semantics: status 400 with a catalog key).
 * A UUID is lower-cased (ids are stored lower case). Read routes only: write
 * routes keep a bare-UUID contract.
 */
export class ListingIdPipe implements PipeTransform<unknown, Promise<string>> {
  constructor(private readonly uuidPipe: ParseUUIDPipe = uuidParamPipe()) {}

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
 * or `<slug>-<uuid>`, the listing counterpart of `UuidParam`. A malformed id
 * is a 400 with `i18nKey` (default `server.common.invalidId`).
 */
export function ListingIdParam(
  name: string,
  i18nKey?: MessageKey,
): ParameterDecorator {
  return Param(name, new ListingIdPipe(uuidParamPipe(i18nKey)));
}
