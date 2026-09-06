import { AdminStaffService } from "./admin-staff.service";

/**
 * Yasaklama bekleyen teklifleri iki yönde de kapatır: kullanıcı ALICI olarak
 * verdiği ve SATICI olarak aldığı teklifler. Eskiden yalnız alıcı tarafı
 * kapanıyor, yasaklı satıcının aldığı teklifler süre dolana dek "yanıt bekliyor"
 * kalıyordu.
 */
describe("AdminStaffService.banUser — bekleyen teklifler", () => {
  const anyMock = () =>
    new Proxy({}, { get: () => jest.fn().mockResolvedValue(undefined) }) as any;

  const makeService = () => {
    const tx: any = {
      user: {
        update: jest.fn().mockResolvedValue({ id: "u1", isBanned: true }),
      },
      trade: { findMany: jest.fn().mockResolvedValue([]) },
      product: {
        findMany: jest.fn().mockResolvedValue([]),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      offer: { updateMany: jest.fn().mockResolvedValue({ count: 2 }) },
    };
    const prisma: any = {
      user: {
        findUnique: jest.fn().mockResolvedValue({ id: "u1", isBanned: false }),
      },
      $transaction: jest.fn((fn: any) => fn(tx)),
    };
    const audit = { createAuditLog: jest.fn().mockResolvedValue(undefined) };
    const service = new AdminStaffService(
      prisma,
      audit as any,
      anyMock(),
      anyMock(),
      anyMock(),
    );
    return { service, tx };
  };

  it("alıcı VE satıcı taraflı bekleyen teklifleri gerekçeyle kapatır", async () => {
    const { service, tx } = makeService();

    await service.banUser("admin-1", "u1", { reason: "spam" } as any);

    expect(tx.offer.updateMany).toHaveBeenCalledWith({
      where: {
        status: "pending",
        OR: [{ buyerId: "u1" }, { sellerId: "u1" }],
      },
      data: {
        status: "cancelled",
        cancelReason: "Hesap askıya alındığı için teklif kapatıldı",
      },
    });
  });
});
