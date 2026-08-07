import { requestCarrierCancellationTask } from "./carrier-cancellation-task";
import { CarrierCancellationService } from "./carrier-cancellation.service";

describe("requestCarrierCancellationTask", () => {
  it("aynı fiziksel kayıt için idempotent dedupe anahtarıyla pending görev açar", async () => {
    const upsert = jest.fn().mockResolvedValue({ id: "task-1" });

    await requestCarrierCancellationTask(
      { carrierCancellationTask: { upsert } } as any,
      {
        provider: "surat",
        reference: "PKG-1",
        entityType: "order_shipment",
        entityId: "shipment-1",
        reason: "order_cancelled",
      },
    );

    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          dedupeKey: "surat:order_shipment:shipment-1:PKG-1",
        },
        create: expect.objectContaining({
          provider: "surat",
          reference: "PKG-1",
        }),
        update: expect.objectContaining({
          status: "pending",
          resolvedAt: null,
          resolution: null,
        }),
      }),
    );
  });
});

describe("CarrierCancellationService", () => {
  it("önce provider state'ini temizler, sonra local update ile görevi tek transaction'da yazar", async () => {
    const calls: string[] = [];
    const tx = {
      carrierCancellationTask: {
        upsert: jest.fn().mockImplementation(async () => {
          calls.push("task");
          return { id: "task-1" };
        }),
      },
    };
    const prisma = {
      $transaction: jest.fn(async (fn: any) => fn(tx)),
    } as any;
    const cargo = {
      clearLocalShipment: jest.fn().mockImplementation(async () => {
        calls.push("provider");
        return { ok: true };
      }),
    } as any;
    const service = new CarrierCancellationService(prisma, cargo);

    const task = await service.request({
      provider: "surat",
      reference: "PKG-1",
      entityType: "order_shipment",
      entityId: "shipment-1",
      reason: "order_cancelled",
      updateLocal: async () => {
        calls.push("local");
      },
    });

    expect(task.id).toBe("task-1");
    expect(calls).toEqual(["provider", "local", "task"]);
  });

  it("provider temizliği başarısızsa domain transaction'ını başlatmaz", async () => {
    const prisma = { $transaction: jest.fn() } as any;
    const cargo = {
      clearLocalShipment: jest
        .fn()
        .mockResolvedValue({ ok: false, providerMessage: "not-cleared" }),
    } as any;
    const service = new CarrierCancellationService(prisma, cargo);

    await expect(
      service.request({
        provider: "surat",
        reference: "PKG-1",
        entityType: "order_shipment",
        entityId: "shipment-1",
        reason: "order_cancelled",
        updateLocal: jest.fn(),
      }),
    ).rejects.toThrow("not-cleared");
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
