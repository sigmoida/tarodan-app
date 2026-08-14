import { UnauthorizedException } from "@nestjs/common";
import { AuthService } from "./auth.service";
import { AuthTokenService } from "./auth-token.service";

/**
 * Admin refresh, taşıdığı AdminSession token'ını DOĞRULAMADAN yeni token
 * üretiyordu: 30 dk hareketsizlikle ölmüş session'a rağmen refresh 200 dönüyor,
 * üretilen access token'ın her kullanımı admin-jwt strategy'de 401 yiyor ve
 * panel "expired=session" ile login'e atıyordu (sonsuz görünümlü döngü).
 *
 * Kural: admin refresh session'ı doğrular (validateAdminSession aynı zamanda
 * süreyi uzatır — aktif panelde 15 dk'lık sessiz refresh de oturumu canlı
 * tutar); ölü session'da 401 → middleware TEK seferde temiz eject yapar.
 */

const adminUser = {
  id: "u1",
  email: "admin@example.com",
  isSeller: false,
  isEmailVerified: true,
  isBanned: false,
  deletedAt: null,
  adminUser: { id: "au1", isActive: true, role: "admin" },
};

function makeService(sessionValid: boolean) {
  const prisma = {
    user: { findUnique: jest.fn().mockResolvedValue(adminUser) },
    refreshToken: {
      findUnique: jest.fn().mockResolvedValue({
        id: "rt1",
        userId: "u1",
        revokedAt: null,
        expiresAt: new Date(Date.now() + 86_400_000),
      }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      create: jest.fn().mockResolvedValue({}),
    },
  };
  const securityService = {
    validateAdminSession: jest
      .fn()
      .mockResolvedValue(sessionValid ? "au1" : null),
  };
  const jwt = {
    signAsync: jest.fn().mockResolvedValue("token"),
    sign: () => "token",
  } as any;
  const config = { get: () => undefined, getOrThrow: () => "secret" } as any;
  const tokens = new AuthTokenService(
    prisma as any,
    jwt,
    config,
    securityService as any,
  );
  const service = new AuthService(
    prisma as any,
    jwt,
    config,
    { sendVerificationEmail: jest.fn(), sendWelcomeEmail: jest.fn() } as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    securityService as any,
    { syncUserConsent: jest.fn() } as any,
    tokens,
    {} as any, // registration — bu suite kayıt yolunu sürmüyor
    {} as any, // passwords — bu suite şifre yolunu sürmüyor
    {} as any, // socialLogins — bu suite sosyal girişi sürmüyor
    {} as any,
  );
  jest
    .spyOn(tokens as any, "persistRefreshToken")
    .mockResolvedValue(undefined as never);
  return { service, securityService };
}

describe("admin refresh validates the AdminSession", () => {
  it("rejects refresh when the admin session has expired (idle timeout)", async () => {
    const { service } = makeService(false);

    await expect(
      service.refreshTokens("u1", "refresh-token", {
        isAdmin: true,
        adminSessionToken: "dead-session",
      }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it("refreshes and extends a live admin session", async () => {
    const { service, securityService } = makeService(true);

    await expect(
      service.refreshTokens("u1", "refresh-token", {
        isAdmin: true,
        adminSessionToken: "live-session",
      }),
    ).resolves.toBeDefined();
    expect(securityService.validateAdminSession).toHaveBeenCalledWith(
      "live-session",
    );
  });
});
