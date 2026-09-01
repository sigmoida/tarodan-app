import { AdminUserAccountService } from "./admin-user-account.service";

/**
 * Aktivasyon işlemleri kayıt akışının sözleşmesini paylaşır: silinmiş ya da
 * zaten doğrulanmış hesapta durur, mail gerçekten gitmediyse "başarılı" demez;
 * toplu yol bir satırın hatasında diğerlerini bırakmaz.
 */
describe("AdminUserAccountService", () => {
  const baseUser = {
    id: "user-1",
    email: "u@example.com",
    deletedAt: null,
    isEmailVerified: false,
  };

  const makeService = (user: Record<string, unknown> | null = baseUser) => {
    const tx = {
      user: {
        update: jest.fn().mockResolvedValue({ ...user, isEmailVerified: true }),
      },
      emailVerificationToken: { updateMany: jest.fn().mockResolvedValue({}) },
    };
    const prisma = {
      user: { findUnique: jest.fn().mockResolvedValue(user) },
      $transaction: jest.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
    };
    const audit = { createAuditLog: jest.fn().mockResolvedValue(undefined) };
    const authService = {
      resendEmailVerification: jest.fn().mockResolvedValue({ success: true }),
      queueEmailVerification: jest.fn().mockResolvedValue(undefined),
    };
    const staffService = { banUser: jest.fn().mockResolvedValue({}) };
    const analyticsOrderService = {
      unbanUser: jest.fn().mockResolvedValue({}),
    };
    const service = new AdminUserAccountService(
      prisma as any,
      audit as any,
      authService as any,
      staffService as any,
      analyticsOrderService as any,
    );
    return {
      service,
      prisma,
      tx,
      audit,
      authService,
      staffService,
      analyticsOrderService,
    };
  };

  describe("resendVerification", () => {
    it("kayıt akışındaki gönderimi kullanır ve audit yazar", async () => {
      const { service, authService, audit } = makeService();

      await expect(
        service.resendVerification("admin-1", "user-1"),
      ).resolves.toEqual({ success: true, userId: "user-1" });

      expect(authService.resendEmailVerification).toHaveBeenCalledWith(
        "user-1",
      );
      expect(audit.createAuditLog).toHaveBeenCalledWith(
        "admin-1",
        "user_verification_resent",
        "User",
        "user-1",
        null,
        { email: "u@example.com" },
      );
    });

    it("mail gitmediyse hata döner, audit yazmaz", async () => {
      const { service, authService, audit } = makeService();
      authService.resendEmailVerification.mockResolvedValue({
        success: false,
        error: "smtp down",
      });

      await expect(
        service.resendVerification("admin-1", "user-1"),
      ).rejects.toMatchObject({
        response: { i18nKey: "server.admin.user.verificationMailFailed" },
      });
      expect(audit.createAuditLog).not.toHaveBeenCalled();
    });

    it("silinmiş hesapta durur", async () => {
      const { service, authService } = makeService({
        ...baseUser,
        deletedAt: new Date(),
      });

      await expect(
        service.resendVerification("admin-1", "user-1"),
      ).rejects.toMatchObject({
        response: { i18nKey: "server.admin.user.deleted" },
      });
      expect(authService.resendEmailVerification).not.toHaveBeenCalled();
    });

    it("zaten doğrulanmış hesapta durur", async () => {
      const { service } = makeService({ ...baseUser, isEmailVerified: true });

      await expect(
        service.resendVerification("admin-1", "user-1"),
      ).rejects.toMatchObject({
        response: { i18nKey: "server.auth.emailAlreadyVerified" },
      });
    });

    it("olmayan kullanıcıda 404", async () => {
      const { service } = makeService(null);

      await expect(
        service.resendVerification("admin-1", "user-x"),
      ).rejects.toMatchObject({
        response: { i18nKey: "server.auth.userNotFound" },
      });
    });
  });

  describe("verifyEmailByAdmin", () => {
    it("e-postayı doğrular, açık token'ları kullanıldı işaretler, audit yazar", async () => {
      const { service, tx, audit } = makeService();

      await expect(
        service.verifyEmailByAdmin("admin-1", "user-1"),
      ).resolves.toEqual({ success: true, userId: "user-1" });

      expect(tx.user.update).toHaveBeenCalledWith({
        where: { id: "user-1" },
        data: { isEmailVerified: true },
      });
      expect(tx.emailVerificationToken.updateMany).toHaveBeenCalledWith({
        where: { userId: "user-1", usedAt: null },
        data: { usedAt: expect.any(Date) },
      });
      expect(audit.createAuditLog).toHaveBeenCalledWith(
        "admin-1",
        "user_email_verified_by_admin",
        "User",
        "user-1",
        { isEmailVerified: false },
        { isEmailVerified: true },
      );
    });

    it("zaten doğrulanmış hesapta yazmaz", async () => {
      const { service, prisma } = makeService({
        ...baseUser,
        isEmailVerified: true,
      });

      await expect(
        service.verifyEmailByAdmin("admin-1", "user-1"),
      ).rejects.toMatchObject({
        response: { i18nKey: "server.auth.emailAlreadyVerified" },
      });
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });

  describe("bulk", () => {
    it("bir satırın hatası diğerlerini durdurmaz; hata katalog anahtarıyla döner", async () => {
      const { service, prisma, authService } = makeService();
      prisma.user.findUnique
        .mockResolvedValueOnce(baseUser)
        .mockResolvedValueOnce({
          ...baseUser,
          id: "user-2",
          isEmailVerified: true,
        })
        .mockResolvedValueOnce({ ...baseUser, id: "user-3" });

      const result = await service.bulkResendVerification("admin-1", [
        "user-1",
        "user-2",
        "user-3",
      ]);

      expect(result).toEqual({
        succeeded: ["user-1", "user-3"],
        failed: [{ id: "user-2", error: "server.auth.emailAlreadyVerified" }],
      });
      // Toplu yol kuyruğa yazar; tekil (senkron) gönderim yolunu kullanmaz.
      expect(authService.queueEmailVerification).toHaveBeenCalledTimes(2);
      expect(authService.resendEmailVerification).not.toHaveBeenCalled();
    });

    it("kuyruğa yazma düşerse o id failed'e girer, audit yazılmaz", async () => {
      const { service, authService, audit } = makeService();
      authService.queueEmailVerification.mockRejectedValueOnce(
        new Error("Redis down"),
      );

      const result = await service.bulkResendVerification("admin-1", [
        "user-1",
      ]);

      expect(result).toEqual({
        succeeded: [],
        failed: [{ id: "user-1", error: "Redis down" }],
      });
      expect(audit.createAuditLog).not.toHaveBeenCalled();
    });

    it("toplu engelleme tekil ban yolunu aynı sebeple çağırır", async () => {
      const { service, staffService } = makeService();
      const dto = { reason: "spam" };

      const result = await service.bulkBan("admin-1", ["a", "b"], dto);

      expect(staffService.banUser).toHaveBeenNthCalledWith(
        1,
        "admin-1",
        "a",
        dto,
      );
      expect(staffService.banUser).toHaveBeenNthCalledWith(
        2,
        "admin-1",
        "b",
        dto,
      );
      expect(result).toEqual({ succeeded: ["a", "b"], failed: [] });
    });

    it("toplu engel kaldırma tekil unban yolunu çağırır", async () => {
      const { service, analyticsOrderService } = makeService();
      analyticsOrderService.unbanUser.mockRejectedValueOnce(new Error("boom"));

      const result = await service.bulkUnban("admin-1", ["a", "b"]);

      expect(result).toEqual({
        succeeded: ["b"],
        failed: [{ id: "a", error: "boom" }],
      });
    });
  });
});
