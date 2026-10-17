import { Prisma } from "@prisma/client";
import {
  buildLegalIdentityStatus,
  isNationalIdUniqueViolation,
  legalIdentityAuditSummary,
  legalIdentityIncompleteWhere,
  planAdminCorrection,
  planMemberSubmission,
  type LegalIdentitySubject,
} from "./legal-identity-status";

const member = (
  over: Partial<LegalIdentitySubject> = {},
): LegalIdentitySubject => ({
  legalFirstName: null,
  legalLastName: null,
  nationalId: null,
  isTestAccount: false,
  adminUser: null,
  ...over,
});

/** Atılan istisnayı döndürür; atılmazsa testi düşürür. */
const thrown = (fn: () => unknown): unknown => {
  try {
    fn();
  } catch (error) {
    return error;
  }
  throw new Error("expected an exception");
};

const complete = {
  legalFirstName: "Ayşe",
  legalLastName: "Yılmaz",
  nationalId: "10000000146",
};

describe("buildLegalIdentityStatus — kimlik kapısının tek kuralı", () => {
  it("hiç kimlik girmemiş üye (eski hesap) üç alanı da eksik görür", () => {
    expect(buildLegalIdentityStatus(member())).toMatchObject({
      required: true,
      missing: ["legalFirstName", "legalLastName", "nationalId"],
    });
  });

  it("Google/Apple ile açılan hesap da kapıya düşer (sosyal girişte alan yok)", () => {
    // Sosyal kayıt yalnız e-posta + görünen ad getirir; yasal alanlar boştur.
    const social = member();
    expect(buildLegalIdentityStatus(social).missing).toHaveLength(3);
  });

  it("kayıtta ad-soyad verip TCKN vermeyen üye yalnız TCKN'yi eksik görür", () => {
    expect(
      buildLegalIdentityStatus(
        member({ legalFirstName: "Ayşe", legalLastName: "Yılmaz" }),
      ).missing,
    ).toEqual(["nationalId"]);
  });

  it("tam kimlikte kapı kapalıdır ve TCKN yalnız maskeli döner", () => {
    const status = buildLegalIdentityStatus(member(complete));
    expect(status.missing).toEqual([]);
    expect(status.nationalIdMasked).toBe("•••••••••46");
    expect(JSON.stringify(status)).not.toContain("10000000146");
  });

  it("personel hesabı muaftır: hiç sorulmaz", () => {
    expect(
      buildLegalIdentityStatus(member({ adminUser: { id: "admin-1" } })),
    ).toMatchObject({ required: false, missing: [] });
  });

  it("test şeridi hesabı muaftır: hiç sorulmaz", () => {
    expect(
      buildLegalIdentityStatus(member({ isTestAccount: true })),
    ).toMatchObject({ required: false, missing: [] });
  });

  it("ön doldurma: üyenin banka hesabındaki GEÇERLİ TCKN, yalnız numara eksikken", () => {
    expect(
      buildLegalIdentityStatus(member(), "100 000 001 46").suggestedNationalId,
    ).toBe("10000000146");
    // Checksum'ı tutmayan eski numara önerilmez.
    expect(
      buildLegalIdentityStatus(member(), "12345678951").suggestedNationalId,
    ).toBeNull();
    // Numara zaten varsa öneri yok.
    expect(
      buildLegalIdentityStatus(member(complete), "12345678950")
        .suggestedNationalId,
    ).toBeNull();
  });

  it("ad için ön doldurma YOK (görünen ad takma ad olabilir)", () => {
    const status = buildLegalIdentityStatus(member(), "10000000146");
    expect(status.legalFirstName).toBeNull();
    expect(status.legalLastName).toBeNull();
  });
});

