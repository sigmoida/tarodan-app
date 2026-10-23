/**
 * Client aborts: the caller dropped the connection while we were still reading
 * its request body (an upload cancelled on a phone, a closed tab). Nothing is
 * wrong on our side and nobody is left to read an answer, so these are neither
 * 5xx, nor Sentry events, nor `error_logs` rows.
 *
 * Two things must hold, not one:
 *
 * 1. The error has the shape a body reader gives when the client goes away:
 *    multer/busboy "Request aborted", raw-body `request.aborted`, or the
 *    request stream's own `ECONNRESET`/`ECONNABORTED`.
 * 2. The request stream itself was aborted (`readableAborted`, or the legacy
 *    `aborted` flag) — Node sets both before the body readers raise.
 *
 * The second check is what keeps a real outage visible: an upstream call (S3,
 * Redis, SMTP, a carrier API) that fails with `ECONNRESET` while the client is
 * still connected is a server error and must stay a logged 500.
 */
const CLIENT_ABORT_CODES = new Set(["ECONNABORTED", "ECONNRESET"]);

interface AbortableRequest {
  readableAborted?: boolean;
  aborted?: boolean;
}

export function isClientAbort(exception: unknown, request: unknown): boolean {
  if (typeof exception !== "object" || exception === null) return false;
  const { message, type, code } = exception as {
    message?: unknown;
    type?: unknown;
    code?: unknown;
  };
  const abortShaped =
    message === "Request aborted" ||
    type === "request.aborted" ||
    (typeof code === "string" && CLIENT_ABORT_CODES.has(code));
  if (!abortShaped) return false;

  const req = request as AbortableRequest | null | undefined;
  return req?.readableAborted === true || req?.aborted === true;
}
