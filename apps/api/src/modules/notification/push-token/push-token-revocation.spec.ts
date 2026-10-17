import { UnauthorizedException } from "@nestjs/common";
import { PushTokenRevocationService } from "./push-token-revocation.service";
import { ExpoPushProvider } from "../providers/expo-push.provider";
import { NotificationController } from "../notification.controller";
import { NotificationDispatchService } from "../notification-dispatch.service";
import { SecurityService } from "../../security/security.service";

/**
 * Oturumu kapanan cihaz bildirim almaya devam etmesin:
 *  - sunucu oturumları düşürdüğünde (tüm cihazlardan çıkış, parola sıfırlama)
 *    push token'ları da pasifleşir;
 *  - cihazın kendi iptal çağrısı (çıkış) oturumsuz da çalışır;
 *  - aynı cihazda başka hesap açılınca önceki hesabın satırı pasifleşir;
 *  - yasaklı/silinmiş hesap cihaz kaydedemez.
 */
const TOKEN = "ExponentPushToken[abcdefghijklmnopqrstuv]";

describe("PushTokenRevocationService.deactivateAllForUser", () => {
  it("kullanıcının aktif token'larını verilen transaction üzerinden pasifleştirir", async () => {
    const prisma = { pushToken: { updateMany: jest.fn() } };
    const tx = {
      pushToken: { updateMany: jest.fn().mockResolvedValue({ count: 2 }) },
    };
    const service = new PushTokenRevocationService(prisma as never);

    await expect(service.deactivateAllForUser("u1", tx as never)).resolves.toBe(
      2,
    );
    expect(tx.pushToken.updateMany).toHaveBeenCalledWith({
      where: { userId: "u1", isActive: true },
      data: { isActive: false },
    });
    expect(prisma.pushToken.updateMany).not.toHaveBeenCalled();
  });
});

describe("SecurityService.revokeAllUserTokens (tüm cihazlardan çıkış)", () => {
  it("refresh token'larla aynı transaction'da push token'ları da düşürür", async () => {
    const tx = {
      refreshToken: { updateMany: jest.fn().mockResolvedValue({ count: 3 }) },
    };
    const prisma = {
      $transaction: jest.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
    };
    const pushTokens = { deactivateAllForUser: jest.fn() };
    const service = new SecurityService(
      prisma as never,
      {} as never,
      pushTokens as never,
    );

    await service.revokeAllUserTokens("u1");

    expect(tx.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { userId: "u1", revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
    expect(pushTokens.deactivateAllForUser).toHaveBeenCalledWith("u1", tx);
  });
});

describe("ExpoPushProvider.registerToken", () => {
  function createProvider(owner: unknown) {
    const prisma = {
      user: { findUnique: jest.fn().mockResolvedValue(owner) },
      pushToken: {
        updateMany: jest.fn().mockReturnValue("deactivate-others"),
        upsert: jest.fn().mockReturnValue("upsert-own"),
      },
      $transaction: jest.fn().mockResolvedValue([]),
    };
    const config = { get: jest.fn().mockReturnValue("") };
    return {
      provider: new ExpoPushProvider(config as never, prisma as never),
      prisma,
    };
  }

  it("aynı cihazdaki BAŞKA hesabın satırını pasifleştirip kendi satırını açar", async () => {
    const { provider, prisma } = createProvider({
      isBanned: false,
      deletedAt: null,
    });

    await provider.registerToken("u2", TOKEN, "ios");

    expect(prisma.pushToken.updateMany).toHaveBeenCalledWith({
      where: { token: TOKEN, userId: { not: "u2" }, isActive: true },
      data: { isActive: false },
    });
    expect(prisma.$transaction).toHaveBeenCalledWith([
      "deactivate-others",
      "upsert-own",
    ]);
  });

  it.each([
    ["yasaklı", { isBanned: true, deletedAt: null }],
    ["silinmiş", { isBanned: false, deletedAt: new Date() }],
    ["bulunamayan", null],
  ])("%s hesap cihaz kaydedemez", async (_label, owner) => {
    const { provider, prisma } = createProvider(owner);

    await expect(provider.registerToken("u1", TOKEN, "ios")).rejects.toThrow();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

describe("POST /notifications/push-token", () => {
  function createController() {
    const notificationService = {
      registerPushToken: jest.fn().mockResolvedValue({ success: true }),
    };
    return {
      controller: new NotificationController(notificationService as never),
      notificationService,
    };
  }

  it("iptal (revoke) oturumsuz da çalışır — çıkışta erişim jetonu düşmüş olabilir", async () => {
    const { controller, notificationService } = createController();

    await controller.registerPushToken(null, { token: TOKEN, revoke: true });

    expect(notificationService.registerPushToken).toHaveBeenCalledWith(null, {
      token: TOKEN,
      revoke: true,
    });
  });

  it("kayıt oturum ister → 401 (istemci jetonu yenileyip tekrar dener)", async () => {
    const { controller, notificationService } = createController();

    await expect(
      controller.registerPushToken(null, { token: TOKEN, platform: "ios" }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(notificationService.registerPushToken).not.toHaveBeenCalled();
  });
});

describe("Cihaz çıkışı (revoke) — token'ın TÜM satırları", () => {
  it("provider: o token'ın tüm satırlarını pasifleştirir", async () => {
    const prisma = { pushToken: { updateMany: jest.fn() } };
    const config = { get: jest.fn().mockReturnValue("") };
    const provider = new ExpoPushProvider(config as never, prisma as never);

    await provider.deactivateToken(TOKEN);

    expect(prisma.pushToken.updateMany).toHaveBeenCalledWith({
      where: { token: TOKEN },
      data: { isActive: false },
    });
  });

  it.each([
    ["oturumlu", "u1"],
    ["oturumsuz", null],
  ])(
    "%s iptal çağıranla sınırlanmaz — başka hesabın eski satırı da kapanır",
    async (_label, userId) => {
      const expo = { deactivateToken: jest.fn(), registerToken: jest.fn() };
      const dispatch = new NotificationDispatchService(
        {} as never,
        expo as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
      );

      await expect(
        dispatch.registerPushToken(userId, { token: TOKEN, revoke: true }),
      ).resolves.toMatchObject({ success: true, revoked: true });
      expect(expo.deactivateToken).toHaveBeenCalledWith(TOKEN);
      expect(expo.registerToken).not.toHaveBeenCalled();
    },
  );
});
