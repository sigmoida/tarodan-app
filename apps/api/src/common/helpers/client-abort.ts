/**
 * Client aborts: the caller dropped the connection while we were still reading
 * its request body (an upload cancelled on a phone, a closed tab). Nothing is
 * wrong on our side and nobody is left to read an answer, so these are neither
 * 5xx, nor Sentry events, nor `error_logs` rows.
 *
 * Two things must hold, not one:
 *
 * 1. The error comes from a body reader that saw the client go away: multer's
 *    "Request aborted" or raw-body's `type: "request.aborted"`. A bare socket
 *    code (`ECONNRESET`, `ECONNABORTED`) does not count: an S3, Redis or
 *    carrier call raises the same codes, and a client that gives up on a slow
 *    request is exactly when an upstream outage would then go unreported.
 * 2. The request stream itself was aborted (`readableAborted`, or the legacy
 *    `aborted` flag) — Node sets both before the body readers raise.
 *
 * The second check keeps a look-alike message from elsewhere (a client
 * library's own "Request aborted") a logged 500 while the client is connected.
 */
interface AbortableRequest {
  readableAborted?: boolean;
  aborted?: boolean;
}

export function isClientAbort(exception: unknown, request: unknown): boolean {
  if (typeof exception !== "object" || exception === null) return false;
  const { message, type } = exception as { message?: unknown; type?: unknown };
  const fromBodyReader =
    message === "Request aborted" || type === "request.aborted";
  if (!fromBodyReader) return false;

  const req = request as AbortableRequest | null | undefined;
  return req?.readableAborted === true || req?.aborted === true;
}
