import {
  BadGatewayException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { UAT_REFRESH_TIMED_OUT_ERROR } from "@tarodan/types";
import { UatRefreshService } from "./uat-refresh.service";
import { hashReportToken } from "../helpers/uat-refresh.helper";
import { UatRefreshDispatchInputs } from "./uat-refresh-dispatch.service";

/**
 * Staging yenileme servisi: canlıda kapalı, tetikleyici yoksa 503, aynı anda
 * tek koşu (409), zaman aşımı engel değil, rapor yalnız koşunun kendi
 * token'ıyla ve yalnız bitmemiş koşuya yazılır.
 */
const NOW = new Date("2026-10-09T12:00:00Z");
const CONFIG = { token: "t", repo: "sigmoida/tarodan-app", ref: "development" };

type Row = Record<string, unknown>;

const runRow = (overrides: Row = {}): Row => ({
  id: "11111111-1111-4111-8111-111111111111",
  state: "queued",
  requestedById: "admin-user",
  requestedByName: "Tarodan",
  requestedAt: new Date("2026-10-09T11:50:00Z"),
  startedAt: null,
  finishedAt: null,
  workflowRunUrl: null,
  sourceSnapshotAt: null,
  dryRun: false,
  masked: [],
  migrationsApplied: [],
  backupFile: null,
  error: null,
  tokenHash: hashReportToken("the-token"),
  ...overrides,
});

describe("UatRefreshService", () => {
  const env = { NODE_ENV: process.env.NODE_ENV, APP_ENV: process.env.APP_ENV };
  afterEach(() => {
    process.env.NODE_ENV = env.NODE_ENV;
    if (env.APP_ENV === undefined) delete process.env.APP_ENV;
    else process.env.APP_ENV = env.APP_ENV;
  });
  const goLive = () => {
    process.env.NODE_ENV = "production";
    process.env.APP_ENV = "production";
  };

  const build = (
    options: {
      configured?: boolean;
      rows?: Row[];
      active?: Row[];
      dispatchOk?: boolean;
      found?: Row | null;
    } = {},
  ) => {
    const tx = {
      $executeRaw: jest.fn(async () => 1),
      uatRefreshRun: {
        findMany: jest.fn(async () => options.active ?? []),
        create: jest.fn(async ({ data }: { data: Row }) =>
          runRow({ ...data, id: "22222222-2222-4222-8222-222222222222" }),
        ),
      },
    };
    const prisma = {
      user: { findUnique: jest.fn(async () => ({ displayName: "Tarodan" })) },
      uatRefreshRun: {
        findMany: jest.fn(async () => options.rows ?? []),
        findUnique: jest.fn(async () =>
          options.found === undefined ? runRow() : options.found,
        ),
        update: jest.fn(async ({ data }: { data: Row }) =>
          runRow({ ...(options.found ?? {}), ...data }),
        ),
      },
      $transaction: jest.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
    };
    const dispatcher = {
      config: jest.fn(() => (options.configured === false ? null : CONFIG)),
      dispatch: jest.fn(
        async (_config: unknown, _inputs: UatRefreshDispatchInputs) =>
          options.dispatchOk === false
            ? {
                ok: false as const,
                error: "GitHub workflow dispatch failed: HTTP 404",
              }
            : { ok: true as const },
      ),
    };
    const service = new UatRefreshService(prisma as never, dispatcher as never);
    return { service, prisma, tx, dispatcher };
  };

  describe("getStatus", () => {
    it("is unavailable on production and reveals no history", async () => {
      goLive();
      const { service, prisma } = build({ rows: [runRow()] });
      await expect(service.getStatus(NOW)).resolves.toEqual({
        available: false,
        unavailableReason: "production",
        current: null,
        last: null,
        history: [],
      });
      expect(prisma.uatRefreshRun.findMany).not.toHaveBeenCalled();
    });

    it("is notConfigured without the GitHub trigger but still shows history", async () => {
      const { service } = build({
        configured: false,
        rows: [runRow({ state: "succeeded", finishedAt: NOW })],
      });
      const status = await service.getStatus(NOW);
      expect(status.available).toBe(false);
      expect(status.unavailableReason).toBe("notConfigured");
      expect(status.history).toHaveLength(1);
      expect(status.last?.state).toBe("succeeded");
    });

    it("splits the current run from the last finished one, newest first", async () => {
      const { service, prisma } = build({
        rows: [
          runRow({ id: "a", state: "running" }),
          runRow({ id: "b", state: "failed", finishedAt: NOW }),
          runRow({ id: "c", state: "succeeded", finishedAt: NOW }),
        ],
      });
      const status = await service.getStatus(NOW);
      expect(status.available).toBe(true);
      expect(status.current?.id).toBe("a");
      expect(status.last?.id).toBe("b");
      expect(prisma.uatRefreshRun.findMany).toHaveBeenCalledWith({
        orderBy: { requestedAt: "desc" },
        take: 10,
      });
    });

    it("shows a run stuck for over 90 minutes as failed (timed out), not current", async () => {
      const { service } = build({
        rows: [
          runRow({
            state: "running",
            requestedAt: new Date("2026-10-09T10:00:00Z"),
          }),
        ],
      });
      const status = await service.getStatus(NOW);
      expect(status.current).toBeNull();
      expect(status.last).toMatchObject({
        state: "failed",
        error: UAT_REFRESH_TIMED_OUT_ERROR,
      });
    });
  });

  describe("start", () => {
    const dto = { confirm: "STAGING" as const, dryRun: true };

    it("is refused on production", async () => {
      goLive();
      const { service, dispatcher } = build();
      await expect(
        service.start("admin-user", dto, NOW),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(dispatcher.dispatch).not.toHaveBeenCalled();
    });

    it("answers 503 notConfigured without the GitHub trigger", async () => {
      const { service, prisma } = build({ configured: false });
      const error = await service.start("admin-user", dto, NOW).catch((e) => e);
      expect(error).toBeInstanceOf(ServiceUnavailableException);
      expect(error.getResponse()).toMatchObject({
        i18nKey: "server.uatRefresh.notConfigured",
      });
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it("answers 409 while another run is queued or running", async () => {
      const { service, tx, dispatcher } = build({
        active: [runRow({ state: "running" })],
      });
      await expect(
        service.start("admin-user", dto, NOW),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(tx.$executeRaw).toHaveBeenCalled(); // advisory lock first
      expect(tx.uatRefreshRun.create).not.toHaveBeenCalled();
      expect(dispatcher.dispatch).not.toHaveBeenCalled();
    });

    it("does not let a timed-out run block a new one", async () => {
      const { service, tx } = build({
        active: [
          runRow({
            state: "running",
            requestedAt: new Date("2026-10-09T09:00:00Z"),
          }),
        ],
      });
      await expect(
        service.start("admin-user", dto, NOW),
      ).resolves.toMatchObject({
        state: "queued",
      });
      expect(tx.uatRefreshRun.create).toHaveBeenCalled();
    });

    it("records a queued run with the hashed token and dispatches the workflow with the plain one", async () => {
      const { service, tx, dispatcher } = build();
      const run = await service.start("admin-user", dto, NOW);

      const created = (
        tx.uatRefreshRun.create.mock.calls[0] as unknown as [{ data: Row }]
      )[0].data;
      expect(created).toMatchObject({
        state: "queued",
        requestedById: "admin-user",
        requestedByName: "Tarodan",
        dryRun: true,
      });
      const [config, inputs] = dispatcher.dispatch.mock.calls[0];
      expect(config).toBe(CONFIG);
      expect(inputs).toMatchObject({ runId: run.id, dryRun: true });
      expect(inputs.reportToken).toMatch(/^[0-9a-f]{64}$/);
      expect(created.tokenHash).toBe(hashReportToken(inputs.reportToken));
      expect(created.tokenHash).not.toBe(inputs.reportToken);
      expect(run).toMatchObject({
        state: "queued",
        requestedBy: { id: "admin-user", displayName: "Tarodan" },
        dryRun: true,
      });
      expect(JSON.stringify(run)).not.toContain(inputs.reportToken);
    });

    it("marks the run failed and answers 502 when GitHub refuses the dispatch", async () => {
      const { service, prisma } = build({ dispatchOk: false });
      await expect(
        service.start("admin-user", dto, NOW),
      ).rejects.toBeInstanceOf(BadGatewayException);
      expect(prisma.uatRefreshRun.update).toHaveBeenCalledWith({
        where: { id: "22222222-2222-4222-8222-222222222222" },
        data: expect.objectContaining({
          state: "failed",
          error: "GitHub workflow dispatch failed: HTTP 404",
        }),
      });
    });
  });

  describe("report", () => {
    const runId = "11111111-1111-4111-8111-111111111111";

    it("does not exist on production", async () => {
      goLive();
      const { service } = build();
      await expect(
        service.report(runId, "the-token", { state: "running" }, NOW),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it("refuses a wrong or missing token, and an unknown run, the same way", async () => {
      const { service, prisma } = build();
      for (const token of ["wrong", undefined]) {
        await expect(
          service.report(runId, token, { state: "running" }, NOW),
        ).rejects.toBeInstanceOf(ForbiddenException);
      }
      const unknown = build({ found: null });
      await expect(
        unknown.service.report(runId, "the-token", { state: "running" }, NOW),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.uatRefreshRun.update).not.toHaveBeenCalled();
    });

    it("refuses to rewrite a finished run", async () => {
      const { service } = build({ found: runRow({ state: "succeeded" }) });
      await expect(
        service.report(
          runId,
          "the-token",
          { state: "failed", error: "x" },
          NOW,
        ),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it("marks the run running with the workflow link", async () => {
      const { service, prisma } = build();
      await service.report(
        runId,
        "the-token",
        {
          state: "running",
          startedAt: "2026-10-09T11:55:00Z",
          workflowRunUrl:
            "https://github.com/sigmoida/tarodan-app/actions/runs/9",
        },
        NOW,
      );
      expect(prisma.uatRefreshRun.update).toHaveBeenCalledWith({
        where: { id: runId },
        data: {
          state: "running",
          startedAt: new Date("2026-10-09T11:55:00Z"),
          workflowRunUrl:
            "https://github.com/sigmoida/tarodan-app/actions/runs/9",
        },
      });
    });

    it("stores the full summary on success and clears any error", async () => {
      const { service, prisma } = build({
        found: runRow({ state: "running" }),
      });
      await service.report(
        runId,
        "the-token",
        {
          state: "succeeded",
          finishedAt: "2026-10-09T12:30:00Z",
          sourceSnapshotAt: "2026-10-09T12:00:00Z",
          masked: [{ table: "users", rows: 120 }],
          migrationsApplied: ["20261009100000_uat_refresh_runs"],
          backupFile: "staging-pre-refresh-20261009-120000.sql.gz",
        },
        NOW,
      );
      expect(prisma.uatRefreshRun.update).toHaveBeenCalledWith({
        where: { id: runId },
        data: expect.objectContaining({
          state: "succeeded",
          finishedAt: new Date("2026-10-09T12:30:00Z"),
          sourceSnapshotAt: new Date("2026-10-09T12:00:00Z"),
          masked: [{ table: "users", rows: 120 }],
          migrationsApplied: ["20261009100000_uat_refresh_runs"],
          backupFile: "staging-pre-refresh-20261009-120000.sql.gz",
          error: null,
        }),
      });
    });

    it("accepts a late report for a run that already looks timed out", async () => {
      const { service, prisma } = build({
        found: runRow({
          state: "running",
          requestedAt: new Date("2026-10-09T09:00:00Z"),
        }),
      });
      await service.report(
        runId,
        "the-token",
        { state: "failed", error: "pg_restore failed" },
        NOW,
      );
      expect(prisma.uatRefreshRun.update).toHaveBeenCalledWith({
        where: { id: runId },
        data: expect.objectContaining({
          state: "failed",
          finishedAt: NOW,
          error: "pg_restore failed",
        }),
      });
    });
  });
});
