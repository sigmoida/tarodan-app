import { ListingRemovalReason, ProductStatus } from "@prisma/client";
import { AdminStaffService } from "./admin-staff.service";

/**
 * Yasaklama satıcının vitrindeki ilanlarını askıya alır (active → suspended)
 * ve onay bekleyenleri reddeder (pending → rejected). Her biri "satıcı hesabı
 * askıya alındı" nedeniyle, ban transaction'ının içinde ve tek kayıt
 * fonksiyonundan kaydedilir; işlemi yapan yönetici kayda geçer.
 */
describe("AdminStaffService.banUser — ilan kaldırma nedenleri", () => {
  const anyMock = () =>
    new Proxy({}, { get: () => jest.fn().mockResolvedValue(undefined) }) as any;

  const makeService = () => {
    const tx: any = {
      user: {
        update: jest.fn().mockResolvedValue({ id: "u1", isBanned: true }),
      },
      trade: {
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn().mockResolvedValue({}),
      },
      product: {
        findMany: jest.fn(async ({ where }: any) =>
          where.status === ProductStatus.active
            ? [{ id: "live-1" }, { id: "live-2" }]
            : [{ id: "pending-1" }],
        ),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      productRemovalEvent: {
        createMany: jest.fn().mockResolvedValue({ count: 3 }),
      },
      offer: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
    };
    const prisma: any = {
      user: {
        findUnique: jest.fn().mockResolvedValue({ id: "u1", isBanned: false }),
      },
      $transaction: jest.fn((fn: any) => fn(tx)),
    };
    const service = new AdminStaffService(
      prisma,
      { createAuditLog: jest.fn().mockResolvedValue(undefined) } as any,
      anyMock(),
      anyMock(),
      anyMock(),
    );
    return { service, tx };
  };

  it("askıya alınan ve reddedilen her ilan 'seller_suspended' ile kaydedilir", async () => {
    const { service, tx } = makeService();

    await service.banUser("admin-1", "u1", { reason: "spam" } as any);

    expect(tx.productRemovalEvent.createMany).toHaveBeenCalledTimes(1);
    expect(tx.productRemovalEvent.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          productId: "live-1",
          reason: ListingRemovalReason.seller_suspended,
          statusBefore: ProductStatus.active,
          statusAfter: ProductStatus.suspended,
          actorUserId: "admin-1",
        }),
        expect.objectContaining({
          productId: "live-2",
          statusAfter: ProductStatus.suspended,
        }),
        expect.objectContaining({
          productId: "pending-1",
          reason: ListingRemovalReason.seller_suspended,
          statusBefore: ProductStatus.pending,
          statusAfter: ProductStatus.rejected,
        }),
      ],
    });
  });

  it("statü yazımları değişmedi; güncel neden statüye koşullu damgalanır", async () => {
    const { service, tx } = makeService();

    await service.banUser("admin-1", "u1", { reason: "spam" } as any);

    expect(tx.product.updateMany).toHaveBeenCalledWith({
      where: { sellerId: "u1", status: ProductStatus.active },
      data: { status: ProductStatus.suspended },
    });
    expect(tx.product.updateMany).toHaveBeenCalledWith({
      where: { sellerId: "u1", status: ProductStatus.pending },
      data: { status: ProductStatus.rejected },
    });
    expect(tx.product.updateMany).toHaveBeenCalledWith({
      where: {
        id: { in: ["live-1", "live-2"] },
        status: ProductStatus.suspended,
      },
      data: { removalReason: ListingRemovalReason.seller_suspended },
    });
    expect(tx.product.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ["pending-1"] }, status: ProductStatus.rejected },
      data: { removalReason: ListingRemovalReason.seller_suspended },
    });
  });
});
