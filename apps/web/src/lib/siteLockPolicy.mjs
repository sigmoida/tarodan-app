const DEFAULT_MAX_ENTRIES = 10_000;

/** Keep env parsing identical between build validation and middleware runtime. */
export function isSiteLocked(value) {
  if (typeof value !== "string") return false;
  const normalized = value.toLowerCase();
  return normalized === "true" || normalized === "1";
}

/** Rewrite directly to Next's internal locale segment so default-locale pages resolve. */
export function internalComingSoonPath(locale) {
  return `/${locale}/coming-soon`;
}

/** Use the configured public application origin for browser-facing redirects. */
export function resolvePublicOrigin(configuredOrigin, requestOrigin) {
  const url = new URL(configuredOrigin || requestOrigin);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Public application origin must use HTTP or HTTPS");
  }
  return url.origin;
}

/**
 * Small process-local limiter for the single-replica Coolify web service.
 * Move this state to Redis before horizontally scaling the web application.
 */
export class UnlockRateLimiter {
  constructor({
    maxAttempts,
    windowMs,
    maxEntries = DEFAULT_MAX_ENTRIES,
    now = Date.now,
  }) {
    this.maxAttempts = maxAttempts;
    this.windowMs = windowMs;
    this.maxEntries = maxEntries;
    this.now = now;
    this.attempts = new Map();
  }

  status(key) {
    const current = this.attempts.get(key);
    if (!current) return { blocked: false, retryAfterSeconds: 0 };

    const remainingMs = current.expiresAt - this.now();
    if (remainingMs <= 0) {
      this.attempts.delete(key);
      return { blocked: false, retryAfterSeconds: 0 };
    }

    return {
      blocked: current.count >= this.maxAttempts,
      retryAfterSeconds:
        current.count >= this.maxAttempts
          ? Math.max(1, Math.ceil(remainingMs / 1000))
          : 0,
    };
  }

  recordFailure(key) {
    const timestamp = this.now();
    const current = this.attempts.get(key);
    if (!current || current.expiresAt <= timestamp) {
      this.ensureCapacity();
      this.attempts.set(key, {
        count: 1,
        expiresAt: timestamp + this.windowMs,
      });
      return;
    }
    current.count += 1;
  }

  clear(key) {
    this.attempts.delete(key);
  }

  ensureCapacity() {
    if (this.attempts.size < this.maxEntries) return;
    const timestamp = this.now();
    for (const [key, value] of this.attempts) {
      if (value.expiresAt <= timestamp) this.attempts.delete(key);
    }
    if (this.attempts.size >= this.maxEntries) {
      const oldestKey = this.attempts.keys().next().value;
      if (oldestKey !== undefined) this.attempts.delete(oldestKey);
    }
  }
}
