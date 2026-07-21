import type {
  SuratShipmentFailure,
  SuratTechnicalCode,
  SuratTechnicalFailure,
} from "./surat-cargo.types";

const DEFAULT_RETRY_CODES: SuratTechnicalCode[] = [
  "TIMEOUT",
  "NETWORK",
  "HTTP_5XX",
  "SOAP_FAULT",
];

function isOptionalOneShotRetry(code: SuratTechnicalCode): boolean {
  return code === "EMPTY_RESPONSE" || code === "PARSE_ERROR";
}

/**
 * Retries only on technical failures; never on business or success.
 * EMPTY_RESPONSE / PARSE_ERROR: at most one extra attempt (plan: optional 1 retry).
 */
export async function withSuratTechnicalRetries<TSuccess extends { ok: true }>(
  maxAttempts: number,
  baseDelayMs: number,
  fn: () => Promise<TSuccess | SuratShipmentFailure>,
): Promise<TSuccess | SuratShipmentFailure> {
  let last: TSuccess | SuratShipmentFailure | undefined;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    last = await fn();

    if (last.ok) {
      return last;
    }
    const failed = last as SuratShipmentFailure;
    if (failed.kind === "business") {
      return failed;
    }

    const { code } = failed as SuratTechnicalFailure;
    const standardRetry = DEFAULT_RETRY_CODES.includes(code);
    const oneShot = isOptionalOneShotRetry(code) && attempt === 0;

    const canRetry = standardRetry || oneShot;
    if (!canRetry || attempt >= maxAttempts - 1) {
      return last;
    }

    const delay = baseDelayMs * 2 ** attempt + Math.floor(Math.random() * 120);
    await new Promise((r) => setTimeout(r, delay));
  }

  return last!;
}
