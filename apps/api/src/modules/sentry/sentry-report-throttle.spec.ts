import type { CacheService } from "../cache/cache.service";
import {
  SENTRY_REPEAT_WINDOW_SECONDS,
  SentryReportThrottle,
} from "./sentry-report-throttle";

const HOUR = 60 * 60 * 1000;
const WINDOW_MS = SENTRY_REPEAT_WINDOW_SECONDS * 1000;

/** An in-memory Redis `SET NX EX`, shared by every throttle built on it. */
function fakeRedis() {
  const expiresAt = new Map<string, number>();
  const claimKey = jest.fn(async (key: string, ttlSeconds: number) => {
    const until = expiresAt.get(key);
    if (until !== undefined && until > Date.now()) return "held" as const;
    expiresAt.set(key, Date.now() + ttlSeconds * 1000);
    return "claimed" as const;
  });
  return { cache: { claimKey } as unknown as CacheService, claimKey };
}

describe("SentryReportThrottle", () => {
  beforeEach(() => {
    jest.useFakeTimers({ now: new Date("2026-10-17T03:00:00.000Z") });
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it("reports the first occurrence of a key", async () => {
    const { cache } = fakeRedis();
    await expect(
      new SentryReportThrottle(cache).shouldReport("k"),
    ).resolves.toBe(true);
  });

  it("suppresses an unchanged repeat within the window", async () => {
    const { cache } = fakeRedis();
    const throttle = new SentryReportThrottle(cache);
    await throttle.shouldReport("k");

    jest.setSystemTime(Date.now() + 30 * 60 * 1000); // the next cron run
    await expect(throttle.shouldReport("k")).resolves.toBe(false);
  });

  it("never holds back a different key (another entity, another failure)", async () => {
    const { cache } = fakeRedis();
    const throttle = new SentryReportThrottle(cache);
    await throttle.shouldReport("invoice-a");

    await expect(throttle.shouldReport("invoice-b")).resolves.toBe(true);
  });

  it("reports the same key again once the window has passed", async () => {
    const { cache } = fakeRedis();
    const throttle = new SentryReportThrottle(cache);
    await throttle.shouldReport("k");

    jest.setSystemTime(Date.now() + WINDOW_MS + 1);
    await expect(throttle.shouldReport("k")).resolves.toBe(true);
  });

  it("lets a daily alarm through on every daily run, even one that runs a little early", async () => {
    const { cache } = fakeRedis();
    const throttle = new SentryReportThrottle(cache);
    await throttle.shouldReport("RECONCILE ALARM");

    jest.setSystemTime(Date.now() + 24 * HOUR - 5 * 60 * 1000);
    await expect(throttle.shouldReport("RECONCILE ALARM")).resolves.toBe(true);
  });

  it("sends one event when the api and the worker log the same failure", async () => {
    const { cache } = fakeRedis();
    const api = new SentryReportThrottle(cache);
    const worker = new SentryReportThrottle(cache);

    const results = [
      await api.shouldReport("k"),
      await worker.shouldReport("k"),
    ];

    expect(results).toEqual([true, false]);
  });

  it("keeps the window across a restart (the key lives in Redis)", async () => {
    const { cache } = fakeRedis();
    await new SentryReportThrottle(cache).shouldReport("k");

    const restarted = new SentryReportThrottle(cache);
    await expect(restarted.shouldReport("k")).resolves.toBe(false);
  });

  it("re-asks Redis after a short while when another instance holds the key", async () => {
    const { cache, claimKey } = fakeRedis();
    const other = new SentryReportThrottle(cache);
    const throttle = new SentryReportThrottle(cache);
    await other.shouldReport("k");
    jest.setSystemTime(Date.now() + WINDOW_MS - 5 * 60 * 1000);
    await expect(throttle.shouldReport("k")).resolves.toBe(false);

    // The remote key expires 5 minutes later; this instance must not keep
    // trusting its own copy for a full window.
    jest.setSystemTime(Date.now() + 11 * 60 * 1000);
    await expect(throttle.shouldReport("k")).resolves.toBe(true);
    expect(claimKey).toHaveBeenCalledTimes(3);
  });

  it("answers a repeat from memory without a Redis round trip", async () => {
    const { cache, claimKey } = fakeRedis();
    const throttle = new SentryReportThrottle(cache);
    await throttle.shouldReport("k");
    await throttle.shouldReport("k");

    expect(claimKey).toHaveBeenCalledTimes(1);
  });

  it("does not let a burst of the same line in one process race past", async () => {
    const { cache } = fakeRedis();
    const throttle = new SentryReportThrottle(cache);

    const results = await Promise.all([
      throttle.shouldReport("k"),
      throttle.shouldReport("k"),
      throttle.shouldReport("k"),
    ]);

    expect(results.filter(Boolean)).toHaveLength(1);
  });

  describe("when Redis is down (fail open, but no flood)", () => {
    const unavailable = () =>
      ({
        claimKey: jest.fn().mockResolvedValue("unavailable"),
      }) as unknown as CacheService;

    it("still reports the first occurrence", async () => {
      await expect(
        new SentryReportThrottle(unavailable()).shouldReport("k"),
      ).resolves.toBe(true);
    });

    it("suppresses the repeats in this process", async () => {
      const throttle = new SentryReportThrottle(unavailable());
      await throttle.shouldReport("k");
      await expect(throttle.shouldReport("k")).resolves.toBe(false);
    });

    it("reports when the Redis call rejects", async () => {
      const cache = {
        claimKey: jest.fn().mockRejectedValue(new Error("down")),
      } as unknown as CacheService;
      await expect(
        new SentryReportThrottle(cache).shouldReport("k"),
      ).resolves.toBe(true);
    });

    it("reports when the Redis call hangs (offline queue)", async () => {
      const cache = {
        claimKey: jest.fn(() => new Promise(() => undefined)),
      } as unknown as CacheService;
      const pending = new SentryReportThrottle(cache).shouldReport("k");

      await jest.advanceTimersByTimeAsync(600);

      await expect(pending).resolves.toBe(true);
    });

    it("works without a cache at all (unit setups)", async () => {
      const throttle = new SentryReportThrottle();
      await expect(throttle.shouldReport("k")).resolves.toBe(true);
      await expect(throttle.shouldReport("k")).resolves.toBe(false);
    });
  });
});
