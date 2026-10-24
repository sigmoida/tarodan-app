import { Logger } from "@nestjs/common";
import type { Job } from "bull";
import * as Sentry from "@sentry/node";
import { setCronTracker } from "../../../monitoring/cron-tracker.holder";
import { CronTrackerService } from "../../../monitoring/cron-tracker.service";
import { PayoutScheduledProcessor } from "./payout-scheduled.processor";
import type { PayoutSchedulerService } from "./payout-scheduler.service";

jest.mock("@sentry/node", () => ({
  captureCheckIn: jest.fn(),
  getClient: jest.fn(),
}));

const captureCheckIn = Sentry.captureCheckIn as jest.Mock;
const getClient = Sentry.getClient as jest.Mock;

/**
 * payout-process moves real money (PayTR transfers) and is the one job with a
 * Sentry cron monitor. This pins the worker path end to end (Bull job ->
 * processor -> runTrackedJob -> CronTrackerService) with Bull's own attempt
 * marks, as `registerRepeatableCron` sets them (attempts 3):
 *
 * - the payout run itself is unchanged: called once per attempt, its summary
 *   returned to Bull as is, its error rethrown as the same instance;
 * - on the production deployment every automatic attempt is one closed
 *   check-in pair carrying the monitor config;
 * - a Bull Board retry, a "retry all" and the admin release fast path still
 *   run the payout but never check in (an off-schedule "ok" could resolve an
 *   open monitor issue);
 * - staging and development never check in;
 * - a broken Sentry never changes the payout run.
 */
