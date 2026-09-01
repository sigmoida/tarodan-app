import { deriveAccountStatus } from "@tarodan/types";
import { AdminUserService, accountStatusWhere } from "./admin-user.service";

/**
 * Hesap durumu tek türetimden gelir; liste filtresi de aynı önceliğin tersini
 * uygular. İkisi ayrışırsa admin "Engelli" filtresi silinmiş-engelli hesapları
 * getirmeye başlar ya da rozet filtreden farklı bir şey söyler.
 */
describe("deriveAccountStatus", () => {
  const cases: Array<[Parameters<typeof deriveAccountStatus>[0], string]> = [
    [
      { deletedAt: new Date(), isBanned: true, isEmailVerified: true },
      "deleted",
    ],
    [{ deletedAt: null, isBanned: true, isEmailVerified: false }, "banned"],
    [
      { deletedAt: null, isBanned: false, isEmailVerified: false },
      "pending_activation",
    ],
    [{ deletedAt: null, isBanned: false, isEmailVerified: true }, "active"],
    [{}, "pending_activation"],
  ];

  it.each(cases)("%j → %s", (input, expected) => {
    expect(deriveAccountStatus(input)).toBe(expected);
  });
});

describe("accountStatusWhere", () => {
  it("filtre yokken silinmişleri dışarıda bırakır", () => {
    expect(accountStatusWhere(undefined)).toEqual({ deletedAt: null });
  });

  it("her durum türetimin tersini uygular", () => {
    expect(accountStatusWhere("deleted")).toEqual({
      deletedAt: { not: null },
    });
    expect(accountStatusWhere("banned")).toEqual({
      deletedAt: null,
      isBanned: true,
    });
    expect(accountStatusWhere("pending_activation")).toEqual({
      deletedAt: null,
      isBanned: false,
      isEmailVerified: false,
    });
    expect(accountStatusWhere("active")).toEqual({
      deletedAt: null,
      isBanned: false,
      isEmailVerified: true,
    });
  });
});

describe("AdminUserService.getUsers hesap durumu", () => {
  const makeService = () => {
    const row = {
      id: "u1",
      isBanned: false,
      isEmailVerified: true,
      deletedAt: null,
    };
    const prisma = {
      user: {
        count: jest.fn().mockResolvedValue(1),
        findMany: jest.fn().mockResolvedValue([row]),
      },
      order: { groupBy: jest.fn().mockResolvedValue([]) },
    };
    const service = new AdminUserService(
      prisma as any,
      { createAuditLog: jest.fn() } as any,
      undefined as any,
    );
    return { service, prisma };
  };

  it("varsayılan listede silinmişler yok, satırlar accountStatus taşır", async () => {
    const { service, prisma } = makeService();

    const result = await service.getUsers({} as any);

    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ deletedAt: null }),
      }),
    );
    expect(result.data[0]).toMatchObject({
      id: "u1",
      accountStatus: "active",
      cancelledOrdersCount: 0,
    });
  });

  it("accountStatus=deleted yalnız silinmişleri getirir", async () => {
    const { service, prisma } = makeService();

    await service.getUsers({ accountStatus: "deleted" } as any);

    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ deletedAt: { not: null } }),
      }),
    );
  });
});
