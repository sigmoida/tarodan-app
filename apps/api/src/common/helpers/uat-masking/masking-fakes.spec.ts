import {
  TR_PHONE_E164,
  isValidLegalName,
  isValidTckn,
  isValidTrPhone,
} from "@tarodan/types";
import { isValidTrIban } from "../../validators/tr-iban";
import { USERNAME_PATTERN } from "../../../modules/auth/utils/username.util";
import {
  UAT_MASK_EMAIL_DOMAIN,
  fakeBirthDate,
  fakeCompanyName,
  fakeEmail,
  fakeFileName,
  fakeFirstName,
  fakeFullName,
  fakeIban,
  fakeLastName,
  fakePhone,
  fakeStreet,
  fakeTaxId,
  fakeTckn,
  fakeToken,
  fakeUsername,
  fakeVkn,
} from "./masking-fakes";

/**
 * Sahte değerler: aynı anahtar → aynı değer (yenilemeden yenilemeye aynı kişi),
 * biçimler uygulamanın kendi doğrulayıcılarından geçer, e-posta hiçbir gerçek
 * kutuya gidemez.
 */
const KEYS = Array.from(
  { length: 500 },
  (_, i) => `0b6f${String(i).padStart(4, "0")}-1c2d-4e5f-8a9b-${i}`,
);

describe("UAT masking fakes", () => {
  it("are deterministic per key and differ across keys", () => {
    const key = KEYS[0];
    for (const make of [
      fakeEmail,
      fakePhone,
      fakeTckn,
      fakeVkn,
      fakeIban,
      fakeFullName,
      fakeStreet,
      fakeCompanyName,
      fakeUsername,
      fakeBirthDate,
      fakeToken,
    ]) {
      expect(make(key)).toBe(make(key));
    }
    expect(fakeEmail(KEYS[0])).not.toBe(fakeEmail(KEYS[1]));
    expect(fakeTckn(KEYS[0])).not.toBe(fakeTckn(KEYS[1]));
  });

  it("emails use the non-deliverable .invalid domain", () => {
    for (const key of KEYS) {
      expect(fakeEmail(key)).toMatch(
        new RegExp(`^u[0-9a-f]{12}@${UAT_MASK_EMAIL_DOMAIN.replace(".", "\\.")}$`),
      );
    }
    expect(UAT_MASK_EMAIL_DOMAIN.endsWith(".invalid")).toBe(true);
  });

  it("phones are stored-form Turkish mobiles on the unassigned 500 prefix", () => {
    for (const key of KEYS) {
      const phone = fakePhone(key);
      expect(isValidTrPhone(phone)).toBe(true);
      expect(phone).toMatch(TR_PHONE_E164);
      expect(phone.startsWith("+90500")).toBe(true);
    }
  });

  it("TCKNs pass the national-id checksum", () => {
    for (const key of KEYS) expect(isValidTckn(fakeTckn(key))).toBe(true);
  });

  it("IBANs pass the TR mod-97 check", () => {
    for (const key of KEYS) expect(isValidTrIban(fakeIban(key))).toBe(true);
  });

  it("tax ids keep the person (11 digits) vs company (10 digits) shape", () => {
    expect(fakeTaxId(KEYS[0], "12345678901")).toHaveLength(11);
    expect(isValidTckn(fakeTaxId(KEYS[0], "123 456 789 01"))).toBe(true);
    expect(fakeTaxId(KEYS[0], "1234567890")).toMatch(/^[1-9]\d{9}$/);
    expect(fakeTaxId(KEYS[0], null)).toMatch(/^[1-9]\d{9}$/);
  });

  it("names are valid legal names and the full name is first + last of the same key", () => {
    for (const key of KEYS.slice(0, 50)) {
      expect(isValidLegalName(fakeFirstName(key))).toBe(true);
      expect(isValidLegalName(fakeLastName(key))).toBe(true);
      expect(fakeFullName(key)).toBe(`${fakeFirstName(key)} ${fakeLastName(key)}`);
    }
  });

  it("usernames satisfy the registration pattern", () => {
    for (const key of KEYS) expect(fakeUsername(key)).toMatch(USERNAME_PATTERN);
  });

  it("birth dates are adults between 1960 and 2000", () => {
    for (const key of KEYS) {
      const date = fakeBirthDate(key);
      expect(date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(date >= "1960-01-01" && date <= "2000-12-31").toBe(true);
    }
  });

  it("streets and companies say they are UAT data", () => {
    expect(fakeStreet(KEYS[0])).toMatch(/^UAT .+ Sokak No:\d+ D:\d+$/);
    expect(fakeCompanyName(KEYS[0])).toMatch(/^UAT Firma [0-9A-F]{8}$/);
  });

  it("file names drop the original name but keep the extension", () => {
    const masked = fakeFileName(KEYS[0], "ahmet_yilmaz_kimlik.PDF");
    expect(masked).toMatch(/^document-[0-9a-f]{8}\.pdf$/);
    expect(masked).not.toContain("ahmet");
    expect(fakeFileName(KEYS[0], "no-extension")).toMatch(/^document-[0-9a-f]{8}$/);
  });

  it("an attempt number yields a different value for collision handling", () => {
    expect(fakeEmail(KEYS[0], 1)).not.toBe(fakeEmail(KEYS[0]));
    expect(fakePhone(KEYS[0], 1)).not.toBe(fakePhone(KEYS[0]));
    expect(isValidTckn(fakeTckn(KEYS[0], 3))).toBe(true);
    expect(fakeUsername(KEYS[0], 2)).toMatch(USERNAME_PATTERN);
  });
});