describe("PayoutScheduledProcessor payout-process cron monitor", () => {
  const SCHEDULE = "*/15 * * * *";
  const TZ = "Europe/Istanbul";
  const SUMMARY = {
    summary: "2 işlendi · 0 başarısız",
    stats: { retried: 0, processed: 2, submitted: 0, failed: 0, stuck: 0 },
  };
  const originalAppEnv = process.env.APP_ENV;

  let runProcessPayouts: jest.Mock;
  let runCheckReturnedTransfers: jest.Mock;
  let processor: PayoutScheduledProcessor;
  let tracker: CronTrackerService;
  let ids: number;

  /** A job of the payout-process repeatable at Bull attempt `attemptsMade`. */
  const scheduledJob = (state: Record<string, unknown> = {}): Job =>
    ({
      id: "repeat:payout-process:1761300000000",
      name: "payout-process",
      opts: { repeat: { cron: SCHEDULE, tz: TZ }, attempts: 3 },
      attemptsMade: 0,
      log: jest.fn().mockResolvedValue(undefined),
      ...state,
    }) as unknown as Job;

  const statuses = () => captureCheckIn.mock.calls.map(([c]) => c.status);

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Logger.prototype, "error").mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, "log").mockImplementation(() => undefined);
    ids = 0;
    captureCheckIn.mockImplementation(
      (checkIn: { checkInId?: string }) =>
        checkIn.checkInId ?? `check-in-${++ids}`,
    );
    getClient.mockReturnValue({});
    process.env.APP_ENV = "production";

    runProcessPayouts = jest.fn().mockResolvedValue(SUMMARY);
    runCheckReturnedTransfers = jest.fn().mockResolvedValue({ summary: "ok" });
    processor = new PayoutScheduledProcessor({
      runProcessPayouts,
      runCheckReturnedTransfers,
    } as unknown as PayoutSchedulerService);
    tracker = new CronTrackerService(); // registers itself in the holder
  });

  afterEach(() => {
    jest.restoreAllMocks();
    setCronTracker(null as unknown as CronTrackerService);
    if (originalAppEnv === undefined) delete process.env.APP_ENV;
    else process.env.APP_ENV = originalAppEnv;
  });

  /** One Bull slot: two failed attempts, then the retry that pays out. */
  async function slotThatRecoversOnTheThirdAttempt() {
    const first = new Error("paytr down");
    const second = new Error("paytr timeout");
    runProcessPayouts
      .mockRejectedValueOnce(first)
      .mockRejectedValueOnce(second)
      .mockResolvedValueOnce(SUMMARY);

    await expect(processor.handleProcess(scheduledJob())).rejects.toBe(first);
    await expect(
      processor.handleProcess(scheduledJob({ attemptsMade: 1 })),
    ).rejects.toBe(second);
    return processor.handleProcess(scheduledJob({ attemptsMade: 2 }));
  }

  it("returns the payout summary to Bull unchanged", async () => {
    const result = await processor.handleProcess(scheduledJob());

    expect(result).toEqual({
      ok: true,
      durationMs: expect.any(Number),
      ...SUMMARY,
    });
    expect(runProcessPayouts).toHaveBeenCalledTimes(1);
  });

  it("checks in once per automatic attempt, each pair closed with its own id and the monitor config", async () => {
    const result = await slotThatRecoversOnTheThirdAttempt();

    expect(result).toMatchObject({ ok: true, ...SUMMARY });
    expect(runProcessPayouts).toHaveBeenCalledTimes(3);
    expect(statuses()).toEqual([
      "in_progress",
      "error",
      "in_progress",
      "error",
      "in_progress",
      "ok",
    ]);
    const config = {
      schedule: { type: "crontab", value: SCHEDULE },
      timezone: TZ,
      checkinMargin: 10,
      maxRuntime: 30,
      failureIssueThreshold: 2,
      recoveryThreshold: 1,
    };
    captureCheckIn.mock.calls.forEach(([checkIn, sentConfig], i) => {
      expect(checkIn.monitorSlug).toBe("payout-process");
      expect(sentConfig).toEqual(config);
      if (i % 2 === 1) {
        expect(checkIn.checkInId).toBe(`check-in-${(i + 1) / 2}`);
      }
    });
    expect(tracker.list()).toEqual([
      expect.objectContaining({
        job: "payout-process",
        schedule: SCHEDULE,
        status: "success",
        runs: 3,
        failures: 2,
        lastError: null,
      }),
    ]);
  });

  it.each([
    [
      "a Bull Board retry of the exhausted job",
      { attemptsMade: 3, retriedOn: 1761300900000 },
    ],
    ["a Bull Board 'retry all' of the exhausted job", { attemptsMade: 3 }],
    [
      "a retry of a job retried by hand before",
      { attemptsMade: 1, retriedOn: 1761300900000 },
    ],
  ])("runs %s without a check-in or a tracked run", async (_case, state) => {
    await processor.handleProcess(scheduledJob());
    captureCheckIn.mockClear();

    const result = await processor.handleProcess(scheduledJob(state));

    expect(result).toMatchObject({ ok: true, ...SUMMARY });
    expect(runProcessPayouts).toHaveBeenCalledTimes(2);
    expect(captureCheckIn).not.toHaveBeenCalled();
    expect(tracker.list()[0]).toMatchObject({ runs: 1, schedule: SCHEDULE });
  });

  it("rethrows a hand retry's failure as is without an error check-in", async () => {
    const boom = new Error("paytr down");
    runProcessPayouts.mockRejectedValueOnce(boom);

    await expect(
      processor.handleProcess(
        scheduledJob({ attemptsMade: 3, retriedOn: 1761300900000 }),
      ),
    ).rejects.toBe(boom);

    expect(captureCheckIn).not.toHaveBeenCalled();
    expect(tracker.list()).toEqual([]);
  });

  it("runs the admin release fast path without a check-in", async () => {
    const job = {
      opts: { removeOnComplete: 50, removeOnFail: 50 },
      data: { manual: true, source: "admin-release", orderId: "o-1" },
      attemptsMade: 0,
      log: jest.fn().mockResolvedValue(undefined),
    } as unknown as Job;

    await expect(processor.handleProcess(job)).resolves.toMatchObject(SUMMARY);

    expect(captureCheckIn).not.toHaveBeenCalled();
    expect(tracker.list()).toEqual([]);
  });

  it.each([["staging"], ["development"], [undefined]])(
    "never checks in on APP_ENV %p, and the attempts behave the same",
    async (appEnv) => {
      if (appEnv === undefined) delete process.env.APP_ENV;
      else process.env.APP_ENV = appEnv;

      const result = await slotThatRecoversOnTheThirdAttempt();

      expect(result).toMatchObject({ ok: true, ...SUMMARY });
      expect(captureCheckIn).not.toHaveBeenCalled();
      expect(tracker.list()[0]).toMatchObject({ runs: 3, failures: 2 });
    },
  );

  it("does not check in for payout-check-returned, which has no monitor", async () => {
    await processor.handleCheckReturned({
      ...scheduledJob(),
      name: "payout-check-returned",
      opts: { repeat: { cron: "0 6 * * *", tz: TZ }, attempts: 3 },
    } as unknown as Job);

    expect(runCheckReturnedTransfers).toHaveBeenCalledTimes(1);
    expect(captureCheckIn).not.toHaveBeenCalled();
  });

  it("pays out once and keeps the result and the error when every Sentry call throws", async () => {
    captureCheckIn.mockImplementation(() => {
      throw new Error("sentry transport broken");
    });
    const boom = new Error("paytr down");
    runProcessPayouts.mockRejectedValueOnce(boom);

    await expect(processor.handleProcess(scheduledJob())).rejects.toBe(boom);
    await expect(
      processor.handleProcess(scheduledJob({ attemptsMade: 1 })),
    ).resolves.toMatchObject({ ok: true, ...SUMMARY });

    expect(runProcessPayouts).toHaveBeenCalledTimes(2);
    expect(tracker.list()[0]).toMatchObject({ status: "success", runs: 2 });
  });
});
