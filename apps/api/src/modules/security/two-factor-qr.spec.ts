import { SecurityService } from "./security.service";

/**
 * 2FA kurulumunda taranabilir bir QR görseli döndüğünü doğrular.
 *
 * Uç yalnız `otpauth://...` sağlama URI'si döndürüyordu; web onu doğrudan
 * `<Image src>` içine koyduğu için tarayıcı yükleyemiyor ve kullanıcı kırık
 * görsel görüyordu. `otpauth` bir görsel adresi değil, kimlik doğrulayıcı
 * uygulamasına verilen bir bağlantı.
 */
describe("SecurityService 2FA setup QR", () => {
  const prisma = {
    twoFactorSecret: {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({}),
      update: jest.fn().mockResolvedValue({}),
    },
    user: {
      findUnique: jest.fn().mockResolvedValue({
        email: "kullanici@ornek.com",
        passwordHash: "hash",
      }),
    },
  };

  const config = {
    get: jest.fn().mockReturnValue("test-two-factor-key"),
    getOrThrow: jest.fn().mockReturnValue("test-two-factor-key"),
  };
  const service = new SecurityService(prisma as any, config as any);

  it("taranabilir bir PNG data URL döndürür", async () => {
    const result = await service.enable2FA("user-1");

    expect(result.qrCodeImage).toMatch(/^data:image\/png;base64,/);
    // Boş/kısa bir gövde "üretildi" sayılmamalı.
    expect(result.qrCodeImage.length).toBeGreaterThan(200);
  });

  it("sağlama URI'sini de korur — kimlik doğrulayıcıya derin bağlantı için", async () => {
    const result = await service.enable2FA("user-1");

    expect(result.qrCodeUrl).toContain("otpauth://totp/");
    expect(result.qrCodeUrl).toContain(`secret=${result.secret}`);
  });
});
