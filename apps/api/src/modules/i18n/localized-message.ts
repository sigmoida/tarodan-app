// =============================================================================
// #224: LOCALIZED EXCEPTION MESSAGES
//
// Services keep throwing Nest's semantic HttpExceptions, but instead of a
// hardcoded Turkish string they pass a catalog key (+ ICU params):
//
//   throw new BadRequestException(i18nMessage('server.auth.invalidCredentials'));
//   throw new NotFoundException(i18nMessage('server.order.notFound', { orderNumber }));
//
// AllExceptionsFilter detects the payload and renders the message in the
// request's locale, so services never need the locale (or I18nService) at the
// throw site. The response keeps the `{ statusCode, message, error }` contract
// and additionally exposes `i18nKey` for clients that want to re-render.
// =============================================================================

import { type MessageKey, type MessageValues } from "@tarodan/i18n";

export interface LocalizedMessagePayload {
  i18nKey: MessageKey;
  i18nParams?: MessageValues;
}

/** Build an HttpException payload carrying a catalog key instead of fixed text. */
export function i18nMessage(
  key: MessageKey,
  params?: MessageValues,
): LocalizedMessagePayload {
  return params === undefined
    ? { i18nKey: key }
    : { i18nKey: key, i18nParams: params };
}

/** Narrow an arbitrary exception response payload to a localized-message payload. */
export function isLocalizedMessage(
  value: unknown,
): value is LocalizedMessagePayload {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as LocalizedMessagePayload).i18nKey === "string"
  );
}
