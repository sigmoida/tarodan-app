import { OutboxDrainerService } from "./outbox-drainer.service";
import { OutboxHandlerRegistry } from "./outbox-handler.registry";

/**
 * Outbox drainer: CAS claim + handler dispatch + retry/backoff + DLQ (dead).
 */
describe("OutboxDrainerService.runDrain", () => {
  const config = { get: jest.fn(() => undefined) } as any;

  function makePrisma(rows: any[]) {
    return {
      outboxEvent: {
        findMany: jest.fn().mockResolvedValue(rows),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        update: jest.fn().mockResolvedValue({}),
      },
    } as any;
  }

  it("başarılı handler → completed", async () => {
    const prisma = makePrisma([
      { id: "e1", type: "t", payload: {}, attempts: 0, maxAttempts: 8 },
    ]);
    const registry = new OutboxHandlerRegistry();
    const handler = jest.fn().mockResolvedValue(undefined);
    registry.register("t", handler);

    const svc = new OutboxDrainerService(prisma, registry, config);
    const r = await svc.runDrain();

    expect(handler).toHaveBeenCalledTimes(1);
    expect(prisma.outboxEvent.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "e1" },
        data: expect.objectContaining({ status: "completed", lastError: null }),
      }),
    );
    expect(r.stats).toEqual({ processed: 1, retried: 0, dead: 0 });
  });

  it("handler hata + attempts<max → pending + backoff (attempts++)", async () => {
    const prisma = makePrisma([
      { id: "e1", type: "t", payload: {}, attempts: 0, maxAttempts: 8 },
    ]);
    const registry = new OutboxHandlerRegistry();
    registry.register("t", jest.fn().mockRejectedValue(new Error("boom")));

    const svc = new OutboxDrainerService(prisma, registry, config);
    const r = await svc.runDrain();

    const call = prisma.outboxEvent.update.mock.calls[0][0];
    expect(call.data.status).toBe("pending");
    expect(call.data.attempts).toBe(1);
    expect(call.data.nextAttemptAt).toBeInstanceOf(Date);
    expect(call.data.lastError).toContain("boom");
    expect(r.stats).toEqual({ processed: 0, retried: 1, dead: 0 });
  });

  it("handler hata + attempts son deneme → dead (DLQ)", async () => {
    const prisma = makePrisma([
      { id: "e1", type: "t", payload: {}, attempts: 7, maxAttempts: 8 },
    ]);
    const registry = new OutboxHandlerRegistry();
    registry.register("t", jest.fn().mockRejectedValue(new Error("boom")));

    const svc = new OutboxDrainerService(prisma, registry, config);
    const r = await svc.runDrain();

    const call = prisma.outboxEvent.update.mock.calls[0][0];
    expect(call.data.status).toBe("dead");
    expect(call.data.attempts).toBe(8);
    expect(r.stats).toEqual({ processed: 0, retried: 0, dead: 1 });
  });

  it("CAS claim kaybı (count=0) → handler çağrılmaz, atlanır", async () => {
    const prisma = makePrisma([
      { id: "e1", type: "t", payload: {}, attempts: 0, maxAttempts: 8 },
    ]);
    prisma.outboxEvent.updateMany.mockResolvedValue({ count: 0 });
    const registry = new OutboxHandlerRegistry();
    const handler = jest.fn();
    registry.register("t", handler);

    const svc = new OutboxDrainerService(prisma, registry, config);
    const r = await svc.runDrain();

    expect(handler).not.toHaveBeenCalled();
    expect(prisma.outboxEvent.update).not.toHaveBeenCalled();
    expect(r.stats).toEqual({ processed: 0, retried: 0, dead: 0 });
  });

  it("kayıtlı handler yoksa → hata gibi ele alınır (retry)", async () => {
    const prisma = makePrisma([
      { id: "e1", type: "unknown", payload: {}, attempts: 0, maxAttempts: 8 },
    ]);
    const registry = new OutboxHandlerRegistry();

    const svc = new OutboxDrainerService(prisma, registry, config);
    const r = await svc.runDrain();

    const call = prisma.outboxEvent.update.mock.calls[0][0];
    expect(call.data.status).toBe("pending");
    expect(call.data.lastError).toContain("handler yok");
    expect(r.stats).toEqual({ processed: 0, retried: 1, dead: 0 });
  });
});
