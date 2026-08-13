import { validate } from "class-validator";
import { plainToInstance } from "class-transformer";
import { isValidTrPhone } from "@tarodan/types";
import { SendPhoneCodeDto } from "../../modules/auth/dto/phone-verification.dto";
import { RegisterDto } from "../../modules/auth/dto/register.dto";

/**
 * Telefon doğrulaması SUNUCUDA da katı olmalı. Eskiden `SendPhoneCodeDto`
 * `^[+\d\s()-]{10,20}$` kullanıyordu: boşluklu/ters birleştirilmiş bir dize
 * ("530 066 58 41+90") DTO'dan geçiyor, hata ancak servis katmanındaki
 * `^\+905\d{9}$` kontrolünde "Geçersiz telefon numarası" olarak patlıyordu.
 * `RegisterDto`'da ise hiç format kontrolü yoktu — yabancı numarayla kayıt
 * olunabiliyor, ardından o kullanıcı numarasını ne değiştirebiliyor ne
 * doğrulayabiliyordu.
 */

const errorsFor = async (
  cls: new () => object,
  payload: Record<string, unknown>,
) => {
  const dto = plainToInstance(cls, payload) as object;
  const errors = await validate(dto, { whitelist: false });
  return errors.map((e) => e.property);
};

describe("isValidTrPhone", () => {
  it("accepts a stored-form Turkish mobile", () => {
    expect(isValidTrPhone("+905300665841")).toBe(true);
  });

  it("rejects landlines, foreign numbers and non-canonical spellings", () => {
    expect(isValidTrPhone("+903121234567")).toBe(false); // sabit hat
    expect(isValidTrPhone("+447700900123")).toBe(false); // yabancı
    expect(isValidTrPhone("05300665841")).toBe(false); // ulusal biçim
    expect(isValidTrPhone("+90 530 066 58 41")).toBe(false); // boşluklu
    expect(isValidTrPhone("")).toBe(false);
    expect(isValidTrPhone(null)).toBe(false);
    expect(isValidTrPhone(undefined)).toBe(false);
  });
});

describe("SendPhoneCodeDto", () => {
  it("accepts a canonical number", async () => {
    expect(
      await errorsFor(SendPhoneCodeDto, { phone: "+905300665841" }),
    ).toEqual([]);
  });

  it("rejects the swapped-argument string that used to slip through", async () => {
    expect(
      await errorsFor(SendPhoneCodeDto, { phone: "530 066 58 41+90" }),
    ).toEqual(["phone"]);
  });

  it("rejects foreign numbers and junk", async () => {
    expect(
      await errorsFor(SendPhoneCodeDto, { phone: "+447700900123" }),
    ).toEqual(["phone"]);
    expect(await errorsFor(SendPhoneCodeDto, { phone: "++++++++++" })).toEqual([
      "phone",
    ]);
  });
});

describe("RegisterDto phone", () => {
  const base = {
    displayName: "Ada Lovelace",
    username: "ada",
    email: "ada@example.com",
    password: "SecurePass123!",
  };

  it("stays optional — omitting it is still valid", async () => {
    expect(await errorsFor(RegisterDto, base)).not.toContain("phone");
  });

  it("rejects a foreign number instead of storing it unusably", async () => {
    expect(
      await errorsFor(RegisterDto, { ...base, phone: "+33612345678" }),
    ).toContain("phone");
  });

  it("accepts a canonical Turkish mobile", async () => {
    expect(
      await errorsFor(RegisterDto, { ...base, phone: "+905300665841" }),
    ).not.toContain("phone");
  });
});
