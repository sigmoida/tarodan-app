import * as fs from "fs";
import * as path from "path";
import "reflect-metadata";
import type { Job } from "bull";
import { setCronTracker } from "../monitoring/cron-tracker.holder";
import type { CronTrackerService } from "../monitoring/cron-tracker.service";
import { toSentryCrontab } from "../monitoring/cron-monitor-config";
import { CRON_CATALOG, cronMonitorFor } from "./cron-catalog";

/**
 * SÖZLEŞME: cron kataloğu ile `scheduled` kuyruğunun gerçek @Process
 * işleyicileri birebir aynı kümedir.
 *
 * Neden: eski test-tools listesi elle yazılmıştı ve 4 işte Bull job adından
 * kaymıştı (check-expired-memberships ↔ membership-expired-downgrades gibi);
 * ayrıca Bull'da hiç var olmayan bir anahtar taşıyordu. Elle tetikleme artık
 * kuyruğa fiş attığı için yanlış anahtar = işleyicisi olmayan, sonsuza dek
 * bekleyen fiş demektir. Bu spec iki yönlü eşitliği zorlar:
 *  - katalogda olup işleyicisi olmayan anahtar → tetiklenen fiş askıda kalır,
 *  - işleyicisi olup katalogda olmayan iş → envanterden/karardan kaçmış demektir
 *    (triggerable kararı bilinçli verilmeli).
 *
 * İşleyiciler dosya sisteminden keşfedilir (house adlandırması: *.processor.ts
 * ve *.scheduler.ts) ve @nestjs/bull'un dekorator metadata'sından okunur —
 * ikinci bir elle liste tutulmaz.
 */

// @nestjs/bull'un dekorator metadata anahtarları (public export edilmiyor).
const BULL_QUEUE_META = "bull:module_queue";
const BULL_PROCESS_META = "bull:module_queue_process";

function findProcessorFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...findProcessorFiles(full));
    } else if (
      (entry.name.endsWith(".processor.ts") ||
        entry.name.endsWith(".scheduler.ts")) &&
      !entry.name.endsWith(".spec.ts")
    ) {
      out.push(full);
    }
  }
  return out;
}

/** A `@Process(name)` handler on the `scheduled` queue. */
interface ScheduledHandler {
  name: string;
  handler: (job: Job) => unknown;
}

/** Every `@Process` handler registered on the `scheduled` queue. */
function collectScheduledHandlers(): ScheduledHandler[] {
  const handlers: ScheduledHandler[] = [];
  const files = findProcessorFiles(path.join(__dirname, ".."));
  for (const file of files) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require(file) as Record<string, unknown>;
    for (const exported of Object.values(mod)) {
      if (typeof exported !== "function") continue;
      const queueMeta = Reflect.getMetadata(BULL_QUEUE_META, exported) as
        { name?: string } | undefined;
      if (queueMeta?.name !== "scheduled") continue;
      for (const prop of Object.getOwnPropertyNames(exported.prototype)) {
        const handler = (exported.prototype as Record<string, unknown>)[prop];
        if (typeof handler !== "function") continue;
        const processMeta = Reflect.getMetadata(BULL_PROCESS_META, handler) as
          { name?: string } | undefined;
        if (processMeta?.name) {
          handlers.push({
            name: processMeta.name,
            handler: handler as ScheduledHandler["handler"],
          });
        }
      }
    }
  }
  return handlers;
}

/** The job names of every `@Process` handler on the `scheduled` queue. */
function collectScheduledJobNames(): Set<string> {
  return new Set(collectScheduledHandlers().map((h) => h.name));
}

describe("cron-catalog sözleşmesi", () => {
  const handlerNames = collectScheduledJobNames();
  const catalogKeys = CRON_CATALOG.map((c) => c.key);

  it("keşif çalışıyor (en az bir scheduled işleyicisi bulundu)", () => {
    expect(handlerNames.size).toBeGreaterThan(0);
  });

  it("katalog anahtarları benzersizdir", () => {
    expect(new Set(catalogKeys).size).toBe(catalogKeys.length);
  });

  it("katalogdaki her anahtarın scheduled kuyruğunda işleyicisi vardır", () => {
    const orphans = catalogKeys.filter((k) => !handlerNames.has(k));
    expect(orphans).toEqual([]);
  });

  it("scheduled kuyruğundaki her işleyici katalogda kayıtlıdır", () => {
    const unlisted = [...handlerNames].filter((n) => !catalogKeys.includes(n));
    expect(unlisted).toEqual([]);
  });
});

