import { Logger } from "@nestjs/common";
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
