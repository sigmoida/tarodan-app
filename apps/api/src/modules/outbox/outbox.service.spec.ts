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
