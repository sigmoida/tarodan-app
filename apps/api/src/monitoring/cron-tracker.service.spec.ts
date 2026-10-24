import { Logger } from "@nestjs/common";
import * as Sentry from "@sentry/node";
import { SENTRY_REPEAT_WINDOW_SECONDS } from "../common/logging/error-report-key";
import { CronStepFailuresError } from "./cron-step-runner";
import {
  CronTrackerService,
  type TrackedRunContext,
} from "./cron-tracker.service";

jest.mock("@sentry/node", () => ({
  captureCheckIn: jest.fn(() => "check-in-id"),
  getClient: jest.fn(),
}));

const captureCheckIn = Sentry.captureCheckIn as jest.Mock;
const getClient = Sentry.getClient as jest.Mock;
/** Sentry client present or not (no DSN), tagged with `environment`. */
const sentryClient = (present: boolean, environment = "production") =>
  getClient.mockReturnValue(
    present ? { getOptions: () => ({ environment }) } : undefined,
  );

/**
 * The run summary ("Cron 'x' FAILED ...") is the alarm for a failed run,
 * unless every failure in it was already logged at error where it happened:
 * then a second error made each failure two Sentry events (TARODAN-API-Z next
 * to TARODAN-API-17). The run itself fails either way (Bull retry, check-in).
 */
describe("CronTrackerService.track failure reporting", () => {
  let error: jest.SpyInstance;
  let warn: jest.SpyInstance;

  beforeEach(() => {
    error = jest
      .spyOn(Logger.prototype, "error")
      .mockImplementation(() => undefined);
    warn = jest
      .spyOn(Logger.prototype, "warn")
      .mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());

  const run = (thrown: unknown) =>
    new CronTrackerService().track("refund-crons", "*/10 * * * *", () => {
      throw thrown;
    });

  it("logs a plain failure at error with its stack", async () => {
    const boom = new Error("db down");

    await expect(run(boom)).rejects.toBe(boom);

    expect(error).toHaveBeenCalledWith(
      expect.stringContaining("Cron 'refund-crons' FAILED"),
      boom.stack,
    );
    expect(warn).not.toHaveBeenCalled();
  });

  it("logs a step summary whose failures were not reported yet at error", async () => {
    const summary = new CronStepFailuresError(
      ["order-tracking-records"],
      [
        "order-tracking-records: 1 kayıt senkronlanamadı: PKG-WQMTZDB5TT (network)",
      ],
    );

    await expect(run(summary)).rejects.toBe(summary);

    expect(error).toHaveBeenCalledWith(
      expect.stringContaining("PKG-WQMTZDB5TT"),
      expect.any(String),
    );
  });

  it("logs an already-reported step summary at warn only, and still fails the run", async () => {
    const summary = new CronStepFailuresError(
      ["finalize-returned-shipments"],
      ["finalize-returned-shipments: 1 kayıt"],
      true,
    );
    const tracker = new CronTrackerService();

    await expect(
      tracker.track("refund-crons", "*/10 * * * *", () => {
        throw summary;
      }),
    ).rejects.toBe(summary);

    expect(error).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("Cron 'refund-crons' FAILED"),
    );
    expect(tracker.list()[0]).toMatchObject({ status: "failed", failures: 1 });
  });
});

/**
 * A cron that fails the same way every 5 minutes was one error log, so one
 * Sentry event, per run. The alarm is the state change: the first failure, a
 * different failure, or a failure after a success. The run itself still fails
 * every time (Bull retry, check-in "error").
 */
