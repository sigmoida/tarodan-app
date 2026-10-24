import { BadRequestException, Param, ParseUUIDPipe } from "@nestjs/common";
import { type MessageKey } from "@tarodan/i18n";
import { i18nMessage } from "../../modules/i18n";

/**
 * UUID route param: a malformed id is a 400 carrying a catalog key
 * (`server.common.invalidId` unless the route passes its own).
 *
 * The same check as `@Param("id", ParseUUIDPipe)` (any UUID version: seeded
 * deterministic ids are not always v4), with the message from the catalog.
 * Only for entities whose id is ALWAYS `@default(uuid())`; rows seeded with
 * text ids (tax rule, content filter, ...) and routes that also take a slug or
 * a number do NOT use it.
 */
export function UuidParam(
  name: string,
  i18nKey?: MessageKey,
): ParameterDecorator {
  return Param(name, uuidParamPipe(i18nKey));
}

/** The pipe behind `UuidParam`, for tests and custom compositions. */
export function uuidParamPipe(
  i18nKey: MessageKey = "server.common.invalidId",
): ParseUUIDPipe {
  return new ParseUUIDPipe({
    exceptionFactory: () => new BadRequestException(i18nMessage(i18nKey)),
  });
}
