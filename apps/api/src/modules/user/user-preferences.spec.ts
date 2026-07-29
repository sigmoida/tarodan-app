import { validate } from "class-validator";
import { UpdateProfileDto } from "./dto/update-profile.dto";
import { CompleteHomeTourDto } from "./dto/complete-home-tour.dto";
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

  it("accepts only the current home tour version", async () => {
    const current = Object.assign(new CompleteHomeTourDto(), { version: 1 });
    const future = Object.assign(new CompleteHomeTourDto(), { version: 2 });
    const invalid = Object.assign(new CompleteHomeTourDto(), { version: 0 });

    await expect(validate(current)).resolves.toHaveLength(0);
    await expect(validate(future)).resolves.not.toHaveLength(0);
    await expect(validate(invalid)).resolves.not.toHaveLength(0);
  });

  it("completes the home tour monotonically and idempotently", async () => {
    prisma.user.updateMany.mockResolvedValue({ count: 1 });
    prisma.user.findUnique.mockResolvedValue({ homeTourVersion: 1 });

    await expect(service.completeHomeTour("user-1", 1)).resolves.toEqual({
      homeTourVersion: 1,
    });
    expect(prisma.user.updateMany).toHaveBeenCalledWith({
      where: {
        id: "user-1",
        homeTourVersion: { lt: 1 },
      },
      data: { homeTourVersion: 1 },
    });
  });
});
