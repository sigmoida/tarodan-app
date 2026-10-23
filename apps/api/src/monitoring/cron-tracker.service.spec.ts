import { Logger } from "@nestjs/common";
import * as Sentry from "@sentry/node";
import { CronStepFailuresError } from "./cron-step-runner";
import { CronTrackerService } from "./cron-tracker.service";

jest.mock("@sentry/node", () => ({
  captureCheckIn: jest.fn(() => "check-in-id"),
}));

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
    expect(Sentry.captureCheckIn).toHaveBeenCalledWith(
      expect.objectContaining({ status: "error" }),
    );
    expect(
      (Sentry.captureCheckIn as jest.Mock).mock.calls.filter(
        ([checkIn]) => checkIn.status === "error",
      ),
    ).toHaveLength(3);
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

  it("does not log a recovery for a job that never failed", async () => {
    await succeed("payment-expired");

    expect(log).not.toHaveBeenCalled();
  });
});
