import { AuthPasswordService } from "./auth-password.service";

/**
 * Parola sıfırlama tüm oturumları düşürür; refresh VE push token iptali tek
 * kaynaktan (SecurityService.revokeAllUserTokens) geçer — kapanan
 * oturumların cihazları bildirim almaya devam etmesin.
 */
describe("AuthPasswordService.resetPassword — oturum iptali", () => {
  it("parola güncellenince revokeAllUserTokens çağrılır", async () => {
    const prisma = {
      passwordResetToken: {
        findUnique: jest.fn().mockResolvedValue({
          id: "rt1",
          userId: "u1",
          usedAt: null,
          expiresAt: new Date(Date.now() + 60_000),
          user: { deletedAt: null, isBanned: false },
        }),
        update: jest.fn().mockResolvedValue({}),
      },
      user: { update: jest.fn().mockResolvedValue({}) },
      refreshToken: { updateMany: jest.fn() },
    };
    const security = { revokeAllUserTokens: jest.fn() };
    const service = new AuthPasswordService(
      prisma as never,
      {} as never,
      security as never,
    );

    await service.resetPassword("raw-token", "NewPassw0rd!");

    expect(prisma.user.update).toHaveBeenCalled();
    expect(security.revokeAllUserTokens).toHaveBeenCalledWith("u1");
    expect(prisma.refreshToken.updateMany).not.toHaveBeenCalled();
  });
});
