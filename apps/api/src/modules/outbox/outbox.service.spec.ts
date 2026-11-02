import { OutboxStatus } from "@prisma/client";
import { OutboxService } from "./outbox.service";
import { OutboxHandlerRegistry } from "./outbox-handler.registry";

describe("OutboxService.enqueue", () => {
  const svc = new OutboxService(new OutboxHandlerRegistry());

  it("dedupeKey YOKken create eder (para tx client'ında)", async () => {
    const tx = {
      outboxEvent: { create: jest.fn(), upsert: jest.fn() },
    };
    await svc.enqueue(tx as never, {
      type: "invoice.generate",
      payload: { orderId: "o1" },
    });
    expect(tx.outboxEvent.create).toHaveBeenCalledWith({
      data: {
        type: "invoice.generate",
        payload: { orderId: "o1" },
        maxAttempts: 8,
      },
    });
    expect(tx.outboxEvent.upsert).not.toHaveBeenCalled();
  });

  it("dedupeKey VARken upsert eder (tx-güvenli idempotency, update no-op)", async () => {
    const tx = {
      outboxEvent: { create: jest.fn(), upsert: jest.fn() },
    };
    await svc.enqueue(tx as never, {
      type: "refund.paytr",
      payload: { orderId: "o1", amount: 10 },
      dedupeKey: "refund:o1:10",
      maxAttempts: 5,
    });
    expect(tx.outboxEvent.upsert).toHaveBeenCalledWith({
      where: { dedupeKey: "refund:o1:10" },
      create: {
        type: "refund.paytr",
        payload: { orderId: "o1", amount: 10 },
        maxAttempts: 5,
        dedupeKey: "refund:o1:10",
      },
      update: {},
    });
    expect(tx.outboxEvent.create).not.toHaveBeenCalled();
  });

  it("enqueue hatası FIRLATIR (para tx'i bozulmalı — best-effort DEĞİL)", async () => {
    const tx = {
      outboxEvent: {
        create: jest.fn().mockRejectedValue(new Error("db down")),
        upsert: jest.fn(),
      },
    };
    await expect(
      svc.enqueue(tx as never, { type: "x", payload: {} }),
    ).rejects.toThrow("db down");
  });
});

describe("OutboxService.runInline", () => {
  const svc = new OutboxService(new OutboxHandlerRegistry());

  /** dedupeKey'e göre tek satırlık sahte tablo (drainer ile aynı CAS). */
  const makeDb = (status: OutboxStatus) => {
    const row = { dedupeKey: "k1", status };
    const updateMany = jest.fn(
      async ({
        where,
        data,
      }: {
        where: { dedupeKey: string; status: OutboxStatus };
        data: { status: OutboxStatus };
      }) => {
        if (row.dedupeKey !== where.dedupeKey || row.status !== where.status) {
          return { count: 0 };
        }
        row.status = data.status;
        return { count: 1 };
      },
    );
    return { row, db: { outboxEvent: { updateMany } } };
  };

  it("pending satırı sahiplenir, işi çalıştırır ve satırı kapatır", async () => {
    const { row, db } = makeDb(OutboxStatus.pending);
    const work = jest.fn().mockResolvedValue("done");

    await expect(svc.runInline(db as never, "k1", work)).resolves.toEqual({
      ran: true,
      result: "done",
    });
    expect(work).toHaveBeenCalledTimes(1);
    expect(row.status).toBe(OutboxStatus.completed);
  });

  it.each([OutboxStatus.processing, OutboxStatus.completed])(
    "satır %s ise iş çalışmaz (drainer sahibi ya da iş bitmiş)",
    async (status) => {
      const { row, db } = makeDb(status);
      const work = jest.fn();

      await expect(svc.runInline(db as never, "k1", work)).resolves.toEqual({
        ran: false,
      });
      expect(work).not.toHaveBeenCalled();
      expect(row.status).toBe(status);
    },
  );

  it("iş fırlatırsa satır pending'e bırakılır (drainer yeniden dener) ve hata yükselir", async () => {
    const { row, db } = makeDb(OutboxStatus.pending);

    await expect(
      svc.runInline(db as never, "k1", () => Promise.reject(new Error("boom"))),
    ).rejects.toThrow("boom");
    expect(row.status).toBe(OutboxStatus.pending);
  });
});

