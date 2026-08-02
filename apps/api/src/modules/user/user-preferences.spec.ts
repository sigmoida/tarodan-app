import { validate } from "class-validator";
import { UpdateProfileDto } from "./dto/update-profile.dto";
import { CompleteTourDto } from "./dto/complete-tour.dto";
import {
  MAX_ONBOARDING_TOUR_VERSION,
  ONBOARDING_TOURS,
} from "./user-preferences.constants";
import { UserProfileService } from "./user-profile.service";

describe("user preferences", () => {
  const prisma = {
    user: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
  };
  const moderation = {
    assertTextClean: jest.fn(),
  };
  let service: UserProfileService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new UserProfileService(
      prisma as any,
      moderation as any,
      {} as any,
    );
  });

  it.each(["tr", "en"])("accepts the supported language %s", async (locale) => {
    const dto = Object.assign(new UpdateProfileDto(), {
      preferredLanguage: locale,
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
  });

  it("rejects unsupported languages", async () => {
    const dto = Object.assign(new UpdateProfileDto(), {
      preferredLanguage: "de",
    });

    await expect(validate(dto)).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ property: "preferredLanguage" }),
      ]),
    );
  });

  it("persists the preferred language through profile updates", async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: "user-1",
      membership: null,
    });
    prisma.user.update.mockResolvedValue({ id: "user-1" });
    jest
      .spyOn(service, "findByIdWithAddresses")
      .mockResolvedValue({ id: "user-1", preferredLanguage: "en" } as any);

    await service.updateProfile("user-1", { preferredLanguage: "en" });

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: { preferredLanguage: "en" },
    });
  });

  it("tur sürümünü tanımlı aralıkta doğrular", async () => {
    const make = (version: number) =>
      Object.assign(new CompleteTourDto(), { tour: "home", version });

    await expect(validate(make(1))).resolves.toHaveLength(0);
    // Tanımlı en yüksek sürümün üstü ve sıfır/negatif reddedilir.
    await expect(
      validate(make(MAX_ONBOARDING_TOUR_VERSION + 1)),
    ).resolves.not.toHaveLength(0);
    await expect(validate(make(0))).resolves.not.toHaveLength(0);
  });

  /**
   * Tanıtım turları çoğaldı (ana sayfa + ilan verme). Her tur için ayrı uç/servis
   * yazmak yerine tur anahtarı üzerinden TEK yol kullanılır; sürüm alanı da o
   * anahtardan çözülür. Monotonluk (`lt`) korunur: geri sayım ya da tekrar
   * gösterim olmaz, aynı çağrı iki kez gelse de tek etki eder.
   */
  it.each(Object.entries(ONBOARDING_TOURS))(
    "completes the %s tour monotonically and idempotently",
    async (tour, config) => {
      const field = config.field;
      prisma.user.updateMany.mockResolvedValue({ count: 1 });
      prisma.user.findUnique.mockResolvedValue({ [field]: config.version });

      await expect(
        service.completeTour("user-1", tour as any, config.version),
      ).resolves.toEqual({ [field]: config.version });
      expect(prisma.user.updateMany).toHaveBeenCalledWith({
        where: {
          id: "user-1",
          [field]: { lt: config.version },
        },
        data: { [field]: config.version },
      });
    },
  );

  it("rejects an unknown tour key", async () => {
    await expect(
      service.completeTour("user-1", "nope" as any, 1),
    ).rejects.toThrow();
    expect(prisma.user.updateMany).not.toHaveBeenCalled();
  });

  it("DTO yalnız tanımlı tur anahtarlarını kabul eder", async () => {
    const valid = Object.assign(new CompleteTourDto(), {
      tour: "home",
      version: 1,
    });
    await expect(validate(valid)).resolves.toHaveLength(0);

    const invalid = Object.assign(new CompleteTourDto(), {
      tour: "unknown",
      version: 1,
    });
    await expect(validate(invalid)).resolves.not.toHaveLength(0);
  });
});
