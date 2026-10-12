import { readFileSync } from "node:fs";
import { join } from "node:path";
import "reflect-metadata";
import { apiAppRoot } from "../../../common/helpers/app-root";
import { CRON_CATALOG } from "../../../workers/cron-catalog";
import { NetsisAccountingScheduledProcessor } from "./netsis-accounting-scheduled.processor";
import {
  NETSIS_ACCOUNTING_CRON,
  NetsisAccountingSchedulerService,
} from "./netsis-accounting-scheduler.service";

// @nestjs/bull dekorator metadata anahtarları (cron-catalog.contract.spec ile aynı).
const BULL_QUEUE_META = "bull:module_queue";
const BULL_PROCESS_META = "bull:module_queue_process";

describe("Netsis muhasebe cron'u", () => {
  it("processor 'scheduled' kuyruğunda, katalogdaki anahtarla çalışır", () => {
    expect(
      Reflect.getMetadata(BULL_QUEUE_META, NetsisAccountingScheduledProcessor),
    ).toMatchObject({ name: "scheduled" });
    expect(
      Reflect.getMetadata(
        BULL_PROCESS_META,
        NetsisAccountingScheduledProcessor.prototype.handleRetry,
      ),
    ).toMatchObject({ name: NETSIS_ACCOUNTING_CRON });
    const entry = CRON_CATALOG.find((c) => c.key === NETSIS_ACCOUNTING_CRON);
    expect(entry).toMatchObject({ triggerable: true });
  });

  it("processor modülde rol kapısıyla (scheduledProcessors) kayıtlı — web rolünde tüketici olmaz", () => {
    // Dosya yolu app-root'tan (CLAUDE.md §1): spec taşınsa da kırılmaz.
    const moduleSource = readFileSync(
      join(apiAppRoot(), "src/modules/invoicing/invoicing.module.ts"),
      "utf8",
    );
    expect(moduleSource).toMatch(
      /scheduledProcessors\([\s\S]*NetsisAccountingScheduledProcessor[\s\S]*\)/,
    );
  });

  it("15 dakikada bir repeatable olarak kaydolur", async () => {
    const queue = {
      getRepeatableJobs: jest.fn().mockResolvedValue([]),
      removeRepeatableByKey: jest.fn(),
      add: jest.fn().mockResolvedValue(undefined),
    };
    const scheduler = new NetsisAccountingSchedulerService(
      {} as never,
      {} as never,
      queue as never,
    );
    await scheduler.onModuleInit();
    expect(queue.add).toHaveBeenCalledWith(
      NETSIS_ACCOUNTING_CRON,
      expect.anything(),
      expect.objectContaining({
        repeat: expect.objectContaining({ cron: "*/15 * * * *" }),
      }),
    );
  });

  describe("run", () => {
    const build = () => {
      const sync = { sweep: jest.fn().mockResolvedValue(2) };
      const posting = {
        runPending: jest
          .fn()
          .mockResolvedValue({ state: "ran", synced: 3, failed: 1 }),
        reportExhausted: jest.fn().mockResolvedValue(1),
      };
      const scheduler = new NetsisAccountingSchedulerService(
        sync as never,
        posting as never,
        {} as never,
      );
      return { scheduler, sync, posting };
    };

    it("süpürme → yazma → alarm sırasıyla koşar ve özet döner", async () => {
      const { scheduler, sync, posting } = build();
      const log = jest.fn();
      const result = await scheduler.run(log);
      expect(sync.sweep).toHaveBeenCalled();
      expect(posting.runPending).toHaveBeenCalled();
      expect(posting.reportExhausted).toHaveBeenCalled();
      expect(
        sync.sweep.mock.invocationCallOrder[0],
      ).toBeLessThan(posting.runPending.mock.invocationCallOrder[0]);
      expect(result.stats).toEqual({
        opened: 2,
        synced: 3,
        failed: 1,
        exhausted: 1,
      });
      expect(log).toHaveBeenCalledWith(result.summary);
    });

    it("hata yutulmaz: Bull job'ı failed olsun (Sentry check-in)", async () => {
      const { scheduler, posting } = build();
      posting.runPending.mockRejectedValue(new Error("db down"));
      await expect(scheduler.run()).rejects.toThrow("db down");
    });
  });
});
