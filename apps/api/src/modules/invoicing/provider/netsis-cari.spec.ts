import { NETSIS_VKN_LENGTH, isNetsisCorporateTaxId } from "./netsis-cari";

describe("netsis-cari", () => {
  it("10 haneli VKN kurumsal (kendi carisi)", () => {
    expect(NETSIS_VKN_LENGTH).toBe(10);
    expect(isNetsisCorporateTaxId("1234567890")).toBe(true);
    // Biçimlendirme karakterleri sayılmaz.
    expect(isNetsisCorporateTaxId(" 123-456-7890 ")).toBe(true);
  });

  it("TCKN, boş ve eksik değer ortak perakende cariye düşer", () => {
    expect(isNetsisCorporateTaxId("12345678901")).toBe(false);
    expect(isNetsisCorporateTaxId("")).toBe(false);
    expect(isNetsisCorporateTaxId(null)).toBe(false);
    expect(isNetsisCorporateTaxId(undefined)).toBe(false);
  });
});
