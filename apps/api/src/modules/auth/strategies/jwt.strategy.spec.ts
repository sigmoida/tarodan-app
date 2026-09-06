import { UnauthorizedException } from "@nestjs/common";
import { JwtStrategy } from "./jwt.strategy";

/**
 * Kullanıcı (web/mobil) JWT stratejisi: personel hesabı hiçbir korumalı uca
 * giremez (elde kalmış eski access token dahil) ve kullanıcı token'ı admin
 * bilgisi (isAdmin/role) TAŞIMAZ.
 */
describe("JwtStrategy.validate — personel hesabı ve principal şekli", () => {
  const baseUser = {
    id: "u1",
    email: "user@example.com",
    isSeller: true,
    preferredLanguage: "tr",
    deletedAt: null,
    adminUser: null,
  };
  const makeStrategy = (user: Record<string, unknown> | null) => {
    const prisma = { user: { findUnique: jest.fn().mockResolvedValue(user) } };
    const config = { get: jest.fn().mockReturnValue("secret") };
    return {
      strategy: new JwtStrategy(config as any, prisma as any),
      prisma,
    };
  };
  const payload = {
    sub: "u1",
    email: "user@example.com",
    type: "access",
  } as any;

  it("müşteri için yalnız id/email/isSeller/preferredLanguage döner (isAdmin/role yok)", async () => {
    const { strategy } = makeStrategy(baseUser);
    await expect(strategy.validate(payload)).resolves.toEqual({
      id: "u1",
      email: "user@example.com",
      isSeller: true,
      preferredLanguage: "tr",
    });
  });

  it("personel (AdminUser satırı, pasif olsa da) için 401 STAFF_ACCOUNT", async () => {
    const { strategy } = makeStrategy({
      ...baseUser,
      adminUser: { id: "admin-1" },
    });
    await expect(strategy.validate(payload)).rejects.toMatchObject({
      response: {
        i18nKey: "server.auth.staffAccountCustomerLogin",
        errorCode: "STAFF_ACCOUNT",
      },
    });
  });

  it("silinmiş hesap ve refresh tipi token reddedilir", async () => {
    const { strategy } = makeStrategy({ ...baseUser, deletedAt: new Date() });
    await expect(strategy.validate(payload)).rejects.toThrow(
      UnauthorizedException,
    );
    await expect(
      strategy.validate({ ...payload, type: "refresh" }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it("sıcak yolda yalnız gereken sütunları seçer (include yok)", async () => {
    const { strategy, prisma } = makeStrategy(baseUser);
    await strategy.validate(payload);
    const arg = prisma.user.findUnique.mock.calls[0][0];
    expect(arg.include).toBeUndefined();
    expect(arg.select).toMatchObject({
      id: true,
      email: true,
      isSeller: true,
      preferredLanguage: true,
      deletedAt: true,
      adminUser: { select: { id: true } },
    });
  });
});