describe("CronTrackerService.track alarms on a state change only", () => {
  let error: jest.SpyInstance;
  let warn: jest.SpyInstance;
  let log: jest.SpyInstance;
  let tracker: CronTrackerService;

  beforeEach(() => {
    jest.clearAllMocks();
    error = jest
      .spyOn(Logger.prototype, "error")
      .mockImplementation(() => undefined);
    warn = jest
      .spyOn(Logger.prototype, "warn")
      .mockImplementation(() => undefined);
    log = jest
      .spyOn(Logger.prototype, "log")
      .mockImplementation(() => undefined);
    tracker = new CronTrackerService();
  });
  afterEach(() => jest.restoreAllMocks());

  const fail = (job: string, message: string) =>
    expect(
      tracker.track(job, "*/5 * * * *", () => {
        throw new Error(message);
      }),
    ).rejects.toThrow(message);
  const succeed = (job: string) =>
    tracker.track(job, "*/5 * * * *", () => "ok");
  const refund = (id: string) => `Failed to finalize refund ${id}`;
  const REFUND_A = refund("3fa85f64-5717-4562-b3fc-2c963f66afa6");
  const REFUND_B = refund("9c858901-8a57-4791-81fe-4c455b099bc9");

  it("raises the first failure, then logs the same failure on the next runs at warn", async () => {
    await fail("payment-expired", REFUND_A);
    await fail("payment-expired", REFUND_A);
    await fail("payment-expired", REFUND_A);

    expect(error).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledTimes(2);
    expect(warn).toHaveBeenLastCalledWith(
      expect.stringContaining("unchanged, 3 failed runs in a row"),
    );
    expect(tracker.list()[0]).toMatchObject({ status: "failed", failures: 3 });
  });

  it("treats a duration or counter change as the same failure", async () => {
    await fail("refund-crons", `3 kayıt (120ms): ${REFUND_A}`);
    await fail("refund-crons", `4 kayıt (98ms): ${REFUND_A}`);

    expect(error).toHaveBeenCalledTimes(1);
  });

  it("raises a failure of another entity at once", async () => {
    await fail("payment-expired", REFUND_A);
    await fail("payment-expired", REFUND_B);

    expect(error).toHaveBeenCalledTimes(2);
    expect(error).toHaveBeenLastCalledWith(
      expect.stringContaining("9c858901-8a57-4791-81fe-4c455b099bc9"),
      expect.any(String),
    );
  });

  it("raises another reason for the same job at once", async () => {
    await fail("payment-expired", REFUND_A);
    await fail("payment-expired", `${REFUND_A}: provider timeout`);

    expect(error).toHaveBeenCalledTimes(2);
  });

  it("logs the recovery and raises the same failure again after a success", async () => {
    await fail("payment-expired", REFUND_A);
    await fail("payment-expired", REFUND_A);
    await succeed("payment-expired");
    await fail("payment-expired", REFUND_A);

    expect(log).toHaveBeenCalledWith(
      "Cron 'payment-expired' recovered after 2 failed run(s)",
    );
    expect(error).toHaveBeenCalledTimes(2);
  });

  it("keeps the state per job", async () => {
    await fail("payment-expired", REFUND_A);
    await fail("refund-crons", REFUND_A);

    expect(error).toHaveBeenCalledTimes(2);
  });

  it("raises a failure that lasts again once the repeat window has passed", async () => {
    const now = jest.spyOn(Date, "now");
    const start = Date.parse("2026-10-23T00:00:00.000Z");
    const at = (ms: number) => now.mockReturnValue(start + ms);

    at(0);
    await fail("payment-expired", REFUND_A);
    at(SENTRY_REPEAT_WINDOW_SECONDS * 1000 - 60_000);
    await fail("payment-expired", REFUND_A);
    expect(error).toHaveBeenCalledTimes(1);

    at(SENTRY_REPEAT_WINDOW_SECONDS * 1000);
    await fail("payment-expired", REFUND_A);
    expect(error).toHaveBeenCalledTimes(2);

    // The window restarts from the re-raise.
    at(SENTRY_REPEAT_WINDOW_SECONDS * 1000 + 5 * 60_000);
    await fail("payment-expired", REFUND_A);
    expect(error).toHaveBeenCalledTimes(2);
  });

  it("raises a summary its steps did not report, after the same text that they did", async () => {
    const details = ["barcode-retry-records: 1 kayıt tamamlanamadı"];
    const throwing = (reported: boolean) =>
      expect(
        tracker.track("sync-surat-tracking", "*/5 * * * *", () => {
          throw new CronStepFailuresError(
            ["barcode-retry-records"],
            details,
            reported,
          );
        }),
      ).rejects.toBeInstanceOf(CronStepFailuresError);

    await throwing(true);
    expect(error).not.toHaveBeenCalled();

    await throwing(false);
    expect(error).toHaveBeenCalledTimes(1);
  });

  it("does not log a recovery for a job that never failed", async () => {
    await succeed("payment-expired");

    expect(log).not.toHaveBeenCalled();
  });
});

/**
 * Sentry cron check-ins: only a job with a `monitor` in the cron catalog
 * (payout-process), only on the production deployment (APP_ENV), one pair per
 * attempt, with the monitor config on both check-ins so Sentry upserts the
 * monitor. Staging used to send a check-in for
 * every cron every minute with no config, and Sentry dropped them all. The run
 * itself never depends on Sentry.
 */
