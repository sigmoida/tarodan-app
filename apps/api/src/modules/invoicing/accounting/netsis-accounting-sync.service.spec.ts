import { ConflictException, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { OutboxHandlerRegistry } from "../../outbox/outbox-handler.registry";
import {
  OUTBOX_NETSIS_ACCOUNTING_SYNC,
  netsisAccountingSyncEvent,
} from "../../outbox/outbox.types";
import { NETSIS_ACCOUNTING_SETTING_KEYS } from "./netsis-accounting-settings";
import type { NetsisAccountingSourceLoad } from "./netsis-accounting-source.service";
import {
  NETSIS_SYNC_SWEEP_BATCH,
  NetsisAccountingSyncService,
} from "./netsis-accounting-sync.service";

const A = NETSIS_ACCOUNTING_SETTING_KEYS;

const READY: NetsisAccountingSourceLoad = {
  state: "ready",
  source: {
    kind: "payout_transfer",
    reference: "PTR-1",
    amount: new Prisma.Decimal("10.00"),
    completedAt: new Date("2026-10-05T10:00:00Z"),
    seller: { name: "Ayşe", taxId: null, adminCode: "B010001" },
    ibanLast4: "1234",
  },
};

function uniqueViolation() {
  return new Prisma.PrismaClientKnownRequestError("dup", {
    code: "P2002",
    clientVersion: "test",
  });
}

describe("NetsisAccountingSyncService", () => {
  const originalProvider = process.env.INVOICE_PROVIDER;
  afterEach(() => {
    if (originalProvider === undefined) delete process.env.INVOICE_PROVIDER;
    else process.env.INVOICE_PROVIDER = originalProvider;
  });

  const build = (
    opts: {
      existing?: Record<string, unknown> | null;
      load?: NetsisAccountingSourceLoad;
      enabled?: boolean;
      provider?: "netsis" | "elogo";
    } = {},
  ) => {
    process.env.INVOICE_PROVIDER = opts.provider ?? "netsis";
    const created: Array<Record<string, unknown>> = [];
    const prisma = {
      netsisSyncRecord: {
        findUnique: jest.fn().mockResolvedValue(opts.existing ?? null),
        create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
          created.push(data);
          return { id: "rec-1", ...data };
        }),
      },
      platformSetting: {
        findMany: jest.fn().mockResolvedValue(
          opts.enabled === false
            ? []
            : [{ settingKey: A.enabled, settingValue: "true" }],
        ),
      },
      $queryRaw: jest.fn().mockResolvedValue([]),
      $transaction: jest.fn(),
    };
    const sources = {
      load: jest.fn().mockResolvedValue(opts.load ?? READY),
    };
    const registry = new OutboxHandlerRegistry();
    const service = new NetsisAccountingSyncService(
      prisma as never,
      sources as never,
      registry,
    );
    return { service, prisma, sources, registry, created };
  };

  describe("enqueue", () => {
    it("açık senkronda kaynak başına TEK pending satır açar", async () => {
      const { service, created } = build();
      const record = await service.enqueue("payout_transfer", "p-1");
      expect(created).toEqual([
        {
          kind: "payout_transfer",
          sourceType: "payout_transfer",
          sourceId: "p-1",
          idempotencyKey: "payout_transfer:p-1",
          status: "pending",
          lastError: null,
        },
      ]);
      expect(record).toMatchObject({ status: "pending" });
    });

    it("idempotent: satır varsa kaynağa bile bakmadan onu döndürür", async () => {
      const existing = { id: "rec-0", status: "synced" };
      const { service, prisma, sources } = build({ existing });
      await expect(service.enqueue("payout_transfer", "p-1")).resolves.toBe(
        existing,
      );
      expect(sources.load).not.toHaveBeenCalled();
      expect(prisma.netsisSyncRecord.create).not.toHaveBeenCalled();
    });

    it("yarışta tekil anahtar çakışması mevcut satırı döndürür", async () => {
      const { service, prisma } = build();
      const winner = { id: "rec-other", status: "pending" };
      prisma.netsisSyncRecord.findUnique
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(winner);
      prisma.netsisSyncRecord.create.mockRejectedValueOnce(uniqueViolation());
      await expect(service.enqueue("payout_transfer", "p-1")).resolves.toBe(
        winner,
      );
    });

    it("senkron KAPALIYKEN satır skipped açılır (sonra yeniden kuyruğa alınabilsin)", async () => {
      const { service, created } = build({ enabled: false });
      await service.enqueue("payout_transfer", "p-1");
      expect(created[0]).toMatchObject({ status: "skipped" });
      expect(created[0].lastError).toEqual(expect.any(String));
    });

    it("fatura sağlayıcısı Netsis değilse de skipped", async () => {
      const { service, created } = build({ provider: "elogo" });
      await service.enqueue("refund_reversal", "a-1");
      expect(created[0]).toMatchObject({ status: "skipped" });
    });

    it("aynalanacak hareket değilse (sıfır tutar, test şeridi) skipped + neden", async () => {
      const { service, created } = build({
        load: { state: "not_applicable", reason: "Aktarılacak tutar yok" },
      });
      await service.enqueue("payout_transfer", "p-1");
      expect(created[0]).toMatchObject({
        status: "skipped",
        lastError: "Aktarılacak tutar yok",
      });
    });

    it("kaynak yok / henüz kesin değil / eLogo faturası: satır açılmaz", async () => {
      const { service, prisma } = build({
        load: { state: "absent", reason: "x" },
      });
      await expect(
        service.enqueue("invoice_collection", "inv-elogo"),
      ).resolves.toBeNull();
      expect(prisma.netsisSyncRecord.create).not.toHaveBeenCalled();
    });
  });

  describe("outbox handler", () => {
    it("kayıtlı tip, payload'dan kaydı açar; eksik payload fırlatır (outbox yeniden dener)", async () => {
      const { service, registry, created } = build();
      service.onModuleInit();
      const handler = registry.get(OUTBOX_NETSIS_ACCOUNTING_SYNC);
      expect(handler).toBeDefined();
      const event = netsisAccountingSyncEvent("payout_transfer", "p-9");
      await handler?.(event.payload, {} as never);
      expect(created[0]).toMatchObject({ sourceId: "p-9" });
      await expect(handler?.({}, {} as never)).rejects.toThrow();
    });

    it("olay yardımcısı tip + tekilleştirme anahtarını tek yerden verir", () => {
      expect(netsisAccountingSyncEvent("refund_reversal", "a-1")).toEqual({
        type: OUTBOX_NETSIS_ACCOUNTING_SYNC,
        payload: { kind: "refund_reversal", sourceId: "a-1" },
        dedupeKey: "netsis_accounting.sync:refund_reversal:a-1",
      });
    });
  });

  describe("sweep", () => {
    it("her tür için sınırlı aday sorgusu çalıştırır ve adayları kuyruğa alır", async () => {
      const { service, prisma, created } = build();
      prisma.$queryRaw
        .mockResolvedValueOnce([{ id: "inv-1" }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ id: "p-1" }, { id: "p-2" }])
        .mockResolvedValueOnce([]);
      const opened = await service.sweep(new Date("2026-10-12T00:00:00Z"));
      expect(prisma.$queryRaw).toHaveBeenCalledTimes(4);
      expect(opened).toBe(3);
      expect(created.map((row) => row.idempotencyKey)).toEqual([
        "invoice_collection:inv-1",
        "payout_transfer:p-1",
        "payout_transfer:p-2",
      ]);
      // Pencere ve sınır parametredir; satırı olmayan kaynak NOT EXISTS ile.
      const sql = prisma.$queryRaw.mock.calls[0][0] as Prisma.Sql;
      expect(sql.sql).toContain("NOT EXISTS");
      expect(sql.sql).toContain("netsis_sync_records");
      expect(sql.values).toEqual([
        new Date("2026-09-12T00:00:00Z"),
        NETSIS_SYNC_SWEEP_BATCH,
      ]);
    });

    it("bir türün sorgu hatası diğerlerini durdurmaz", async () => {
      const { service, prisma } = build();
      prisma.$queryRaw
        .mockRejectedValueOnce(new Error("db"))
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ id: "p-1" }])
        .mockResolvedValueOnce([]);
      await expect(service.sweep()).resolves.toBe(1);
    });
  });

  describe("resetForRetry", () => {
    const withTx = (record: Record<string, unknown> | null) => {
      const ctx = build();
      const tx = {
        netsisSyncRecord: {
          findUnique: jest.fn().mockResolvedValue(record),
          update: jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({
            ...record,
            ...data,
          })),
        },
      };
      ctx.prisma.$transaction.mockImplementation(
        async (fn: (t: typeof tx) => unknown) => fn(tx),
      );
      return { ...ctx, tx };
    };
    const failed = {
      id: "rec-1",
      status: "failed",
      attemptCount: 8,
      lastError: "x",
      netsisRef: null,
      lastAttemptAt: new Date("2026-10-01T00:00:00Z"),
    };

    it("bütçeyi sıfırlar, kuyruğa alır ve denetimi AYNI işlemde yazar", async () => {
      const { service, tx } = withTx(failed);
      const afterWrite = jest.fn().mockResolvedValue(undefined);
      const updated = await service.resetForRetry("rec-1", { afterWrite });
      expect(tx.netsisSyncRecord.update).toHaveBeenCalledWith({
        where: { id: "rec-1" },
        data: {
          status: "pending",
          attemptCount: 0,
          lastAttemptAt: null,
          lastError: null,
        },
      });
      expect(updated.status).toBe("pending");
      expect(afterWrite).toHaveBeenCalledWith(
        tx,
        { status: "failed", attemptCount: 8, lastError: "x", netsisRef: null },
        { status: "pending", attemptCount: 0, lastError: null, netsisRef: null },
      );
    });

    it("netsisRef verilirse elle eşleştirir: synced", async () => {
      const { service, tx } = withTx(failed);
      await service.resetForRetry("rec-1", { netsisRef: " 4711 " });
      expect(tx.netsisSyncRecord.update).toHaveBeenCalledWith({
        where: { id: "rec-1" },
        data: expect.objectContaining({
          status: "synced",
          netsisRef: "4711",
          lastError: null,
        }),
      });
    });

    it("yazılmış (synced) kayıt yeniden denenemez — çift kayıt olurdu", async () => {
      const { service } = withTx({ ...failed, status: "synced" });
      await expect(service.resetForRetry("rec-1")).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it("kirası süren processing kayıt yeniden denenemez", async () => {
      const { service } = withTx({
        ...failed,
        status: "processing",
        lastAttemptAt: new Date(),
      });
      await expect(service.resetForRetry("rec-1")).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it("bilinmeyen kayıt 404; denetim yazılmaz", async () => {
      const { service } = withTx(null);
      const afterWrite = jest.fn();
      await expect(
        service.resetForRetry("nope", { afterWrite }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(afterWrite).not.toHaveBeenCalled();
    });
  });
});
