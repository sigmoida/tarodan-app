import { loginStateWhere } from "@tarodan/types";
import { AdminUserService } from "./admin-user.service";

/**
 * "Hiç giriş yapmadı" filtresi: kayıt olup hesabını bir kez bile kullanmamış
 * üyeleri ayıklar. Koşul @tarodan/types'ta durur — panelin seçenek değerleriyle
 * sorgunun aynı sözcükleri kullanması buna bağlı.
 */
describe("loginStateWhere", () => {
  it("'never' → lastLoginAt boş olanlar", () => {
    expect(loginStateWhere("never")).toEqual({ lastLoginAt: null });
  });

  it("'logged_in' → en az bir kez giriş yapmış olanlar", () => {
    expect(loginStateWhere("logged_in")).toEqual({
      lastLoginAt: { not: null },
    });
  });

  it("filtre yokken listeyi daraltmaz", () => {
    expect(loginStateWhere(undefined)).toEqual({});
    expect(loginStateWhere(null)).toEqual({});
  });
});

describe("AdminUserService.getUsers giriş durumu", () => {
  const makeService = () => {
    const prisma = {
      user: {
        count: jest.fn().mockResolvedValue(0),
        findMany: jest.fn().mockResolvedValue([]),
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

  it("loginState=never yalnız hiç giriş yapmamışları getirir", async () => {
    const { service, prisma } = makeService();

    await service.getUsers({ loginState: "never" } as any);

    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          lastLoginAt: null,
          // Hesap durumu varsayılanı korunur: silinmişler yine listede değil.
          deletedAt: null,
        }),
      }),
    );
  });

  it("filtre verilmeyince lastLoginAt koşulu eklenmez", async () => {
    const { service, prisma } = makeService();

    await service.getUsers({} as any);

    const [{ where }] = prisma.user.findMany.mock.calls[0];
    expect(where).not.toHaveProperty("lastLoginAt");
  });
});
