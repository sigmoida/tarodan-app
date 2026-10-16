import { AdminStaffService } from "./admin-staff.service";

/**
 * Yasaklanan hesabın cihazları bildirim almaya devam etmesin: push token'lar
 * yasaklama transaction'ı içinde pasifleşir (yasak geri alınırsa istemci
 * açılışta token'ı yeniden kaydeder).
 */
describe("AdminStaffService.banUser — push token'lar", () => {
  const anyMock = () =>
    new Proxy({}, { get: () => jest.fn().mockResolvedValue(undefined) }) as any;

  it("yasaklama transaction'ında kullanıcının push token'larını pasifleştirir", async () => {
    const tx: any = {
      user: {
        update: jest.fn().mockResolvedValue({ id: "u1", isBanned: true }),
      },
      trade: { findMany: jest.fn().mockResolvedValue([]) },
      product: {
        findMany: jest.fn().mockResolvedValue([]),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      productRemovalEvent: {
        createMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      offer: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
    };
    const prisma: any = {
      user: {
        findUnique: jest.fn().mockResolvedValue({ id: "u1", isBanned: false }),
      },
      $transaction: jest.fn((fn: any) => fn(tx)),
    };
    const pushTokens = { deactivateAllForUser: jest.fn() };
    const service = new AdminStaffService(
      prisma,
      { createAuditLog: jest.fn().mockResolvedValue(undefined) } as any,
      anyMock(),
      anyMock(),
      anyMock(),
      pushTokens as any,
    );

    await service.banUser("admin-1", "u1", { reason: "spam" } as any);

    expect(pushTokens.deactivateAllForUser).toHaveBeenCalledWith("u1", tx);
  });
});
