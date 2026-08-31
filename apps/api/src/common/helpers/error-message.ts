/**
 * Narrowing helpers for caught values.
 *
 * A `catch` binding is `unknown`, not `Error` — `throw` accepts any value, so a
 * rejected promise from a driver or a third-party SDK can hand back a string, a
 * plain object, or nothing at all. Reading `.message` off it is the classic way
 * an error handler throws its own error and buries the original failure, which
 * matters most exactly where these are used: the catch blocks that log why a
 * payment, a shipment or a notification did not go through.
 *
 * The narrowing was already written out inline in ~40 places
 * (`err instanceof Error ? err.message : String(err)`). One definition means
 * the fallback for a non-Error value is decided once.
 */
import { localizedPayloadOf } from "../../modules/i18n/localized-message";
import { translateMessage } from "../../modules/i18n/translate";

/**
 * Localized exceptions (#224) carry a catalog-key PAYLOAD, not text:
 * `throw new BadRequestException(i18nMessage('server.payment.orderAlreadyRefunded'))`.
 * Nest cannot make a message out of an object, so `error.message` degrades to the
 * class name — "Bad Request Exception" — and every internal log/Sentry line that
 * quoted it lost the actual reason. Render the catalog entry instead and keep the
 * key alongside it, so a log line is both readable and greppable/groupable.
 */
function localizedMessage(error: unknown): string | undefined {
  const payload = localizedPayloadOf(error);
  if (!payload) return undefined;
  const rendered = translateMessage(
    payload.i18nKey,
    undefined,
    payload.i18nParams,
  );
  return `${rendered} [${payload.i18nKey}]`;
}

/**
 * Message of a caught value; anything that isn't an `Error` is stringified.
 *
 * A rejected value that merely LOOKS like an error (`{ message }` from a driver
 * or a `Promise.reject({...})`) keeps its message too — stringifying it would
 * log `[object Object]` and throw away the only diagnostic the failure carried.
 */
export function errorMessage(error: unknown): string {
  const localized = localizedMessage(error);
  if (localized) return localized;
  if (error instanceof Error) return error.message;
  const message = (error as { message?: unknown } | null)?.message;
  return typeof message === "string" && message.length > 0
    ? message
    : String(error);
}

/** Stack of a caught value, falling back to its message when there is none. */
export function errorStack(error: unknown): string {
  return error instanceof Error
    ? (error.stack ?? errorMessage(error))
    : String(error);
}
