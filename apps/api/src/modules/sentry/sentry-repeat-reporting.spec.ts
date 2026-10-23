import * as Sentry from "@sentry/node";
import { AppNestLogger } from "../../common/logging/nest-logger";
import { getAppLogger, initAppLogger } from "../../common/logging/logger";
import type { CacheService } from "../cache/cache.service";
import { SentryReportThrottle } from "./sentry-report-throttle";
import { SentryService } from "./sentry.service";

jest.mock("@sentry/node", () => ({
  withScope: jest.fn((cb: (scope: unknown) => void) =>
    cb({ setExtra: jest.fn(), setFingerprint: jest.fn(), setTag: jest.fn() }),
  ),
  captureException: jest.fn(),
  addBreadcrumb: jest.fn(),
}));

/**
 * End to end through the real path every API error takes:
 * `new Logger(ctx).error(...)` -> AppNestLogger -> Sentry sink ->
 * SentryService -> throttle. Pins the behaviour the Sentry quota depends on:
 * repeats of one failure are one event per window, a new entity or a new
 * failure is reported at once, and the alarms that must reach e-mail
 * (docs: tarodan-ops observability.md) still fire every day.
 */
describe("repeat reporting of logged errors", () => {
  const HOUR = 60 * 60 * 1000;
  const captured = () =>
    (Sentry.captureException as jest.Mock).mock.calls.map(
      ([error]: [Error]) => error.message,
    );

  let logger: AppNestLogger;

  const logError = async (message: string, context: string) => {
    logger.error(message, context);
    // The throttle answers asynchronously (Redis); let it settle.
    await jest.advanceTimersByTimeAsync(1);
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers({ now: new Date("2026-10-17T03:00:00.000Z") });
    jest.spyOn(console, "error").mockImplementation(() => undefined);
    jest.spyOn(console, "warn").mockImplementation(() => undefined);
    jest.spyOn(console, "log").mockImplementation(() => undefined);

    const expiresAt = new Map<string, number>();
    const cache = {
      claimKey: jest.fn(async (key: string, ttlSeconds: number) => {
        const until = expiresAt.get(key);
        if (until !== undefined && until > Date.now()) return "held";
        expiresAt.set(key, Date.now() + ttlSeconds * 1000);
        return "claimed";
      }),
    } as unknown as CacheService;
    initAppLogger(new SentryService(new SentryReportThrottle(cache)));
    logger = new AppNestLogger();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it("sends an exhausted invoice once, not on every 30-minute run", async () => {
    const line =
      "ELOGO_INVOICE_EXHAUSTED id=8941508c-8033-4ab2-8c21-00fa1015a6e2 type=buyer_shipping " +
      "source=3fbe59ae-3fbd-41a6-a446-40614c3df98f no=TRD2026000000455: XSLT tasarım hatası.";

    for (let run = 0; run < 6; run++) {
      await logError(line, "InvoiceDeliveryService");
      jest.setSystemTime(Date.now() + HOUR / 2);
    }

    expect(captured()).toHaveLength(1);
    // Every occurrence is still in the console log.
    expect(console.error).toHaveBeenCalledTimes(6);
  });

  it("reports a second exhausted invoice at once while the first is throttled", async () => {
    const exhausted = (id: string, no: string) =>
      `ELOGO_INVOICE_EXHAUSTED id=${id} type=commission source=bf87aede-1e8d-4d8b-a523-6e6d8a66dfa9 no=${no}: XSLT tasarım hatası.`;

    await logError(
      exhausted("8941508c-8033-4ab2-8c21-00fa1015a6e2", "TRD2026000000455"),
      "InvoiceDeliveryService",
    );
    await logError(
      exhausted("a0e387a3-496a-4958-a1e9-1a073f0bb56c", "TRD2026000000392"),
      "InvoiceDeliveryService",
    );

    expect(captured()).toHaveLength(2);
  });

  it("sends a cron that fails the same way on every run and Bull retry once", async () => {
    for (const durationMs of [1204, 388, 912]) {
      await logError(
        `Cron 'sync-surat-tracking' FAILED (${durationMs}ms): 1 cron adımı başarısız: ` +
          "order-tracking-records: 1 kayıt senkronlanamadı: PKG-WQMTZDB5TT (network: fetch failed)",
        "CronTracker",
      );
    }

    expect(captured()).toHaveLength(1);
  });

  it("reports the same cron at once when its failure changes", async () => {
    await logError(
      "Cron 'sync-surat-tracking' FAILED (12ms): order-tracking-records: PKG-WQMTZDB5TT (network: fetch failed)",
      "CronTracker",
    );
    await logError(
      "Cron 'sync-surat-tracking' FAILED (12ms): order-tracking-records: PKG-WQMTZDB5TT (provider: Kullanıcı kodu veya şifreniz hatalı)",
      "CronTracker",
    );

    expect(captured()).toHaveLength(2);
  });

  it("still fires the ledger drift alarm, and fires it again on the next daily run", async () => {
    const alarm =
      "RECONCILE ALARM: LEDGER_ESCROW_RESIDUE order=3fa85f64-5717-4562-b3fc-2c963f66afa6 escrowNet=12.50";

    await logError(alarm, "LedgerReconciliationService");
    expect(captured()).toEqual([alarm]);

    // Tomorrow's run, a little earlier than today's.
    jest.setSystemTime(Date.now() + 24 * HOUR - 2 * 60 * 1000);
    await logError(alarm, "LedgerReconciliationService");
    expect(captured()).toEqual([alarm, alarm]);
  });

  it("fires the stuck-orders alarm at most about once a day while it stays true", async () => {
    const alarm = (count: number) =>
      `ORDERS_STUCK_SHIPPED count=${count} — 10 günden uzun süre kargoda; teslimat poll'lanmadıysa fatura kesilmez`;

    // Every 10 minutes for a day: the count moves, the alarm is the same one.
    for (let run = 0; run < 6 * 24; run++) {
      await logError(alarm(run < 72 ? 1 : 2), "OrderSchedulerService");
      jest.setSystemTime(Date.now() + 10 * 60 * 1000);
    }

    expect(captured()).toHaveLength(2);
  });

  describe("in production", () => {
    const env = { ...process.env };
    beforeEach(() => {
      process.env.NODE_ENV = "production";
      process.env.APP_ENV = "production";
    });
    afterEach(() => {
      process.env = { ...env };
    });

    it("reports the first occurrence of every new failure, with no delay", async () => {
      const alarm =
        "ALARM: PayTR reconcile tutar uyuşmazlığı — payment=3fa85f64-5717-4562-b3fc-2c963f66afa6";

      await logError(alarm, "PspReconciliationService");

      expect(captured()).toEqual([alarm]);
    });

    it("reports the first occurrence even when Redis is down", async () => {
      const down = {
        claimKey: jest.fn().mockRejectedValue(new Error("ECONNREFUSED")),
      } as unknown as CacheService;
      initAppLogger(new SentryService(new SentryReportThrottle(down)));

      await logError(
        "PAYOUT_FAILED PYTTEST000001: transfer rejected",
        "PayoutService",
      );

      expect(captured()).toHaveLength(1);
    });
  });

  it("always sends the 5xx capture of an error a service already logged", async () => {
    // A request fails the same way twice. The service logs the error it
    // throws (keyed, throttled); the SentryInterceptor captures that same
    // object as a 5xx, which must reach Sentry every time (the 5xx alert).
    const interceptorCaptures: Error[] = [];
    for (let request = 0; request < 2; request++) {
      const failure = new Error(
        "refund outcome unknown payment 3fa85f64-5717-4562-b3fc-2c963f66afa6",
      );
      logger.error("PayTR refund error:", failure, "PaytrService");
      getAppLogger().captureException(failure, { url: "/api/refunds" });
      interceptorCaptures.push(failure);
      await jest.advanceTimersByTimeAsync(1);
    }

    const sent = (Sentry.captureException as jest.Mock).mock.calls.map(
      ([error]: [Error]) => error,
    );
    // Request 1: the log line and the 5xx. Request 2: the 5xx only.
    expect(sent).toHaveLength(3);
    for (const failure of interceptorCaptures) {
      expect(sent).toContain(failure);
    }
  });

  it("never throttles a warn (it does not go to Sentry at all)", async () => {
    logger.warn(
      "Surat parcel PKG-WQMTZDB5TT senkronlanamadı",
      "OrderTrackingSyncService",
    );
    await jest.advanceTimersByTimeAsync(1);

    expect(captured()).toHaveLength(0);
  });
});