describe("CronTrackerService.track Sentry check-ins", () => {
  const PAYOUT_CONFIG = {
    schedule: { type: "crontab", value: "*/15 * * * *" },
    timezone: "Europe/Istanbul",
    checkinMargin: 10,
    maxRuntime: 30,
    failureIssueThreshold: 2,
    recoveryThreshold: 1,
  };
  const originalAppEnv = process.env.APP_ENV;
  let warn: jest.SpyInstance;
  let tracker: CronTrackerService;

  beforeEach(() => {
    jest.clearAllMocks();
    captureCheckIn.mockReturnValue("check-in-id");
    jest.spyOn(Logger.prototype, "error").mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, "log").mockImplementation(() => undefined);
    warn = jest
      .spyOn(Logger.prototype, "warn")
      .mockImplementation(() => undefined);
    process.env.APP_ENV = "production";
    sentryClient(true);
    tracker = new CronTrackerService();
  });
  afterEach(() => {
    jest.restoreAllMocks();
    if (originalAppEnv === undefined) delete process.env.APP_ENV;
    else process.env.APP_ENV = originalAppEnv;
  });

  const payout = <T>(
    fn: () => T | Promise<T>,
    run: TrackedRunContext = { timezone: "Europe/Istanbul" },
    schedule = "*/15 * * * *",
  ) => tracker.track("payout-process", schedule, fn, run);
  const failing =
    (message = "paytr down") =>
    () => {
      throw new Error(message);
    };
  const statuses = () =>
    captureCheckIn.mock.calls.map(([checkIn]) => checkIn.status);

  it("opens and closes an ok check-in with the same id and the monitor config", async () => {
    const result = { summary: "2 processed" };

    await expect(payout(() => result)).resolves.toBe(result);

    expect(captureCheckIn).toHaveBeenCalledTimes(2);
    expect(captureCheckIn).toHaveBeenNthCalledWith(
      1,
      { monitorSlug: "payout-process", status: "in_progress" },
      PAYOUT_CONFIG,
    );
    expect(captureCheckIn).toHaveBeenNthCalledWith(
      2,
      {
        checkInId: "check-in-id",
        monitorSlug: "payout-process",
        status: "ok",
        duration: expect.any(Number),
      },
      PAYOUT_CONFIG,
    );
  });

  it("closes a failed run with an error check-in and rethrows the same error", async () => {
    const boom = new Error("paytr down");

    await expect(
      payout(() => {
        throw boom;
      }),
    ).rejects.toBe(boom);

    expect(captureCheckIn).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        checkInId: "check-in-id",
        monitorSlug: "payout-process",
        status: "error",
      }),
      PAYOUT_CONFIG,
    );
    expect(tracker.list()[0]).toMatchObject({ status: "failed", failures: 1 });
  });

  it("closes every attempt on its own, a Bull retry included (nothing left open)", async () => {
    captureCheckIn
      .mockReturnValueOnce("attempt-1")
      .mockReturnValueOnce("attempt-1")
      .mockReturnValueOnce("attempt-2");

    await expect(payout(failing())).rejects.toThrow("paytr down");
    await expect(payout(() => "paid")).resolves.toBe("paid");

    expect(statuses()).toEqual(["in_progress", "error", "in_progress", "ok"]);
    expect(captureCheckIn.mock.calls[1][0]).toMatchObject({
      checkInId: "attempt-1",
    });
    expect(captureCheckIn.mock.calls[3][0]).toMatchObject({
      checkInId: "attempt-2",
    });
  });

  it("keeps the failure alarm unchanged on a monitored job", async () => {
    const error = jest.spyOn(Logger.prototype, "error");
    const boom = new Error("paytr down");

    await expect(
      payout(() => {
        throw boom;
      }),
    ).rejects.toBe(boom);

    expect(error).toHaveBeenCalledWith(
      expect.stringContaining("Cron 'payout-process' FAILED"),
      boom.stack,
    );
  });

  it("sends nothing for a job without a monitor", async () => {
    await tracker.track("payment-expired", "*/5 * * * *", () => "ok");
    await expect(
      tracker.track("refund-crons", "0 */10 * * * *", () => {
        throw new Error("db down");
      }),
    ).rejects.toThrow("db down");

    expect(captureCheckIn).not.toHaveBeenCalled();
  });

  it.each([["staging"], ["development"], [""], [undefined]])(
    "sends nothing on APP_ENV %p",
    async (appEnv) => {
      if (appEnv === undefined) delete process.env.APP_ENV;
      else process.env.APP_ENV = appEnv;

      await payout(() => "ok");

      expect(captureCheckIn).not.toHaveBeenCalled();
    },
  );

  it("sends nothing from staging whose Sentry label fell back to production", async () => {
    process.env.APP_ENV = "staging";
    sentryClient(true, "production");

    await payout(() => "ok");

    expect(captureCheckIn).not.toHaveBeenCalled();
  });

  it("sends nothing without a Sentry client (no DSN)", async () => {
    sentryClient(false);

    await expect(payout(() => "ok")).resolves.toBe("ok");

    expect(captureCheckIn).not.toHaveBeenCalled();
  });

  it("runs the job and returns its result when the opening check-in throws", async () => {
    captureCheckIn.mockImplementation(() => {
      throw new Error("sentry transport broken");
    });
    const fn = jest.fn(() => "paid");

    await expect(payout(fn)).resolves.toBe("paid");

    expect(fn).toHaveBeenCalledTimes(1);
    expect(tracker.list()[0]).toMatchObject({ status: "success", runs: 1 });
  });

  it("keeps the result and the error when the closing check-in throws", async () => {
    captureCheckIn
      .mockReturnValueOnce("check-in-id")
      .mockImplementationOnce(() => {
        throw new Error("sentry transport broken");
      })
      .mockReturnValueOnce("check-in-id-2")
      .mockImplementationOnce(() => {
        throw new Error("sentry transport broken");
      });
    const boom = new Error("paytr down");

    await expect(payout(() => "paid")).resolves.toBe("paid");
    await expect(
      payout(() => {
        throw boom;
      }),
    ).rejects.toBe(boom);
  });

  it("runs the job when the Sentry client lookup throws", async () => {
    getClient.mockImplementation(() => {
      throw new Error("sentry not loaded");
    });

    await expect(payout(() => "paid")).resolves.toBe("paid");

    expect(captureCheckIn).not.toHaveBeenCalled();
  });

  it("drops a zero seconds field from a 6-field schedule", async () => {
    await payout(() => "ok", undefined, "0 */15 * * * *");

    expect(captureCheckIn).toHaveBeenNthCalledWith(
      1,
      expect.anything(),
      expect.objectContaining({
        schedule: { type: "crontab", value: "*/15 * * * *" },
      }),
    );
  });

  it("omits the time zone the repeatable does not have", async () => {
    await tracker.track("payout-process", "*/15 * * * *", () => "ok");

    expect(captureCheckIn.mock.calls[0][1]).not.toHaveProperty("timezone");
  });

  it("sends a schedule without a crontab form without config and warns once per schedule", async () => {
    await payout(() => "ok", undefined, "*/30 */15 * * * *");
    await payout(() => "ok", undefined, "*/30 */15 * * * *");
    await payout(() => "ok", undefined, "0 3 L * *");

    expect(captureCheckIn).toHaveBeenCalledTimes(6);
    for (const [, config] of captureCheckIn.mock.calls) {
      expect(config).toBeUndefined();
    }
    expect(warn).toHaveBeenCalledTimes(2);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining(
        "'*/30 */15 * * * *' has no 5-field crontab form",
      ),
    );
  });
});

