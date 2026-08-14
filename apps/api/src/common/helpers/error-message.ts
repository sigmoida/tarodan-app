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

/** Message of a caught value; anything that isn't an `Error` is stringified. */
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Stack of a caught value, falling back to its message when there is none. */
export function errorStack(error: unknown): string {
  return error instanceof Error
    ? (error.stack ?? error.message)
    : String(error);
}
