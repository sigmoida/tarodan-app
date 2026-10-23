/**
 * Refund attempt keys of a listing boost: `boost-refund:<boostId>:<n>`, where
 * `n` counts the boost's earlier attempts. Every try gets a fresh key, so a
 * try PayTR refused can be followed by one with another amount (an attempt
 * keeps its amount). Two tries never both reach PayTR: the attempt claim
 * refuses a new attempt while an earlier one is unresolved, and the boost
 * refund's claim guard refuses a boost that a finished refund has stopped.
 * The prefix also names the actor of a recovered attempt (the platform).
 */
const BOOST_REFUND_KEY_PREFIX = "boost-refund:";

/** The prefix all attempt keys of one boost share. */
export function boostRefundKeyPrefix(boostId: string): string {
  return `${BOOST_REFUND_KEY_PREFIX}${boostId}:`;
}

/** The key of the boost's attempt number `attempt` (0 for the first). */
export function boostRefundIdempotencyKey(
  boostId: string,
  attempt: number,
): string {
  return `${boostRefundKeyPrefix(boostId)}${attempt}`;
}

export function isBoostRefundKey(key: string | null | undefined): boolean {
  return key?.startsWith(BOOST_REFUND_KEY_PREFIX) ?? false;
}
