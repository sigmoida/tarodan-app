import { describe, expect, it } from "vitest";
import {
  legalIdentityGateSchema,
  legalIdentitySubmission,
} from "./legalIdentity";

const messages = { nameInvalid: "name", nationalIdInvalid: "tckn" };

describe("legalIdentityGateSchema", () => {
  it("yalnız eksik alanları zorunlu tutar", () => {
    const schema = legalIdentityGateSchema(["nationalId"], messages);

    // Ad alanları dolu ve salt-okunur; boş gelmeleri hata değildir.
    expect(
      schema.safeParse({
        legalFirstName: "",
        legalLastName: "",
        nationalId: "10000000146",
      }).success,
    ).toBe(true);
  });

  it("eksik TCKN checksum'la, eksik ad harf kuralıyla doğrulanır", () => {
    const schema = legalIdentityGateSchema(
      ["legalFirstName", "legalLastName", "nationalId"],
      messages,
    );
    const result = schema.safeParse({
      legalFirstName: "Ayşe1",
      legalLastName: "Yılmaz",
      nationalId: "12345678951",
    });

    expect(result.success).toBe(false);
    const issues = result.success
      ? []
      : result.error.issues.map((i) => [i.path[0], i.message]);
    expect(issues).toEqual([
      ["legalFirstName", "name"],
      ["nationalId", "tckn"],
    ]);
  });

  it("biçimli TCKN girişi kabul edilir", () => {
    const schema = legalIdentityGateSchema(["nationalId"], messages);
    expect(
      schema.safeParse({
        legalFirstName: "",
        legalLastName: "",
        nationalId: "100 000 001 46",
      }).success,
    ).toBe(true);
  });
});

describe("legalIdentitySubmission", () => {
  it("yalnız eksik alanları normalize edip gönderir", () => {
    expect(
      legalIdentitySubmission(
        {
          legalFirstName: "Ayşe",
          legalLastName: "  Yılmaz  ",
          nationalId: "100-000-001-46",
        },
        ["legalLastName", "nationalId"],
      ),
    ).toEqual({ legalLastName: "Yılmaz", nationalId: "10000000146" });
  });
});