describe("OutboxService.runPendingInline", () => {
  const event = (status: OutboxStatus, type = "test.type") => ({
    id: "e1",
    type,
    dedupeKey: "k1",
    status,
    payload: { userId: "u1" },
  });

  /** One row by dedupe key, with the same CAS as the drainer and runInline. */
  const makeDb = (row: ReturnType<typeof event> | null) => ({
    row,
    db: {
      outboxEvent: {
        findUnique: jest.fn(
          async ({ where }: { where: { dedupeKey: string } }) =>
            row && row.dedupeKey === where.dedupeKey ? { ...row } : null,
        ),
        updateMany: jest.fn(
          async ({
            where,
            data,
          }: {
            where: { dedupeKey: string; status: OutboxStatus };
            data: { status: OutboxStatus };
          }) => {
            if (!row || row.dedupeKey !== where.dedupeKey) return { count: 0 };
            if (row.status !== where.status) return { count: 0 };
            row.status = data.status;
            return { count: 1 };
          },
        ),
      },
    },
  });

  const setup = (row: ReturnType<typeof event> | null) => {
    const registry = new OutboxHandlerRegistry();
    const handler = jest.fn().mockResolvedValue(undefined);
    registry.register("test.type", handler);
    const svc = new OutboxService(registry);
    return { svc, handler, ...makeDb(row) };
  };

  it("runs the registered handler with the row's payload and completes the row", async () => {
    const { svc, handler, db, row } = setup(event(OutboxStatus.pending));

    await expect(svc.runPendingInline(db as never, "k1")).resolves.toEqual({
      ran: true,
    });
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(
      { userId: "u1" },
      expect.objectContaining({ id: "e1", type: "test.type" }),
    );
    expect(row?.status).toBe(OutboxStatus.completed);
  });

  it.each([OutboxStatus.processing, OutboxStatus.completed, OutboxStatus.dead])(
    "does not run a row that is %s (the drainer owns it or the work is done)",
    async (status) => {
      const { svc, handler, db, row } = setup(event(status));

      await expect(svc.runPendingInline(db as never, "k1")).resolves.toEqual({
        ran: false,
      });
      expect(handler).not.toHaveBeenCalled();
      expect(row?.status).toBe(status);
    },
  );

  it("does not run when the row does not exist", async () => {
    const { svc, handler, db } = setup(null);

    await expect(svc.runPendingInline(db as never, "k1")).resolves.toEqual({
      ran: false,
    });
    expect(handler).not.toHaveBeenCalled();
  });

  it("loses the CAS to a concurrent owner between the read and the claim", async () => {
    const { svc, handler, db, row } = setup(event(OutboxStatus.pending));
    db.outboxEvent.findUnique.mockImplementationOnce(async () => {
      const seen = { ...row! };
      // The drainer claims the row right after this read.
      row!.status = OutboxStatus.processing;
      return seen;
    });

    await expect(svc.runPendingInline(db as never, "k1")).resolves.toEqual({
      ran: false,
    });
    expect(handler).not.toHaveBeenCalled();
    expect(row?.status).toBe(OutboxStatus.processing);
  });

  it("throws for a type without a handler and leaves the row pending for the drainer", async () => {
    const { svc, db, row } = setup(event(OutboxStatus.pending, "unknown.type"));

    await expect(svc.runPendingInline(db as never, "k1")).rejects.toThrow(
      "no outbox handler registered: unknown.type",
    );
    expect(db.outboxEvent.updateMany).not.toHaveBeenCalled();
    expect(row?.status).toBe(OutboxStatus.pending);
  });

  it("releases the row to pending and rethrows when the handler fails", async () => {
    const { svc, handler, db, row } = setup(event(OutboxStatus.pending));
    handler.mockRejectedValueOnce(new Error("claim failed"));

    await expect(svc.runPendingInline(db as never, "k1")).rejects.toThrow(
      "claim failed",
    );
    expect(row?.status).toBe(OutboxStatus.pending);
  });
});
