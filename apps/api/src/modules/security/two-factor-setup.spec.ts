import { BadRequestException } from "@nestjs/common";
import { SecurityService } from "./security.service";
import { encryptSecret, deriveSecretKey } from "../../common/security/secret-cipher";
import { generateTotpCode } from "./totp.util";

/**
 * 2FA kurulum akışı: bekleyen sır yeniden kullanımı ve geçersiz kodun 400
 * dönmesi (401 istemcilerde oturum bitti sanılıp çıkışa yol açıyordu).
 */
describe("SecurityService 2FA setup flow", () => {
  const KEY = "test-two-factor-key";
  const QR_TIMEOUT_MS = 20_000;

  const build = (row: any) => {
    const prisma = {
      twoFactorSecret: {
        findUnique: jest.fn().mockResolvedValue(row),
        create: jest.fn().mockResolvedValue({}),
        update: jest.fn().mockResolvedValue({}),
      },
      user: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ email: "a+b@ornek.com", passwordHash: "h" }),
      },
      adminUser: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
    };
    const config = {
      get: jest.fn().mockReturnValue(KEY),
      getOrThrow: jest.fn().mockReturnValue(KEY),
    };
    return { prisma, service: new SecurityService(prisma as any, config as any) };
  };

  const pendingRow = (secret: string, ageMs: number, isEnabled = false) => ({
    userId: "u1",
    secret: encryptSecret(secret, deriveSecretKey(KEY)),
    isEnabled,
    backupCodes: [],
    updatedAt: new Date(Date.now() - ageMs),
  });

  const SECRET = "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP";

  it(
    "pencere içinde aynı sırrı döndürür ve sırrı yeniden yazmaz",
    async () => {
      const { prisma, service } = build(pendingRow(SECRET, 60_000));
      const res = await service.enable2FA("u1");

      expect(res.secret).toBe(SECRET);
      expect(res.qrCodeUrl).toContain(`secret=${SECRET}`);
      expect(res.backupCodes).toHaveLength(10);
      const data = prisma.twoFactorSecret.update.mock.calls[0][0].data;
      expect(data.secret).toBeUndefined();
      expect(data.isEnabled).toBe(false);
    },
    QR_TIMEOUT_MS,
  );

  it(
    "pencere dolunca yeni sır üretir ve yazar",
    async () => {
      const { prisma, service } = build(pendingRow(SECRET, 11 * 60_000));
      const res = await service.enable2FA("u1");

      expect(res.secret).not.toBe(SECRET);
      const data = prisma.twoFactorSecret.update.mock.calls[0][0].data;
      expect(data.secret).toEqual(expect.stringMatching(/^v1:/));
    },
    QR_TIMEOUT_MS,
  );

  it(
    "etiketi kodlar: issuer ve e-posta tek etiket, '+' kaçışlı",
    async () => {
      const { service } = build(null);
      const res = await service.enable2FA("u1");
      expect(res.qrCodeUrl).toContain(
        `otpauth://totp/${encodeURIComponent("Tarodan:a+b@ornek.com")}?`,
      );
    },
    QR_TIMEOUT_MS,
  );

  it("zaten etkinse 400 döner", async () => {
    const { service } = build(pendingRow(SECRET, 1000, true));
    await expect(service.enable2FA("u1")).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  describe("geçersiz kod -> 400", () => {
    it("verify", async () => {
      const { service } = build(pendingRow(SECRET, 1000));
      const err = await service.verify2FA("u1", "000000").catch((e) => e);
      expect(err).toBeInstanceOf(BadRequestException);
      expect(err.getResponse()).toMatchObject({
        i18nKey: "server.security.invalidCode",
        errorCode: "INVALID_2FA_CODE",
      });
    });

    it("disable", async () => {
      const { service } = build(pendingRow(SECRET, 1000, true));
      await expect(service.disable2FA("u1", "000000")).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it("regenerateBackupCodes", async () => {
      const { service } = build(pendingRow(SECRET, 1000, true));
      await expect(
        service.regenerateBackupCodes("u1", "000000"),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  it("geçerli kodla verify 2FA'yı etkinleştirir", async () => {
    const { prisma, service } = build(pendingRow(SECRET, 1000));
    const code = generateTotpCode(SECRET, Math.floor(Date.now() / 1000 / 30));
    await expect(service.verify2FA("u1", code)).resolves.toBe(true);
    expect(prisma.twoFactorSecret.update.mock.calls[0][0].data.isEnabled).toBe(
      true,
    );
  });
});
