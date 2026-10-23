/**
 * Whether a platform transfer request could have reached the provider:
 * - `not_sent`: PayTR provably did not process it (it failed before leaving
 *   the host, the connection was never established, or PayTR refused it
 *   with a 4xx and no answer), so the same `trans_id` may be sent again.
 * - `unknown`: the request may have been processed (reset or timeout after
 *   sending, HTTP 5xx, unreadable answer). Resending could pay twice.
 */
export type PlatformTransferRequestPhase = "not_sent" | "unknown";

/**
 * Thrown by `createPlatformTransfer` when the provider gave no usable answer.
 * A parsed answer (accepted or rejected) is returned, never thrown. This is
 * not an HTTP exception on purpose: it never reaches a client, and Nest's
 * exception message would hide the cause ("Bad Request Exception").
 */
export class PlatformTransferRequestError extends Error {
  readonly name = "PlatformTransferRequestError";

  constructor(
    readonly phase: PlatformTransferRequestPhase,
    /**
     * Network cause (`error.cause.code`), `TimeoutError`, `HTTP_<status>`,
     * `INVALID_BODY`, `PRE_SEND` (building the request failed) or
     * `INVALID_TRANS_ID`.
     */
    readonly causeCode: string | undefined,
    message: string,
  ) {
    super(message);
  }
}
