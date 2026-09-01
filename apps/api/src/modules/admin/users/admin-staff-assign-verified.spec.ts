import { AdminStaffService } from "./admin-staff.service";

/**
 * Personel daveti e-postanın sahibine güvenir: hesabı sistemin açtığı dal
 * `isEmailVerified: true` yazıyordu, mevcut hesabı terfi ettiren dal yazmıyordu.
 * Ayrışma, admin panele girebilen ama kullanıcı listesinde "Aktivasyon
 * Bekliyor" görünen hesap üretiyordu.
 */
describe("AdminStaffService.assignAdminStaff — e-posta doğrulaması", () => {
  const makeService = (existingUser: Record<string, unknown> | null) => {
    const prisma = {
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
        findUnique: jest.fn().mockResolvedValue(null),
        findFirst: jest.fn().mockResolvedValue({ id: "admin-row" }),
        create: jest.fn().mockResolvedValue({
          id: "staff-1",
          userId: existingUser?.id ?? "user-new",
          role: "moderator",
          isActive: true,
          lastLoginAt: null,
          createdAt: new Date(),
        }),
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

  it("doğrulanmamış mevcut hesap terfi edince bayrak açılır", async () => {
    const { service, prisma } = makeService({
      id: "user-1",
      email: "eski@example.com",
      displayName: "Eski",
      avatarUrl: null,
      isEmailVerified: false,
    });

    await service.assignAdminStaff("admin-1", {
      email: "eski@example.com",
      role: "moderator",
    } as any);

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: { isEmailVerified: true },
    });
  });

  it("zaten doğrulanmış hesapta gereksiz yazma yapılmaz", async () => {
    const { service, prisma } = makeService({
      id: "user-2",
      email: "hazir@example.com",
      displayName: "Hazır",
      avatarUrl: null,
      isEmailVerified: true,
    });

    await service.assignAdminStaff("admin-1", {
      email: "hazir@example.com",
      role: "moderator",
    } as any);

    expect(prisma.user.update).not.toHaveBeenCalled();
  });
});
