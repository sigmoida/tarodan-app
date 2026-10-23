import { Injectable, Optional } from "@nestjs/common";
import { CacheService } from "../cache/cache.service";
import { SENTRY_REPEAT_WINDOW_SECONDS } from "../../common/logging/error-report-key";

/**
 * After another instance claimed a key, this instance trusts that for a short
 * while only: the remote key may expire long before a full local window would.
 */
const REMOTE_HELD_RECHECK_SECONDS = 10 * 60;

/** A Redis call slower than this is treated as "unavailable" (ioredis queues offline). */
const REDIS_TIMEOUT_MS = 500;

/** Upper bound on remembered keys per process; expired entries go first. */
const MAX_LOCAL_KEYS = 2_000;

const REDIS_KEY_PREFIX = "sentry:reported:";

type ClaimResult = "claimed" | "held" | "unavailable";

/**
 * Decides whether a keyed error log line goes to Sentry: once per key per
 * `SENTRY_REPEAT_WINDOW_SECONDS` across every process (api, worker) and
 * restart. The key comes from `error-report-key.ts`.
 *
 * Two layers:
 * - Redis (`SET NX EX`) is the shared truth: two instances logging the same
 *   failure in the same minute send one event, and a restart does not reset
 *   the window.
 * - An in-process map answers repeats without a Redis round trip and is the
 *   fallback when Redis is down or slow. Without Redis each process reports a
 *   key once per window, so an outage still raises the alarm (fail open) but
 *   cannot flood the quota either; the Redis outage itself is one such key.
 */
@Injectable()
export class SentryReportThrottle {
  private readonly reportedUntil = new Map<string, number>();

  constructor(@Optional() private readonly cache?: CacheService) {}

  async shouldReport(key: string): Promise<boolean> {
    const now = Date.now();
    const until = this.reportedUntil.get(key);
    if (until !== undefined && until > now) return false;

    // Remember before awaiting Redis: a burst of the same line in this
    // process (a Bull retry, a step and its summary) must not race past.
    this.remember(key, now + SENTRY_REPEAT_WINDOW_SECONDS * 1000);
    if ((await this.claim(key)) === "held") {
      this.remember(key, now + REMOTE_HELD_RECHECK_SECONDS * 1000);
      return false;
    }
    return true;
  }

  private async claim(key: string): Promise<ClaimResult> {
    if (!this.cache) return "unavailable";
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<ClaimResult>((resolve) => {
      timer = setTimeout(() => resolve("unavailable"), REDIS_TIMEOUT_MS);
      timer.unref?.();
    });
    try {
      return await Promise.race([
        this.cache
          .claimKey(`${REDIS_KEY_PREFIX}${key}`, SENTRY_REPEAT_WINDOW_SECONDS)
          .catch((): ClaimResult => "unavailable"),
        timeout,
      ]);
    } finally {
      clearTimeout(timer);
    }
  }

  private remember(key: string, until: number): void {
    if (this.reportedUntil.size >= MAX_LOCAL_KEYS) this.evict();
    this.reportedUntil.delete(key);
    this.reportedUntil.set(key, until);
  }

  /** Drops expired keys; if none expired, the oldest insertion goes. */
  private evict(): void {
    const now = Date.now();
    for (const [key, until] of this.reportedUntil) {
      if (until <= now) this.reportedUntil.delete(key);
    }
    if (this.reportedUntil.size >= MAX_LOCAL_KEYS) {
      const oldest = this.reportedUntil.keys().next().value;
      if (oldest !== undefined) this.reportedUntil.delete(oldest);
    }
  }
}
