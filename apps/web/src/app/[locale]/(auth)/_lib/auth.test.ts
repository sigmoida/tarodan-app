import { describe, expect, it } from "vitest";
import { registerSchema, registrationConsentDocuments } from "./auth";

const validValues = {
  displayName: "Kaan",
  username: "kaan",
  email: "kaan@example.com",
  phone: "",
  birthDate: "1990-01-15",
  password: "Secret123",
  confirmPassword: "Secret123",
  agreeTerms: true,
  agreeKvkk: true,
  acceptsMarketingEmails: false,
};

describe("registrationConsentDocuments", () => {
  it("şartlar kutusu terms + privacy, KVKK kutusu ayrı kvkk belgesi üretir", () => {
    expect(
      registrationConsentDocuments({ agreeTerms: true, agreeKvkk: true }),
    ).toEqual(["terms", "privacy", "kvkk"]);
  });

  it("işaretlenmeyen kutunun belgesi gönderilmez", () => {
    expect(
      registrationConsentDocuments({ agreeTerms: true, agreeKvkk: false }),
    ).toEqual(["terms", "privacy"]);
  });
});

describe("registerSchema — KVKK onayı", () => {
  it("KVKK kutusu işaretlenmeden kayıt formu geçmez", () => {
    const result = registerSchema("tr").safeParse({
      ...validValues,
      agreeKvkk: false,
    });

    expect(result.success).toBe(false);
    expect(
      result.error?.issues.some((issue) => issue.path[0] === "agreeKvkk"),
    ).toBe(true);
  });

  it("iki zorunlu kutu da işaretliyse geçer", () => {
    expect(registerSchema("tr").safeParse(validValues).success).toBe(true);
  });
});
