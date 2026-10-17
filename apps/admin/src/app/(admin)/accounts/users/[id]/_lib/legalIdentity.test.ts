import { describe, expect, it } from "vitest";
import {
  correctionPayload,
  legalIdentityCorrectionSchema,
} from "./legalIdentity";

// Şema mesajları burada önemsiz; anahtarın kendisi döner.
const t = ((key: string) => key) as unknown as Parameters<
  typeof legalIdentityCorrectionSchema
>[0];

const current = {
  legalFirstName: "Ayşe",
  legalLastName: "Yılmz",
  nationalId: "10000000146",
};

describe("legalIdentityCorrectionSchema", () => {
  it("gerekçe zorunludur", () => {
    const result = legalIdentityCorrectionSchema(t).safeParse({
      legalFirstName: "",
      legalLastName: "Yılmaz",
      nationalId: "",
      reason: "  ",
    });
    expect(result.success).toBe(false);
  });

  it("boş alan 'değiştirme' demektir; dolu alan üye kuralıyla doğrulanır", () => {
    const schema = legalIdentityCorrectionSchema(t);
    expect(
      schema.safeParse({
        legalFirstName: "",
        legalLastName: "",
        nationalId: "",
        reason: "Nüfus cüzdanı görüldü",
      }).success,
    ).toBe(true);
    expect(
      schema.safeParse({
        legalFirstName: "",
        legalLastName: "",
        nationalId: "12345678951",
        reason: "Nüfus cüzdanı görüldü",
      }).success,
    ).toBe(false);
  });
});

describe("correctionPayload", () => {
  it("yalnız değişen alanları normalize edip gönderir", () => {
    expect(
      correctionPayload(
        {
          legalFirstName: "Ayşe",
          legalLastName: " Yılmaz ",
          nationalId: "100 000 001 46",
          reason: " Soyad yazımı düzeltildi ",
        },
        current,
      ),
    ).toEqual({ legalLastName: "Yılmaz", reason: "Soyad yazımı düzeltildi" });
  });

  it("boş bırakılan alanı göndermez (silme yoktur)", () => {
    expect(
      correctionPayload(
        {
          legalFirstName: "",
          legalLastName: "",
          nationalId: "12345678950",
          reason: "Yanlış girilmiş",
        },
        current,
      ),
    ).toEqual({ nationalId: "12345678950", reason: "Yanlış girilmiş" });
  });
});
