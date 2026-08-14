import { AdminShippingService } from "./admin-shipping.service";

describe("AdminShippingService carrier cancellation operations", () => {
  it("creates a durable manual-cleanup task after a successful real endpoint test", async () => {
    const upsert = jest.fn().mockResolvedValue({ id: "cleanup-task-1" });
    const prisma = {
      carrierCancellationTask: { upsert },
    } as any;
    const cargo = {
      isIntegrationEnabled: jest.fn().mockReturnValue(true),
      submitShipmentWithRetry: jest.fn().mockResolvedValue({
        ok: true,
        suratMessage: "Tamam",
      }),
    } as any;
    const tracking = {
      probeTracking: jest.fn().mockResolvedValue({ ok: true }),
    } as any;
    const service = new AdminShippingService(
      prisma,
      undefined,
      cargo,
      tracking,
    );

    const result = await service.runSuratEndpointTest("admin-user-1");

    expect(result.create.ok).toBe(true);
    expect(result.cleanupTask).toEqual({ ok: true, id: "cleanup-task-1" });
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          provider: "surat",
          entityType: "admin_endpoint_test",
          entityId: result.ref,
          reference: result.ref,
          reason: "admin_endpoint_test_cleanup",
          metadata: expect.objectContaining({ requestedBy: "admin-user-1" }),
        }),
      }),
    );
  });

  it("keeps the cleanup task durable when the follow-up tracking call throws", async () => {
    const upsert = jest.fn().mockResolvedValue({ id: "cleanup-task-2" });
    const service = new AdminShippingService(
      { carrierCancellationTask: { upsert } } as any,
      undefined,
      {
        isIntegrationEnabled: jest.fn().mockReturnValue(true),
        submitShipmentWithRetry: jest.fn().mockResolvedValue({ ok: true }),
      } as any,
      {
        probeTracking: jest.fn().mockRejectedValue(new Error("tracking down")),
      } as any,
    );

    const result = await service.runSuratEndpointTest("admin-user-2");

    expect(result.cleanupTask).toEqual({ ok: true, id: "cleanup-task-2" });
    expect(result.track).toEqual({ ok: false, error: "tracking down" });
    expect(upsert).toHaveBeenCalledTimes(1);
  });

  it("adds resolver identity to completed cancellation task rows", async () => {
    const prisma = {
      carrierCancellationTask: {
        count: jest.fn().mockResolvedValue(1),
        findMany: jest.fn().mockResolvedValue([
          {
            id: "task-1",
            status: "resolved",
            resolvedBy: "admin-user-1",
            resolution: "Sürat panelinden iptal edildi",
          },
        ]),
      },
      user: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: "admin-user-1",
            displayName: "Operasyon Admin",
            email: "admin@example.com",
          },
        ]),
      },
    } as any;
    const service = new AdminShippingService(prisma);

    const result = await service.getCarrierCancellationTasks({
      page: 1,
      limit: 20,
    });

    expect(result.data[0]).toMatchObject({
      resolvedBy: "admin-user-1",
      resolvedByAdmin: {
        displayName: "Operasyon Admin",
        email: "admin@example.com",
      },
    });
  });
});