/** Every `registerRepeatableCron(queue, "<key>", "<cron>", ...)` in src. */
function collectRegisteredSchedules(): Map<string, string> {
  const schedules = new Map<string, string>();
  const walk = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".spec.ts")) {
        const source = fs.readFileSync(full, "utf8");
        for (const m of source.matchAll(
          /registerRepeatableCron\(\s*[^,]+,\s*"([^"]+)",\s*"([^"]+)"/g,
        )) {
          schedules.set(m[1], m[2]);
        }
      }
    }
  };
  walk(path.join(__dirname, ".."));
  return schedules;
}

/**
 * CONTRACT: the Sentry cron monitors. The plan includes one monitor and it is
 * spent on payout-process (a silent stop leaves sellers unpaid). A new monitor
 * is a plan and alert decision: change this list on purpose. Sentry rejects a
 * monitor config with a non-positive margin, runtime or threshold, or a
 * schedule outside plain crontab, and then drops every check-in of the job.
 * The thresholds are tuned to the registered schedule, so it is pinned here.
 */
describe("cron-catalog Sentry monitors", () => {
  const monitored = CRON_CATALOG.flatMap((c) =>
    c.monitor ? [{ key: c.key, monitor: c.monitor }] : [],
  );
  const schedules = collectRegisteredSchedules();

  it("monitors payout-process only", () => {
    expect(monitored.map((c) => c.key)).toEqual(["payout-process"]);
  });

  it.each(monitored.map((c) => [c.key, c.monitor] as const))(
    "%s has positive whole-number settings",
    (_key, monitor) => {
      for (const value of [
        monitor.checkinMarginMinutes,
        monitor.maxRuntimeMinutes,
        monitor.failureIssueThreshold,
        monitor.recoveryThreshold,
      ]) {
        expect(Number.isInteger(value)).toBe(true);
        expect(value).toBeGreaterThanOrEqual(1);
      }
    },
  );

  it.each(monitored.map((c) => [c.key] as const))(
    "%s is registered with a schedule Sentry accepts",
    (key) => {
      const schedule = schedules.get(key);
      expect(schedule).toBeDefined();
      expect(toSentryCrontab(schedule ?? "")).toBeDefined();
    },
  );

  it("pins the payout-process schedule and the thresholds tuned to it", () => {
    expect(schedules.get("payout-process")).toBe("*/15 * * * *");
    expect(cronMonitorFor("payout-process")).toEqual({
      checkinMarginMinutes: 10,
      maxRuntimeMinutes: 30,
      failureIssueThreshold: 2,
      recoveryThreshold: 1,
    });
  });

  it("has no monitor for an unknown or unmonitored job", () => {
    expect(cronMonitorFor("payment-expired")).toBeUndefined();
    expect(cronMonitorFor("no-such-job")).toBeUndefined();
  });
});

/**
 * CONTRACT: every scheduled handler is tracked under its own `@Process` key.
 * The tracker finds a job's Sentry monitor (and the /admin/jobs row) by the
 * name the handler passes to `runTrackedJob`, not by the Bull job name: a
 * handler that passed another name would make payout-process check in under
 * no monitor, and Sentry would never raise a missed or failed payout run.
 * Each handler is called with a scheduled job and a tracker that records the
 * name without running the job, so no business code runs here.
 */
describe("cron-catalog tracked names", () => {
  afterEach(() => setCronTracker(null as unknown as CronTrackerService));

  it.each(collectScheduledHandlers().map((h) => [h.name, h] as const))(
    "%s is tracked under its own key",
    async (name, { handler }) => {
      const track = jest.fn().mockResolvedValue(undefined);
      setCronTracker({ track } as unknown as CronTrackerService);
      const job = {
        name,
        opts: {
          repeat: { cron: "*/15 * * * *", tz: "Europe/Istanbul" },
          attempts: 3,
        },
        attemptsMade: 0,
        log: jest.fn().mockResolvedValue(undefined),
      } as unknown as Job;

      await handler.call({}, job);

      expect(track).toHaveBeenCalledTimes(1);
      expect(track.mock.calls[0][0]).toBe(name);
    },
  );
});
