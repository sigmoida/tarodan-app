import { AdminStaffService } from "./admin-staff.service";

/**
 * Personel ile müşteri hesabı KESİN ayrı: davet edilen e-posta müşteri izi
 * (ilan/sipariş/takas/sosyal giriş) taşıyan bir hesaba aitse terfi ettirilmez;
 * mevcut personelin rolü güncellenir; personelden çıkarılmış (AdminUser satırı
 * silinmiş, User satırı kalmış) hesap yeniden davet edilebilir; yeni hesap
 * sistem tarafından açılır ve e-postası doğrulanmış sayılır.
 */
describe("AdminStaffService.assignAdminStaff — personel/müşteri ayrımı", () => {
  const makeService = (
    existingUser: Record<string, unknown> | null,
    existingStaff: Record<string, unknown> | null = null,
    footprint: {
      products?: number;
      orders?: number;
      trades?: number;
      oauth?: number;
    } = {},
  ) => {
    const prisma = {
      product: { count: jest.fn().mockResolvedValue(footprint.products ?? 0) },
      order: { count: jest.fn().mockResolvedValue(footprint.orders ?? 0) },
      trade: { count: jest.fn().mockResolvedValue(footprint.trades ?? 0) },
      oAuthAccount: {
        count: jest.fn().mockResolvedValue(footprint.oauth ?? 0),
      },
      user: {
        findUnique: jest.fn().mockResolvedValue(existingUser),
        create: jest.fn().mockResolvedValue({
          id: "user-new",
          email: "new@example.com",
          displayName: "new",
          avatarUrl: null,
          isEmailVerified: true,
        }),
        update: jest.fn().mockResolvedValue({}),
      },
      adminUser: {
        findUnique: jest.fn().mockResolvedValue(existingStaff),
        findFirst: jest.fn().mockResolvedValue({ id: "admin-row" }),
        create: jest.fn().mockResolvedValue({
          id: "staff-1",
          userId: "user-new",
          role: "moderator",
          isActive: true,
          lastLoginAt: null,
          createdAt: new Date(),
        }),
        update: jest.fn().mockImplementation(async ({ data }: any) => ({
          id: "staff-1",
          userId: existingUser?.id,
          ...existingStaff,
          ...data,
        })),
      },
    };
    const audit = { createAuditLog: jest.fn().mockResolvedValue(undefined) };
    const service = new AdminStaffService(
      prisma as any,
      audit as any,
      undefined as any,
      undefined as any,
      undefined as any,
    );
    // Yetki kontrolü ve rol matrisi bu testin konusu değil.
    (service as any).assertCanManage = jest.fn().mockResolvedValue(undefined);
    return { service, prisma };
  };

  it("mevcut müşteri hesabı (sipariş izi) personele terfi ettirilmez (400)", async () => {
    const { service, prisma } = makeService(
      {
        id: "user-1",
        email: "musteri@example.com",
        displayName: "Müşteri",
        avatarUrl: null,
        isEmailVerified: true,
      },
      null,
      { orders: 1 },
    );

    await expect(
      service.assignAdminStaff("admin-1", {
        email: "musteri@example.com",
        role: "moderator",
      } as any),
    ).rejects.toMatchObject({
      response: { i18nKey: "server.admin.staff.emailBelongsToCustomer" },
    });
    expect(prisma.adminUser.create).not.toHaveBeenCalled();
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it("yalnız sosyal girişle açılmış hesap da müşteridir (400)", async () => {
    const { service, prisma } = makeService(
      {
        id: "user-1s",
        email: "google@example.com",
        displayName: "G",
        avatarUrl: null,
        isEmailVerified: true,
      },
      null,
      { oauth: 1 },
    );

    await expect(
      service.assignAdminStaff("admin-1", {
        email: "google@example.com",
        role: "moderator",
      } as any),
    ).rejects.toMatchObject({
      response: { i18nKey: "server.admin.staff.emailBelongsToCustomer" },
    });
    expect(prisma.adminUser.create).not.toHaveBeenCalled();
  });

  it("personelden çıkarılmış hesap (User var, AdminUser yok, müşteri izi yok) yeniden davet edilir", async () => {
    const { service, prisma } = makeService({
      id: "user-ex",
      email: "eski@tarodan.com",
      displayName: "Eski Personel",
      avatarUrl: null,
      isEmailVerified: true,
    });

    const res = await service.assignAdminStaff("admin-1", {
      email: "eski@tarodan.com",
      role: "moderator",
    } as any);

    expect(prisma.user.create).not.toHaveBeenCalled();
    expect(prisma.adminUser.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ userId: "user-ex", role: "moderator" }),
      }),
    );
    expect(res.tempPassword).toBeUndefined();
  });

  it("mevcut personelin rolü güncellenir", async () => {
    const { service, prisma } = makeService(
      {
        id: "user-2",
        email: "mod@example.com",
        displayName: "Mod",
        avatarUrl: null,
        isEmailVerified: true,
      },
      { id: "staff-2", role: "moderator", isActive: true },
    );

    const res = await service.assignAdminStaff("admin-1", {
      email: "mod@example.com",
      role: "admin",
    } as any);

    expect(prisma.adminUser.update).toHaveBeenCalledWith({
      where: { id: "staff-2" },
      data: { role: "admin", isActive: true },
    });
    expect(res.role).toBe("admin");
  });

  it("kayıtlı olmayan e-posta için hesap sistem tarafından açılır ve doğrulanmış sayılır", async () => {
    const { service, prisma } = makeService(null);

    const res = await service.assignAdminStaff("admin-1", {
      email: "new@example.com",
      role: "moderator",
    } as any);

    expect(prisma.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ isEmailVerified: true }),
      }),
    );
    expect(prisma.adminUser.create).toHaveBeenCalled();
    expect(res.tempPassword).toBeTruthy();
  });
});