describe("legalIdentityIncompleteWhere — admin filtresi kapı kuralıyla aynı", () => {
  it("muaf olmayan ve üç alandan biri boş hesabı seçer", () => {
    expect(legalIdentityIncompleteWhere()).toEqual({
      isTestAccount: false,
      adminUser: null,
      OR: [
        { legalFirstName: null },
        { legalLastName: null },
        { nationalId: null },
      ],
    });
  });
});

describe("planMemberSubmission — üye dolu alanı değiştiremez", () => {
  const empty = { legalFirstName: null, legalLastName: null, nationalId: null };

  it("eksik alanları normalize ederek doldurur", () => {
    const change = planMemberSubmission(empty, {
      legalFirstName: " Ayşe  Nur ",
      legalLastName: "Yılmaz",
      nationalId: "100-000-001-46",
    });
    expect(change.data).toEqual({
      legalFirstName: "Ayşe Nur",
      legalLastName: "Yılmaz",
      nationalId: "10000000146",
    });
  });

  it("kayıtlı bir alanı DEĞİŞTİRMEK isteyen gönderimi reddeder", () => {
    expect(
      thrown(() =>
        planMemberSubmission(complete, { nationalId: "12345678950" }),
      ),
    ).toMatchObject({
      status: 409,
      response: { i18nKey: "server.identity.locked" },
    });
    expect(
      thrown(() => planMemberSubmission(complete, { legalLastName: "Demir" })),
    ).toMatchObject({ response: { i18nKey: "server.identity.locked" } });
  });

  it("kayıtlı değeri AYNEN yeniden göndermek zararsızdır (yazılacak bir şey yok)", () => {
    const change = planMemberSubmission(complete, { ...complete });
    expect(change.changed).toEqual([]);
  });

  it("sonuçta bir alan boş kalacaksa reddeder", () => {
    expect(
      thrown(() => planMemberSubmission(empty, { legalFirstName: "Ayşe" })),
    ).toMatchObject({ response: { i18nKey: "server.identity.incomplete" } });
  });
});

describe("planAdminCorrection — admin dolu alanı düzeltebilir", () => {
  it("yalnız değişen alanları yazar", () => {
    const change = planAdminCorrection(complete, {
      legalLastName: "Yılmaz",
      nationalId: "12345678950",
    });
    expect(change.changed).toEqual(["nationalId"]);
    expect(change.data).toEqual({ nationalId: "12345678950" });
  });

  it("hiçbir şey değişmiyorsa reddeder (boş denetim kaydı yazılmaz)", () => {
    expect(
      thrown(() => planAdminCorrection(complete, { legalFirstName: "Ayşe" })),
    ).toMatchObject({
      response: { i18nKey: "server.identity.correctionNoChange" },
    });
  });

  it("denetim özeti TCKN'yi ve adları DEĞER olarak taşımaz", () => {
    const change = planAdminCorrection(complete, {
      legalLastName: "Demir",
      nationalId: "12345678950",
    });
    const summary = legalIdentityAuditSummary(change);
    expect(summary).toEqual({
      changedFields: ["legalLastName", "nationalId"],
      nationalIdMaskedBefore: "•••••••••46",
      nationalIdMaskedAfter: "•••••••••50",
    });
    const text = JSON.stringify(summary);
    expect(text).not.toContain("10000000146");
    expect(text).not.toContain("12345678950");
    expect(text).not.toContain("Demir");
  });
});

describe("isNationalIdUniqueViolation", () => {
  const p2002 = (target: unknown) =>
    new Prisma.PrismaClientKnownRequestError("unique", {
      code: "P2002",
      clientVersion: "test",
      meta: { target },
    });

  it("yalnız national_id tekilliğini tanır", () => {
    expect(isNationalIdUniqueViolation(p2002(["national_id"]))).toBe(true);
    expect(isNationalIdUniqueViolation(p2002("users_national_id_key"))).toBe(
      true,
    );
    expect(isNationalIdUniqueViolation(p2002(["email"]))).toBe(false);
    expect(isNationalIdUniqueViolation(new Error("x"))).toBe(false);
  });
});
