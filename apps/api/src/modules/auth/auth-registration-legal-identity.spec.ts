import { ConflictException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { validate } from "class-validator";
import { plainToInstance } from "class-transformer";
import { AuthRegistrationService } from "./auth-registration.service";
import { RegisterDto } from "./dto/register.dto";

/**
 * Kayıtta yasal kimlik (ad, soyad, TCKN): web formu zorunlu ister, sunucu
 * İSTEMEZ — bugünkü mobil sürümler alanları göndermiyor; onların üyeleri kimlik
 * kapısına ilk girişte düşer. Gönderilen alan ise doğrulanır ve TCKN tekildir.
 */
describe("AuthRegistrationService.register — yasal kimlik", () => {
  const makeService = (holder: { id: string } | null = null) => {
    const tx = {
      user: {
        create: jest.fn().mockResolvedValue({
          id: "user-1",
          adminCode: "B10001",
          username: "ayse",
          usernameClaimedAt: new Date(),
          email: "ayse@example.com",
          phone: null,
          displayName: "Ayşe",
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
      recordMarketingChange: jest.fn(),
    };
    const legalIdentity = {
      consumeLookupBudget: jest.fn().mockResolvedValue(undefined),
      assertNationalIdAvailable: jest.fn(async () => {
        if (holder) {
          throw new ConflictException({
            i18nKey: "server.identity.nationalIdUnavailable",
          });
        }
      }),
    };
    const service = new AuthRegistrationService(
      prisma as never,
      { sendWelcomeEmail: jest.fn() } as never,
      { syncUserConsent: jest.fn() } as never,
      undefined as never,
      { add: jest.fn() } as never,
      consents as never,
      legalIdentity as never,
    );
    jest
      .spyOn(service, "sendEmailVerification")
      .mockResolvedValue({ success: true });
    return { service, tx, legalIdentity };
  };

  const dto = {
    username: "ayse",
    email: "ayse@example.com",
    password: "Secret123",
    displayName: "Ayşe",
  };

  it("alanlar gönderildiyse normalize edilip kullanıcı satırına yazılır", async () => {
    const { service, tx, legalIdentity } = makeService();

    await service.register({
      ...dto,
      legalFirstName: "  Ayşe   Nur ",
      legalLastName: "Yılmaz",
      nationalId: "100 000 001 46",
    });

    const { data } = tx.user.create.mock.calls[0][0];
    expect(data).toMatchObject({
      legalFirstName: "Ayşe Nur",
      legalLastName: "Yılmaz",
      nationalId: "10000000146",
    });
    expect(legalIdentity.consumeLookupBudget).toHaveBeenCalledWith(null);
    expect(legalIdentity.assertNationalIdAvailable).toHaveBeenCalledWith(
      "10000000146",
    );
  });

  it("alanları göndermeyen (eski mobil) istemci kayıt olur; kimlik kapısı sonra ister", async () => {
    const { service, tx, legalIdentity } = makeService();

    await expect(service.register(dto)).resolves.toMatchObject({
      user: { id: "user-1" },
    });

    const { data } = tx.user.create.mock.calls[0][0];
    expect(data).not.toHaveProperty("legalFirstName");
    expect(data).not.toHaveProperty("nationalId");
    // Numara yokken kahin bütçesi harcanmaz.
    expect(legalIdentity.consumeLookupBudget).not.toHaveBeenCalled();
  });

  it("başka hesaptaki TCKN ile kayıt reddedilir, kullanıcı satırı açılmaz", async () => {
    const { service, tx } = makeService({ id: "other" });

    await expect(
      service.register({ ...dto, nationalId: "10000000146" }),
    ).rejects.toMatchObject({
      response: { i18nKey: "server.identity.nationalIdUnavailable" },
    });
    expect(tx.user.create).not.toHaveBeenCalled();
  });

  it("DB yarışında (P2002 national_id) aynı genel yanıt döner", async () => {
    const { service, tx } = makeService();
    tx.user.create.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError("unique", {
        code: "P2002",
        clientVersion: "test",
        meta: { target: ["national_id"] },
      }),
    );

    await expect(
      service.register({ ...dto, nationalId: "10000000146" }),
    ).rejects.toMatchObject({
      status: 409,
      response: { i18nKey: "server.identity.nationalIdUnavailable" },
    });
  });
});

describe("RegisterDto — yasal kimlik alanları", () => {
  const errorsFor = async (payload: Record<string, unknown>) => {
    const instance = plainToInstance(RegisterDto, {
      username: "ayse",
      email: "ayse@example.com",
      password: "Secret123",
      displayName: "Ayşe",
      ...payload,
    });
    return (await validate(instance)).map((e) => e.property);
  };

  it("alanlar ZORUNLU DEĞİL (mobil uyumluluğu)", async () => {
    expect(await errorsFor({})).toEqual([]);
  });

  it("gönderilen TCKN checksum'la, ad harf kuralıyla doğrulanır", async () => {
    expect(await errorsFor({ nationalId: "12345678951" })).toEqual([
      "nationalId",
    ]);
    expect(await errorsFor({ legalLastName: "Yılmaz2" })).toEqual([
      "legalLastName",
    ]);
    expect(
      await errorsFor({
        legalFirstName: "Ayşe",
        legalLastName: "Yılmaz",
        nationalId: "10000000146",
      }),
    ).toEqual([]);
  });
});
