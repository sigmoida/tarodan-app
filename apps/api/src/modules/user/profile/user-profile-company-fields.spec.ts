import { UserProfileService } from "./user-profile.service";

/**
 * Şirket kimliği (companyName + taxId) SELF-SERVICE yazılamaz.
 *
 * Eski koşul `isBusinessTier || isCorporateSeller` idi ve `isCorporateSeller`
 * istemcinin gönderdiği çıplak bir bayraktı: herhangi bir bireysel kullanıcı
 * API'den şirket adı + vergi no yazdırabiliyordu. Bu alanlara güvenen web
 * guard'ı onu /membership?required=true döngüsüne kilitliyor, profil yüzeyleri
 * sahte "şirket" kimliği gösteriyordu. Şirket kimliği yalnız kurumsal onay
 * boru hattından (finalApprove) damgalanır; profilden yalnız businessStatus
 * = approved hesap GÜNCELLEYEBİLİR.
 */
describe("UserProfileService.updateProfile — şirket alanları", () => {
  const makeService = (user: Record<string, unknown>) => {
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue(user),
        findFirst: jest.fn().mockResolvedValue(null),
        update: jest
          .fn()
          .mockImplementation(({ data }: any) =>
            Promise.resolve({ id: "user-1", ...data }),
          ),
      },
    };
    const moderationAi = { assertTextClean: jest.fn() };
    const common = {
      formatUserProfile: jest.fn((u: unknown) => u),
      resolveAvatarUrl: jest.fn(),
    };
    const service = new UserProfileService(
      prisma as any,
      moderationAi as any,
      common as any,
      {
        isBlockedEither: async () => false,
        getHiddenUserIds: async () => [],
      } as any,
    );
    // updateProfile sonda tam profili yeniden okur — bu test yazılan ALANLARA
    // baktığı için ağır okuma zinciri stub'lanır.
    jest.spyOn(service, "findByIdWithAddresses").mockResolvedValue({} as never);
    return { service, prisma };
  };

  it("onaylı olmayan kullanıcı isCorporateSeller bayrağıyla şirket kimliği yazamaz", async () => {
    const { service, prisma } = makeService({
      id: "user-1",
      businessStatus: null,
      membership: { tier: { type: "free" } },
    });

    await service.updateProfile("user-1", {
      displayName: "Deneme",
      isCorporateSeller: true,
      companyName: "Sahte AŞ",
      taxId: "1234567890",
    } as any);

    const written = prisma.user.update.mock.calls[0][0].data;
    expect(written.companyName).not.toBe("Sahte AŞ");
    expect(written.taxId).not.toBe("1234567890");
  });

  it("onaylı kurumsal hesap şirket bilgisini güncelleyebilir", async () => {
    const { service, prisma } = makeService({
      id: "user-1",
      businessStatus: "approved",
      membership: { tier: { type: "business" } },
    });

    await service.updateProfile("user-1", {
      companyName: "Gerçek Ltd. Şti.",
      taxId: "9876543210",
    } as any);

    const written = prisma.user.update.mock.calls[0][0].data;
    expect(written.companyName).toBe("Gerçek Ltd. Şti.");
    expect(written.taxId).toBe("9876543210");
  });
});
