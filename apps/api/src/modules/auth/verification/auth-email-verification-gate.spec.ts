import { UnauthorizedException } from "@nestjs/common";
import { AuthService } from "../auth.service";
import { AuthTokenService } from "../auth-token.service";

/**
 * HIGH: `register` doğrulanmamış kullanıcıya çalışan access + refresh token
 * veriyordu. `login` doğrulama istiyor ama `refreshTokens` ETMİYOR ve hiçbir
 * mutasyon `isEmailVerified` kontrol etmiyor. Sonuç: sahibi olmadığı bir e-posta
 * ile kayıt olan biri ~7 gün (refresh ömrü) boyunca tam hesap işletebiliyordu —
 * ilan açma, ödeme başlatma, e-postayla misafir sipariş sahiplenme dahil. Yani
 * "girişte doğrulama şart" kuralı fiilen bypass edilebiliyordu.
 *
 * Kural tek ve tutarlı olmalı: DOĞRULANMAMIŞ hesap OTURUM SAHİBİ OLAMAZ.
 */
describe("AuthService — email verification gates the session", () => {
  const baseUser = {
    id: "u1",
    email: "user@example.com",
    isSeller: false,
    isEmailVerified: false,
    isBanned: false,
    deletedAt: null,
    adminCode: "K1",
    username: "user",
    usernameClaimedAt: null,
    displayName: "User",
    phone: null,
    sellerType: null,
    isVerified: false,
    createdAt: new Date(),
  };

  const makeService = (overrides: Record<string, any> = {}) => {
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue(baseUser),
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue(baseUser),
        update: jest.fn().mockResolvedValue(baseUser),
      },
      refreshToken: {
        findFirst: jest.fn().mockResolvedValue({
          id: "rt1",
          userId: "u1",
          revokedAt: null,
          expiresAt: new Date(Date.now() + 86400000),
        }),
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        create: jest.fn().mockResolvedValue({}),
      },
      ...overrides,
    };
    const jwt = {
      signAsync: jest.fn().mockResolvedValue("token"),
      sign: () => "token",
    } as any;
    const config = { get: () => undefined } as any;
    const security = {} as any;
    const tokens = new AuthTokenService(prisma as any, jwt, config, security);
    const service = new AuthService(
      prisma as any,
      jwt,
      config,
      { sendVerificationEmail: jest.fn(), sendWelcomeEmail: jest.fn() } as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      security,
      { syncUserConsent: jest.fn() } as any,
      tokens,
      {} as any, // registration — bu suite kayıt yolunu sürmüyor
      {} as any,
    );
    return { service, prisma, tokens };
  };

  it("refreshTokens doğrulanmamış hesapta reddeder (7 günlük pencere kapanır)", async () => {
    const { service } = makeService();

    await expect(
      service.refreshTokens("u1", "some-refresh-token"),
    ).rejects.toThrow(UnauthorizedException);
  });

  it("refreshTokens doğrulanmış hesapta çalışır", async () => {
    const { service, prisma, tokens } = makeService();
    prisma.user.findUnique.mockResolvedValue({
      ...baseUser,
      isEmailVerified: true,
    });
    jest
      .spyOn(tokens as any, "assertAndRotateRefreshToken")
      .mockResolvedValue({ userId: "u1" } as never);
    jest
      .spyOn(tokens as any, "generateTokens")
      .mockResolvedValue({ accessToken: "a", refreshToken: "r" } as never);

    await expect(
      service.refreshTokens("u1", "some-refresh-token"),
    ).resolves.toBeDefined();
  });
});
