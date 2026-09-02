import { UnauthorizedException } from "@nestjs/common";
import { AuthService } from "./auth.service";
import { AuthTokenService } from "./auth-token.service";

/**
 * Rotasyon yarışı düzeltmesi: refresh token tek kullanımlık (rotation) ama
 * çok-sekmeli/paralel istemcide yeni cookie tarayıcıya ulaşmadan ESKİ token'la
 * yola çıkmış bir refresh isteği kaçınılmaz. Eskiden bu istek "revoked" diye
 * reddediliyor ve BFF oturumu ölü sayıp cookie'leri siliyordu → canlı oturum
 * dahil her şey "oturum süreniz doldu"ya düşüyordu (tek sekmede bile: sayfa
 * onlarca paralel istek atar).
 *
 * Kural: iptalden sonraki KISA pencerede (60 sn) eski token hâlâ kabul edilir
 * ve yeni çift üretilir; pencere dışı kullanım gerçek replay'dir → red.
 */

const baseUser = {
  id: "u1",
  email: "user@example.com",
  isSeller: false,
  isEmailVerified: true,
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
  adminUser: null,
};

function makeService(
  tokenRow: Record<string, unknown> | null,
  user: Record<string, unknown> = baseUser,
) {
  const prisma = {
    user: {
      findUnique: jest.fn().mockResolvedValue(user),
    },
    refreshToken: {
      findUnique: jest.fn().mockResolvedValue(tokenRow),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      create: jest.fn().mockResolvedValue({}),
    },
  };
  const jwt = {
    signAsync: jest.fn().mockResolvedValue("token"),
    sign: () => "token",
  } as any;
  const config = { get: () => undefined } as any;
  const security = {} as any;
  const tokens = new AuthTokenService(prisma as any, jwt, config, security);
  // Bu suite yalnız refresh rotasyonunu sürüyor; diğer slotlar boş.
  const service = new AuthService(
    prisma as any,
    tokens,
    {} as any, // registration
    {} as any, // passwords
    {} as any, // logins
    {} as any, // socialLogins
  );
  jest
    .spyOn(tokens as any, "generateTokens")
    .mockResolvedValue({ accessToken: "a2", refreshToken: "r2" } as never);
  return { service, prisma };
}

describe("refresh token rotation grace window", () => {
  it("accepts a token revoked SECONDS ago (rotation race, not replay)", async () => {
    const { service, prisma } = makeService({
      id: "rt1",
      userId: "u1",
      revokedAt: new Date(Date.now() - 10_000),
      expiresAt: new Date(Date.now() + 86_400_000),
    });

    await expect(
      service.refreshTokens("u1", "old-but-fresh-token"),
    ).resolves.toBeDefined();
    // Grace yolu tekrar tüketim YAPMAZ (token zaten revoked).
    expect(prisma.refreshToken.updateMany).not.toHaveBeenCalled();
  });

  it("still rejects a token revoked long ago (genuine replay)", async () => {
    const { service } = makeService({
      id: "rt1",
      userId: "u1",
      revokedAt: new Date(Date.now() - 5 * 60_000),
      expiresAt: new Date(Date.now() + 86_400_000),
    });

    await expect(service.refreshTokens("u1", "replayed-token")).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it("rejects a graced token that belongs to another user", async () => {
    const { service } = makeService({
      id: "rt1",
      userId: "someone-else",
      revokedAt: new Date(Date.now() - 10_000),
      expiresAt: new Date(Date.now() + 86_400_000),
    });

    await expect(service.refreshTokens("u1", "stolen-token")).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it("rejects a customer refresh for a staff (AdminUser) account with STAFF_ACCOUNT", async () => {
    const { service, prisma } = makeService(
      {
        id: "rt1",
        userId: "u1",
        revokedAt: null,
        expiresAt: new Date(Date.now() + 86_400_000),
      },
      { ...baseUser, adminUser: { id: "admin-1" } },
    );

    await expect(
      service.refreshTokens("u1", "live-token"),
    ).rejects.toMatchObject({
      response: {
        i18nKey: "server.auth.staffAccountCustomerLogin",
        errorCode: "STAFF_ACCOUNT",
      },
    });
    // Eski refresh token burada ölür: rotasyon/tüketim hiç başlamaz.
    expect(prisma.refreshToken.updateMany).not.toHaveBeenCalled();
  });

  it("keeps consuming a live token atomically (normal rotation unchanged)", async () => {
    const { service, prisma } = makeService({
      id: "rt1",
      userId: "u1",
      revokedAt: null,
      expiresAt: new Date(Date.now() + 86_400_000),
    });

    await expect(
      service.refreshTokens("u1", "live-token"),
    ).resolves.toBeDefined();
    expect(prisma.refreshToken.updateMany).toHaveBeenCalledTimes(1);
  });
});
