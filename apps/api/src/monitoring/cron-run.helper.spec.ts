import type { Job } from "bull";
import { runTrackedJob } from "./cron-run.helper";
import { setCronTracker } from "./cron-tracker.holder";
import type { CronTrackerService } from "./cron-tracker.service";

/**
 * runTrackedJob izleme sözleşmesi.
 *
 * Kritik olan ayrım: CronTracker (+/admin/jobs sayaçları + Sentry cron
 * check-in'i) YALNIZ zamanlanmış (repeatable) koşumları görmeli. Manuel fişler
 * (test aracı, admin-release fast-path'i, Bull Board retry) tracker'dan
 * geçseydi schedule "bull"a ezilir, sayaçlar kirlenir ve Sentry monitörü ya
 * yanlış alarm üretir ya da gerçekten kaçmış koşumun alarmını maskelerdi.
 */
describe("runTrackedJob", () => {
  const makeJob = (opts: Record<string, unknown>): Job =>
    ({
      opts,
      log: jest.fn().mockResolvedValue(undefined),
    }) as unknown as Job;

  const makeTracker = () => {
    const tracker = {
      track: jest.fn(
        <T>(
          _job: string,
          _schedule: string,
          fn: () => Promise<T> | T,
          _run?: unknown,
        ) => Promise.resolve(fn()),
      ),
    } as unknown as CronTrackerService;
    setCronTracker(tracker);
    return tracker;
  };

  afterEach(() => {
    // Holder süreç-geneli tekil — sonraki test dosyalarına sızmasın.
    setCronTracker(null as unknown as CronTrackerService);
  });

  it("repeatable fiş tracker'dan geçer ve schedule cron ifadesidir", async () => {
    const tracker = makeTracker();
    const job = makeJob({ repeat: { cron: "*/15 * * * *" } });

    const res = await runTrackedJob(job, "payout-process", () => ({
      summary: "2 işlendi",
    }));

    expect(tracker.track).toHaveBeenCalledWith(
      "payout-process",
      "*/15 * * * *",
      expect.any(Function),
      { timezone: undefined, jobId: undefined, finalAttempt: true },
    );
    expect(res.ok).toBe(true);
    expect(res.summary).toBe("2 işlendi");
  });

  it("passes the repeatable's time zone, the job id and the attempt to the tracker", async () => {
    const tracker = makeTracker();
    const job = {
      ...makeJob({
        repeat: { cron: "*/15 * * * *", tz: "Europe/Istanbul" },
        attempts: 3,
      }),
      id: "repeat:abc:1761300000000",
      attemptsMade: 1,
    } as unknown as Job;

    await runTrackedJob(job, "payout-process", () => undefined);

    expect(tracker.track).toHaveBeenCalledWith(
      "payout-process",
      "*/15 * * * *",
      expect.any(Function),
      {
        timezone: "Europe/Istanbul",
        jobId: "repeat:abc:1761300000000",
        finalAttempt: false,
      },
    );
  });

  it("marks the last automatic attempt as final", async () => {
    const tracker = makeTracker();
    const job = {
      ...makeJob({ repeat: { cron: "*/15 * * * *" }, attempts: 3 }),
      id: 42,
      attemptsMade: 2,
    } as unknown as Job;

    await runTrackedJob(job, "payout-process", () => undefined);

    expect(tracker.track).toHaveBeenCalledWith(
      "payout-process",
      "*/15 * * * *",
      expect.any(Function),
      expect.objectContaining({ jobId: "42", finalAttempt: true }),
    );
  });

  it.each([
    ["retried from Bull Board", { attemptsMade: 1, retriedOn: 1761300000000 }],
    ["run again after its attempts were used up", { attemptsMade: 3 }],
  ])(
    "does not track a scheduled job %s, but still runs it",
    async (_case, state) => {
      const tracker = makeTracker();
      const fn = jest.fn().mockResolvedValue({ summary: "retried" });
      const job = {
        ...makeJob({ repeat: { cron: "*/15 * * * *" }, attempts: 3 }),
        ...state,
      } as unknown as Job;

      const res = await runTrackedJob(job, "payout-process", fn);

      expect(tracker.track).not.toHaveBeenCalled();
      expect(fn).toHaveBeenCalled();
      expect(res).toMatchObject({ ok: true, summary: "retried" });
    },
  );

  it("does not track a manual run even when it carries a time zone", async () => {
    const tracker = makeTracker();
    const job = makeJob({ repeat: { tz: "Europe/Istanbul" } });

    await runTrackedJob(job, "payout-process", () => undefined);

    expect(tracker.track).not.toHaveBeenCalled();
  });

  it("manuel fiş (repeat yok) tracker'a GİRMEZ ama iş yine koşar", async () => {
    const tracker = makeTracker();
    const fn = jest.fn().mockResolvedValue({ summary: "manuel" });
    const job = makeJob({});

    const res = await runTrackedJob(job, "payout-process", fn);

    expect(tracker.track).not.toHaveBeenCalled();
    expect(fn).toHaveBeenCalled();
    expect(res).toMatchObject({ ok: true, summary: "manuel" });
  });

  it("data.manual bilgilendirme amaçlıdır — ayrımı opts.repeat yokluğu yapar", async () => {
    const tracker = makeTracker();
    const job = {
      opts: {},
      data: { manual: true, source: "admin-release" },
      log: jest.fn().mockResolvedValue(undefined),
    } as unknown as Job;

    await runTrackedJob(job, "payout-process", () => undefined);

    expect(tracker.track).not.toHaveBeenCalled();
  });

  it("manuel fişte hata rethrow edilir (Bull 'failed' işaretlesin)", async () => {
    makeTracker();
    const job = makeJob({});

    await expect(
      runTrackedJob(job, "ornek-is", () => {
        throw new Error("patladı");
      }),
    ).rejects.toThrow("patladı");
  });

  it("tracker hiç set edilmemişse iş sarılmadan koşar", async () => {
    setCronTracker(null as unknown as CronTrackerService);
    const job = makeJob({ repeat: { cron: "0 * * * *" } });

    const res = await runTrackedJob(job, "ornek-is", () => ({
      stats: { done: 1 },
    }));

    expect(res.ok).toBe(true);
    expect(res.stats).toEqual({ done: 1 });
  });
});
