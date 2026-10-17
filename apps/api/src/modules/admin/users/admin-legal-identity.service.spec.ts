import { Prisma } from "@prisma/client";
import { validate } from "class-validator";
import { plainToInstance } from "class-transformer";
import {
  AdminLegalIdentityService,
  LEGAL_IDENTITY_CORRECTION_ACTION,
} from "./admin-legal-identity.service";
import { AdminLegalIdentityController } from "./admin-legal-identity.controller";
import { LegalIdentityService } from "../../legal-identity/legal-identity.service";
import { AdminCorrectLegalIdentityDto } from "../../legal-identity/dto/legal-identity.dto";

/**
 * Admin düzeltmesi: üyenin kendisinin değiştiremediği yasal kimliği yalnız
 * yönetici düzeltir — aynı doğrulama ve tekillikle, zorunlu gerekçe ve aynı
 * transaction'da zorunlu denetim kaydıyla. Denetim kaydı ad ve tam TCKN
 * taşımaz.
 */
describe("AdminLegalIdentityService.correct", () => {
  const current = {
    legalFirstName: "Ayşe",
    legalLastName: "Yılmz",
    nationalId: "10000000146",
  };

  const makeService = (opts: { holder?: { id: string } | null } = {}) => {
    const tx = {
      user: {
        findUnique: jest.fn(
          async (args: { where: { id?: string; nationalId?: string } }) =>
            args.where.nationalId !== undefined
              ? (opts.holder ?? null)
              : { ...current },
        ),
        update: jest.fn().mockResolvedValue({ id: "u1" }),
      },
    };
    const prisma = {
      $transaction: jest.fn((fn: (client: typeof tx) => unknown) => fn(tx)),
    };
    const audit = {
      createRequiredAuditLog: jest.fn().mockResolvedValue({}),
    };
    const legalIdentity = new LegalIdentityService(
      prisma as never,
      { checkRateLimit: jest.fn() } as never,
    );
    const service = new AdminLegalIdentityService(
      prisma as never,
      audit as never,
      legalIdentity,
    );
    return { service, tx, audit };
  };

  it("düzeltmeyi yazar ve denetim kaydını AYNI transaction'da bırakır", async () => {
    const { service, tx, audit } = makeService();

    const result = await service.correct("admin-1", "u1", {
      legalLastName: "Yılmaz",
      reason: "Nüfus cüzdanı görüldü, soyad yazımı düzeltildi",
    });

    expect(tx.user.update).toHaveBeenCalledWith({
      where: { id: "u1" },
      data: { legalLastName: "Yılmaz" },
      select: { id: true },
    });
    expect(result).toEqual({ ...current, legalLastName: "Yılmaz" });
    expect(audit.createRequiredAuditLog).toHaveBeenCalledWith(
      "admin-1",
      LEGAL_IDENTITY_CORRECTION_ACTION,
      "User",
      "u1",
      { nationalIdMasked: "•••••••••46" },
      {
        changedFields: ["legalLastName"],
        nationalIdMasked: "•••••••••46",
        reason: "Nüfus cüzdanı görüldü, soyad yazımı düzeltildi",
      },
      tx,
    );
  });

  it("denetim kaydına ad ve tam TCKN DEĞER olarak yazılmaz", async () => {
    const { service, audit } = makeService();

    await service.correct("admin-1", "u1", {
      legalLastName: "Yılmaz",
      nationalId: "12345678950",
      reason: "Nüfus kaydı değişikliği",
    });

    const [, , , , oldValue, newValue] =
      audit.createRequiredAuditLog.mock.calls[0];
    const text = JSON.stringify([oldValue, newValue]);
    expect(text).not.toContain("10000000146");
    expect(text).not.toContain("12345678950");
    expect(text).not.toContain("Yılmaz");
    expect(newValue.changedFields).toEqual(["legalLastName", "nationalId"]);
  });

  it("denetim kaydı yazılamazsa düzeltme de geri alınır (fail-closed)", async () => {
    const { service, audit } = makeService();
    audit.createRequiredAuditLog.mockRejectedValueOnce(new Error("audit down"));

    await expect(
      service.correct("admin-1", "u1", {
        legalLastName: "Yılmaz",
        reason: "Yazım düzeltmesi",
      }),
    ).rejects.toThrow("audit down");
  });

  it("başka hesaptaki TCKN'yi admin de yazamaz; yanıt o hesabı ele vermez", async () => {
    const { service, tx, audit } = makeService({ holder: { id: "u2" } });

    const error = await service
      .correct("admin-1", "u1", {
        nationalId: "12345678950",
        reason: "Yanlış girilmiş",
      })
      .catch((e: unknown) => e);

    expect(error).toMatchObject({
      status: 409,
      response: { i18nKey: "server.identity.nationalIdUnavailable" },
    });
    expect(JSON.stringify(error)).not.toContain("u2");
    expect(tx.user.update).not.toHaveBeenCalled();
    expect(audit.createRequiredAuditLog).not.toHaveBeenCalled();
  });

  it("transaction içindeki DB yarışı (P2002) aynı genel yanıta çevrilir", async () => {
    const { service, tx } = makeService();
    tx.user.update.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError("unique", {
        code: "P2002",
        clientVersion: "test",
        meta: { target: ["national_id"] },
      }),
    );

    await expect(
      service.correct("admin-1", "u1", {
        nationalId: "12345678950",
        reason: "Yanlış girilmiş",
      }),
    ).rejects.toMatchObject({
      status: 409,
      response: { i18nKey: "server.identity.nationalIdUnavailable" },
    });
  });

  it("değişiklik yoksa reddeder (boş denetim kaydı yazılmaz)", async () => {
    const { service, audit } = makeService();

    await expect(
      service.correct("admin-1", "u1", {
        legalFirstName: "Ayşe",
        reason: "Kontrol",
      }),
    ).rejects.toMatchObject({
      response: { i18nKey: "server.identity.correctionNoChange" },
    });
    expect(audit.createRequiredAuditLog).not.toHaveBeenCalled();
  });
});

describe("AdminCorrectLegalIdentityDto", () => {
  const invalidOf = async (payload: Record<string, unknown>) =>
    (
      await validate(plainToInstance(AdminCorrectLegalIdentityDto, payload))
    ).map((e) => e.property);

  it("gerekçe zorunludur", async () => {
    expect(await invalidOf({ legalLastName: "Yılmaz" })).toEqual(["reason"]);
    expect(await invalidOf({ legalLastName: "Yılmaz", reason: "   " })).toEqual(
      ["reason"],
    );
  });

  it("üye formuyla aynı doğrulama uygulanır", async () => {
    expect(
      await invalidOf({ nationalId: "12345678951", reason: "Düzeltme" }),
    ).toEqual(["nationalId"]);
    expect(
      await invalidOf({ legalFirstName: "Ay$e", reason: "Düzeltme" }),
    ).toEqual(["legalFirstName"]);
  });

  it("boş bırakılan alan 'değiştirme' demektir, hata değildir", async () => {
    expect(
      await invalidOf({
        legalFirstName: "",
        nationalId: " ",
        legalLastName: "Yılmaz",
        reason: "Düzeltme",
      }),
    ).toEqual([]);
  });
});

describe("AdminLegalIdentityController", () => {
  it("moderatör düzeltemez: yalnız super_admin ve admin", () => {
    const roles = Reflect.getMetadata(
      "roles",
      AdminLegalIdentityController.prototype.correct,
    );
    expect(roles).toEqual(["super_admin", "admin"]);
  });
});