/**
 * The tracker's bookkeeping never decides a run's outcome: a run that
 * succeeded (payout-process has already moved money) must not be failed and
 * retried by Bull because a log line threw, and a failed run rethrows its own
 * error, not the bookkeeping's.
 */
describe("CronTrackerService.track bookkeeping cannot change the outcome", () => {
  afterEach(() => jest.restoreAllMocks());

  it("returns the result when the recovery line throws", async () => {
    jest.spyOn(Logger.prototype, "error").mockImplementation(() => undefined);
    const tracker = new CronTrackerService();
    await expect(
      tracker.track("payout-process", "*/15 * * * *", () => {
        throw new Error("paytr down");
      }),
    ).rejects.toThrow("paytr down");
    jest.spyOn(Logger.prototype, "log").mockImplementation(() => {
      throw new Error("log transport broken");
    });
    const fn = jest.fn(() => "paid");

    await expect(
      tracker.track("payout-process", "*/15 * * * *", fn),
    ).resolves.toBe("paid");

    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("rethrows the run's own error when the failure alarm throws", async () => {
    jest.spyOn(Logger.prototype, "error").mockImplementation(() => {
      throw new Error("log transport broken");
    });
    const boom = new Error("paytr down");

    await expect(
      new CronTrackerService().track("payout-process", "*/15 * * * *", () => {
        throw boom;
      }),
    ).rejects.toBe(boom);
  });
});
