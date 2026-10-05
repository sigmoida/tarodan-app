import { BadRequestException } from "@nestjs/common";
import { UserProfileService } from "./user-profile.service";

/**
 * Profilden telefon güncelleme kuralı, SMS doğrulama akışıyla AYNI olmalı.
 *
 * Eskiden numara değişince `isPhoneVerified` olduğu gibi kalıyordu: doğrulanmış
 * bir kullanıcı hiç kanıtlamadığı bir numaraya geçip "doğrulanmış" görünmeye
 * devam ediyordu. Çakışma kuralı da iki yerde farklıydı (profil: her kayıt
 * engeller; doğrulama: yalnız doğrulanmış sahip engeller).
 */
describe("UserProfileService.updateProfile — telefon", () => {
  const makeService = (
    user: Record<string, unknown>,
    holder: { isPhoneVerified: boolean } | null = null,
  ) => {
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue(user),
        findFirst: jest.fn().mockResolvedValue(holder),
        update: jest
          .fn()
          .mockImplementation(({ data }: any) =>
            Promise.resolve({ id: "user-1", ...data }),
          ),
      },
    };
    const service = new UserProfileService(
      prisma as any,
      { assertTextClean: jest.fn() } as any,
      {
        formatUserProfile: jest.fn((u: unknown) => u),
        resolveAvatarUrl: jest.fn(),
      } as any,
      {
        isBlockedEither: async () => false,
        getHiddenUserIds: async () => [],
      } as any,
      { recordMarketingChange: jest.fn() } as never, // consents
      { syncUserConsent: jest.fn() } as never, // newsletter
    );
    jest.spyOn(service, "findByIdWithAddresses").mockResolvedValue({} as never);
    const written = () => prisma.user.update.mock.calls[0][0].data;
    return { service, prisma, written };
  };

  const VERIFIED_USER = {
    id: "user-1",
    phone: "+905551112233",
    isPhoneVerified: true,
    businessStatus: null,
    membership: null,
  };

  it("numara değişince doğrulama sıfırlanır", async () => {
    const { service, written } = makeService(VERIFIED_USER);

    await service.updateProfile("user-1", { phone: "+905559998877" });

    expect(written()).toMatchObject({
      phone: "+905559998877",
      isPhoneVerified: false,
    });
  });

  it("aynı numara yeniden gönderilince doğrulama korunur", async () => {
    const { service, prisma, written } = makeService(VERIFIED_USER);

    await service.updateProfile("user-1", {
      displayName: "Yeni Ad",
      phone: "+905551112233",
    });

    expect(written()).not.toHaveProperty("isPhoneVerified");
    expect(written()).not.toHaveProperty("phone");
    expect(prisma.user.findFirst).not.toHaveBeenCalled();
  });

  it("numara başka hesapta DOĞRULANMIŞSA reddedilir", async () => {
    const { service, prisma } = makeService(VERIFIED_USER, {
      isPhoneVerified: true,
    });

    await expect(
      service.updateProfile("user-1", { phone: "+905559998877" }),
    ).rejects.toThrow(BadRequestException);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it("numara başka hesapta doğrulanmamış duruyorsa engel olmaz ama burada yazılmaz", async () => {
    const { service, written } = makeService(VERIFIED_USER, {
      isPhoneVerified: false,
    });

    await service.updateProfile("user-1", {
      displayName: "Yeni Ad",
      phone: "+905559998877",
    });

    // `phone` tekil olduğu için yazmak P2002 verirdi; numarayı SMS doğrulaması
    // devralır. Mevcut (doğrulanmış) numara o ana kadar yerinde kalır.
    expect(written()).not.toHaveProperty("phone");
    expect(written()).not.toHaveProperty("isPhoneVerified");
  });

  it("yalnız telefon gönderilip numara doğrulanmamış hesaptaysa hata vermez, yazmaz", async () => {
    const { service, prisma } = makeService(VERIFIED_USER, {
      isPhoneVerified: false,
    });

    // "Güncellenecek alan yok" 400'ü istemcinin SMS doğrulamasına geçmesini
    // engellerdi.
    await expect(
      service.updateProfile("user-1", { phone: "+905559998877" }),
    ).resolves.toBeDefined();
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it("numara boş dizgiyle silinince null yazılır", async () => {
    const { service, written } = makeService(VERIFIED_USER);

    await service.updateProfile("user-1", { phone: "" });

    expect(written()).toMatchObject({ phone: null, isPhoneVerified: false });
  });
});
