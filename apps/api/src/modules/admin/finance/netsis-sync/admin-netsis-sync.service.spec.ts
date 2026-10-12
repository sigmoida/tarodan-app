import { Reflector } from "@nestjs/core";
import { AdminRole, Prisma, type NetsisSyncRecord } from "@prisma/client";
import { ROLES_KEY } from "../../../auth/decorators/roles.decorator";
import { PERMISSION_MAP } from "../../../auth/guards/roles.guard";
import { AdminNetsisSyncController } from "./admin-netsis-sync.controller";
import {
  AdminNetsisSyncService,
  toAdminNetsisSyncRow,
} from "./admin-netsis-sync.service";

const record = (over: Partial<NetsisSyncRecord> = {}): NetsisSyncRecord => ({
  id: "rec-1",
  kind: "payout_transfer",
  sourceType: "payout_transfer",
  sourceId: "p-1",
  idempotencyKey: "payout_transfer:p-1",
  status: "failed",
  attemptCount: 8,
  lastAttemptAt: new Date("2026-10-05T10:00:00Z"),
  lastError: "validation: TUTAR",
  netsisRef: null,
  payload: { TUTAR: "845.10" },
  amount: new Prisma.Decimal("845.10"),
  syncedAt: null,
  createdAt: new Date("2026-10-05T09:00:00Z"),
  updatedAt: new Date("2026-10-05T10:00:00Z"),
  ...over,
});

describe("AdminNetsisSyncService", () => {
  const build = () => {
    const prisma = {
      netsisSyncRecord: {
        count: jest.fn().mockResolvedValue(1),
        findMany: jest.fn().mockResolvedValue([record()]),
      },
    };
    const sync = { resetForRetry: jest.fn() };
    const audit = {
      createRequiredAuditLog: jest.fn().mockResolvedValue(undefined),
    };
    const service = new AdminNetsisSyncService(
      prisma as never,
      sync as never,
      audit as never,
    );
    return { service, prisma, sync, audit };
  };

  it("list: tür/durum/tarih filtresi, ortak sayfalama zarfı, varsayılan sıra en yeni", async () => {
    const { service, prisma } = build();
    const result = await service.list({
      kind: "payout_transfer",
      status: "failed",
      startDate: "2026-10-01",
      page: 2,
      limit: 10,
    });

    const args = prisma.netsisSyncRecord.findMany.mock.calls[0][0];
    expect(args.where).toMatchObject({
      kind: "payout_transfer",
      status: "failed",
      createdAt: { gte: new Date("2026-10-01") },
    });
    expect(args.orderBy).toEqual({ createdAt: "desc" });
    expect(args.skip).toBe(10);
    expect(args.take).toBe(10);
    expect(result.meta).toEqual({
      total: 1,
      page: 2,
      limit: 10,
      totalPages: 1,
    });
    expect(result.data[0]).toMatchObject({
      id: "rec-1",
      amount: 845.1,
      exhausted: true,
    });
  });

  it("satır: Decimal sayıya, tükenmişlik bayrağı yalnız failed + bütçe dolu", () => {
    expect(toAdminNetsisSyncRow(record({ amount: null })).amount).toBeNull();
    expect(
      toAdminNetsisSyncRow(record({ attemptCount: 3 })).exhausted,
    ).toBe(false);
    expect(
      toAdminNetsisSyncRow(record({ status: "pending", attemptCount: 9 }))
        .exhausted,
    ).toBe(false);
  });

  it("retry: domain servisinden geçer ve ZORUNLU denetimi aynı işlemde yazar", async () => {
    const { service, sync, audit } = build();
    const tx = { tag: "tx" };
    sync.resetForRetry.mockImplementation(
      async (
        _id: string,
        opts: { afterWrite: (...args: unknown[]) => Promise<void> },
      ) => {
        await opts.afterWrite(
          tx,
          { status: "failed", attemptCount: 8, lastError: "x", netsisRef: null },
          { status: "pending", attemptCount: 0, lastError: null, netsisRef: null },
        );
        return record({ status: "pending", attemptCount: 0 });
      },
    );

    const row = await service.retry("admin-1", "rec-1");

    expect(sync.resetForRetry).toHaveBeenCalledWith(
      "rec-1",
      expect.objectContaining({ netsisRef: undefined }),
    );
    expect(audit.createRequiredAuditLog).toHaveBeenCalledWith(
      "admin-1",
      "netsis_sync_retry",
      "NetsisSyncRecord",
      "rec-1",
      expect.objectContaining({ status: "failed" }),
      expect.objectContaining({ status: "pending" }),
      tx,
    );
    expect(row.status).toBe("pending");
  });

  it("retry + netsisRef: elle eşleştirme ayrı denetim eylemiyle", async () => {
    const { service, sync, audit } = build();
    sync.resetForRetry.mockImplementation(
      async (
        _id: string,
        opts: { afterWrite: (...args: unknown[]) => Promise<void> },
      ) => {
        await opts.afterWrite({}, {}, {});
        return record({ status: "synced", netsisRef: "4711" });
      },
    );
    await service.retry("admin-1", "rec-1", "4711");
    expect(sync.resetForRetry).toHaveBeenCalledWith(
      "rec-1",
      expect.objectContaining({ netsisRef: "4711" }),
    );
    expect(audit.createRequiredAuditLog.mock.calls[0][1]).toBe(
      "netsis_sync_mark_synced",
    );
  });

  it("denetim yazılamazsa hata yükselir (domain işlemi geri alınır)", async () => {
    const { service, sync, audit } = build();
    audit.createRequiredAuditLog.mockRejectedValue(new Error("audit down"));
    sync.resetForRetry.mockImplementation(
      async (
        _id: string,
        opts: { afterWrite: (...args: unknown[]) => Promise<void> },
      ) => {
        await opts.afterWrite({}, {}, {});
        return record();
      },
    );
    await expect(service.retry("admin-1", "rec-1")).rejects.toThrow(
      "audit down",
    );
  });
});

describe("AdminNetsisSyncController — yetki", () => {
  const proto = AdminNetsisSyncController.prototype;

  it("iki uç da super_admin + admin", () => {
    for (const method of ["list", "retry"] as const) {
      expect(new Reflector().get<string[]>(ROLES_KEY, proto[method])).toEqual([
        AdminRole.super_admin,
        AdminRole.admin,
      ]);
    }
  });

  it("segment izin matrisinde settings iznine bağlı (Faturalama Ayarları ile aynı)", () => {
    expect(PERMISSION_MAP.invoicing).toEqual(["settings"]);
  });

  it("yeniden deneme ucu kendi @Throttle sınırını taşır", () => {
    const keys = Reflect.getMetadataKeys(proto.retry);
    expect(keys.some((k) => String(k).includes("THROTTLER"))).toBe(true);
  });
});
