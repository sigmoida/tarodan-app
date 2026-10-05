import { IsOptional, IsString, validate } from "class-validator";
import { plainToInstance } from "class-transformer";
import {
  isValidLegalName,
  isValidTckn,
  maskTckn,
  missingLegalIdentityFields,
  normalizeLegalName,
  normalizeTckn,
} from "@tarodan/types";
import {
  IsLegalName,
  IsTckn,
  NormalizeLegalName,
  NormalizeTckn,
} from "./legal-identity";

/**
 * TCKN ve yasal ad kuralı TEK kaynaktan (`@tarodan/types`) gelir; API
 * dekoratörleri, web kayıt formu, kimlik kapısı ve admin düzeltme formu aynı
 * fonksiyonu çağırır. Bu spec kuralı sabitler.
 */
describe("isValidTckn", () => {
  it("standart algoritmayı geçen numaraları kabul eder", () => {
    expect(isValidTckn("10000000146")).toBe(true);
    expect(isValidTckn("12345678950")).toBe(true);
    // 99 ile başlayan (yabancı kimlik no) numara özel muamele görmez: algoritma
    // geçiyorsa kabul.
    expect(isValidTckn("99999999068")).toBe(true);
  });

  it("10. hane formülünde negatif ara değeri doğru çözer", () => {
    // (1·7) − (9+9+9+9) = −29 → mod 10 = 1. JS `%` işareti korur; kural
    // bunu 0..9'a çekmezse geçerli numara reddedilirdi.
    expect(isValidTckn("19090909018")).toBe(true);
  });

  it("checksum'ı tutmayan numarayı reddeder", () => {
    expect(isValidTckn("12345678951")).toBe(false); // 11. hane
    expect(isValidTckn("12345678940")).toBe(false); // 10. hane
  });

  it("0 ile başlayan numarayı reddeder", () => {
    // 0 + algoritmaya uyan son haneler — yine de geçersiz.
    expect(isValidTckn("01234567890")).toBe(false);
  });

  it("11 haneden kısa ya da uzun değeri reddeder", () => {
    expect(isValidTckn("1000000014")).toBe(false);
    expect(isValidTckn("100000001460")).toBe(false);
    expect(isValidTckn("")).toBe(false);
    expect(isValidTckn(null)).toBe(false);
    expect(isValidTckn(undefined)).toBe(false);
  });

  it("biçimli girdiyi rakamlara indirip doğrular", () => {
    expect(isValidTckn("100 000 001 46")).toBe(true);
    expect(isValidTckn("123-456-789-50")).toBe(true);
    expect(normalizeTckn(" 123.456.789 50 ")).toBe("12345678950");
  });
});

describe("maskTckn", () => {
  it("yalnız son iki haneyi gösterir, uzunluğu sabittir", () => {
    expect(maskTckn("12345678950")).toBe("•••••••••50");
    expect(maskTckn(null)).toBeNull();
    expect(maskTckn("")).toBeNull();
  });
});

describe("isValidLegalName", () => {
  it("Türkçe harfleri, birleşik ve kesme işaretli adları kabul eder", () => {
    expect(isValidLegalName("Ayşe Nur")).toBe(true);
    expect(isValidLegalName("Çağrı")).toBe(true);
    expect(isValidLegalName("İlknur")).toBe(true);
    expect(isValidLegalName("Öz-Demir")).toBe(true);
    expect(isValidLegalName("D'Angelo")).toBe(true);
  });

  it("rakam, simge, tek harf ve aşırı uzun adı reddeder", () => {
    expect(isValidLegalName("Ahmet1")).toBe(false);
    expect(isValidLegalName("Ahmet!")).toBe(false);
    expect(isValidLegalName("A")).toBe(false);
    expect(isValidLegalName("a".repeat(51))).toBe(false);
    expect(isValidLegalName("   ")).toBe(false);
    expect(isValidLegalName("Ayşe  -Nur")).toBe(false);
  });

  it("boşlukları kırpar ve tekilleştirir, harf büyüklüğüne dokunmaz", () => {
    expect(normalizeLegalName("  ayşe   nur ")).toBe("ayşe nur");
  });
});

describe("missingLegalIdentityFields", () => {
  it("boş ya da yalnız boşluk olan alanları eksik sayar", () => {
    expect(
      missingLegalIdentityFields({
        legalFirstName: "Ayşe",
        legalLastName: " ",
        nationalId: null,
      }),
    ).toEqual(["legalLastName", "nationalId"]);
    expect(
      missingLegalIdentityFields({
        legalFirstName: "Ayşe",
        legalLastName: "Yılmaz",
        nationalId: "12345678950",
      }),
    ).toEqual([]);
  });
});

describe("IsTckn / IsLegalName dekoratörleri", () => {
  class Probe {
    @IsOptional()
    @IsString()
    @NormalizeTckn()
    @IsTckn()
    nationalId?: string;

    @IsOptional()
    @IsString()
    @NormalizeLegalName()
    @IsLegalName()
    legalFirstName?: string;
  }

  const run = async (payload: Record<string, unknown>) => {
    const dto = plainToInstance(Probe, payload);
    const errors = await validate(dto);
    return { dto, invalid: errors.map((e) => e.property) };
  };

  it("biçimli TCKN'yi normalize edip kabul eder", async () => {
    const { dto, invalid } = await run({ nationalId: "123 456 789 50" });
    expect(invalid).toEqual([]);
    expect(dto.nationalId).toBe("12345678950");
  });

  it("checksum'ı tutmayan TCKN'yi reddeder", async () => {
    const { invalid } = await run({ nationalId: "12345678951" });
    expect(invalid).toEqual(["nationalId"]);
  });

  it("adı normalize eder, geçersiz adı reddeder", async () => {
    const ok = await run({ legalFirstName: "  Ayşe   Nur " });
    expect(ok.invalid).toEqual([]);
    expect(ok.dto.legalFirstName).toBe("Ayşe Nur");

    const bad = await run({ legalFirstName: "Ayşe1" });
    expect(bad.invalid).toEqual(["legalFirstName"]);
  });

  it("alan gönderilmezse doğrulama çalışmaz (opsiyonel)", async () => {
    expect((await run({})).invalid).toEqual([]);
  });

  it("boş ya da yalnız boşluk metin 'gönderilmedi' sayılır (dolu alanı silemez)", async () => {
    const { dto, invalid } = await run({
      nationalId: "  ",
      legalFirstName: "",
    });
    expect(invalid).toEqual([]);
    expect(dto.nationalId).toBeUndefined();
    expect(dto.legalFirstName).toBeUndefined();
  });

  it("null da 'gönderilmedi' sayılır (servise boş metin sızmaz)", async () => {
    const { dto, invalid } = await run({
      nationalId: null,
      legalFirstName: null,
    });
    expect(invalid).toEqual([]);
    expect(dto.nationalId).toBeUndefined();
    expect(dto.legalFirstName).toBeUndefined();
  });
});
