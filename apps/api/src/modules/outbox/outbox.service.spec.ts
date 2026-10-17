import { OutboxStatus } from "@prisma/client";
import { OutboxService } from "./outbox.service";

describe("OutboxService.enqueue", () => {
  const svc = new OutboxService();

  it("dedupeKey YOKken create eder (para tx client'ında)", async () => {
    const tx = {
      outboxEvent: { create: jest.fn(), upsert: jest.fn() },
    } as any;
    await svc.enqueue(tx, {
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
    } as any;
    await svc.enqueue(tx, {
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
    } as any;
    await expect(svc.enqueue(tx, { type: "x", payload: {} })).rejects.toThrow(
      "db down",
    );
  });
});

describe("OutboxService.runInline", () => {
  const svc = new OutboxService();

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
