import { ConsentSource } from "@prisma/client";
import { AuthRegistrationService } from "./auth-registration.service";

/**
 * Kayıt formundaki onaylar kullanıcıyla AYNI transaction'da yazılır ve her
 * belge ayrı bir kayıttır (KVKK, kullanım şartlarından ayrı). Onay göndermeyen
 * eski mobil sürüm kayıt olabilmeye devam eder — eksik belgeyi yeniden-onay
 * kapısı ilk girişte ister.
 */
describe("AuthRegistrationService.register — onay kayıtları", () => {
  const makeService = () => {
    const tx = {
      user: {
        create: jest.fn().mockResolvedValue({
          id: "user-1",
          adminCode: "B10001",
          username: "kaan",
          usernameClaimedAt: new Date(),
          email: "kaan@example.com",
          phone: null,
          displayName: "Kaan",
          isVerified: false,
          isSeller: false,
          sellerType: null,
          createdAt: new Date(),
        }),
      },
    };
    const prisma = {
      user: { findUnique: jest.fn().mockResolvedValue(null) },
      $queryRaw: jest.fn().mockResolvedValue([{ code: "B10001" }]),
      $transaction: jest.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
    };
    const consents = {
      recordAccountConsents: jest.fn().mockResolvedValue(3),
      recordMarketingChange: jest.fn().mockResolvedValue(undefined),
    };
    const newsletter = { syncUserConsent: jest.fn() };
    const notification = { sendWelcomeEmail: jest.fn() };
    const service = new AuthRegistrationService(
      prisma as never,
      notification as never,
      newsletter as never,
      undefined as never,
      { add: jest.fn() } as never,
      consents as never,
      // Yasal kimlik: bu dto alanları göndermiyor, servis çağrılmaz.
      {
        consumeLookupBudget: jest.fn(),
        assertNationalIdAvailable: jest.fn(),
      } as never,
    );
    // E-posta doğrulaması bu testin konusu değil.
    jest
      .spyOn(service, "sendEmailVerification")
      .mockResolvedValue({ success: true });
    return { service, tx, consents };
  };

  const dto = {
    username: "kaan",
    email: "kaan@example.com",
    password: "Secret123",
    displayName: "Kaan",
  };

  it("formdaki belgeleri kullanıcı transaction'ı içinde kaydeder", async () => {
    const { service, tx, consents } = makeService();

    await service.register({
      ...dto,
      acceptedConsents: ["terms", "privacy", "kvkk"],
    });

    expect(consents.recordAccountConsents).toHaveBeenCalledWith(
      "user-1",
      ["terms", "privacy", "kvkk"],
      ConsentSource.registration,
      tx,
    );
  });

  it("onay göndermeyen eski istemci kayıt olabilir", async () => {
    const { service, consents } = makeService();

    await expect(service.register(dto)).resolves.toMatchObject({
      user: { id: "user-1" },
    });
    expect(consents.recordAccountConsents).toHaveBeenCalledWith(
      "user-1",
      undefined,
      ConsentSource.registration,
      expect.anything(),
    );
  });

  it("pazarlama izni verildiyse tarihli bir 'granted' kaydı yazar", async () => {
    const { service, tx, consents } = makeService();

    await service.register({ ...dto, acceptsMarketingEmails: true });

    expect(consents.recordMarketingChange).toHaveBeenCalledWith(
      {
        userId: "user-1",
        granted: true,
        source: ConsentSource.registration,
      },
      tx,
    );
  });

  it("pazarlama izni verilmediyse pazarlama kaydı yazmaz", async () => {
    const { service, consents } = makeService();

    await service.register(dto);

    expect(consents.recordMarketingChange).not.toHaveBeenCalled();
  });
});
