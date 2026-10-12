import {
  isConfigurationElogoFailure,
  isDuplicateNumberElogoFailure,
} from "./elogo-error-patterns";

/**
 * eLogo'nun Türkçe red metinleri adaptörün yanında sınıflanır; ortak deneme
 * politikası (`helpers/invoice-retry-policy.ts`) yalnız ağ kalıplarını bilir.
 */
describe("eLogo error patterns", () => {
  /**
   * Sentry TARODAN-API-13: "XSLT tasarım hatası … GetXsltDocument fail!" hesaba
   * özgü bir yapılandırma reddidir; 8 deneme × 30 dk boyunca sessizce denendi.
   */
  it("XSLT/tasarım reddi YAPILANDIRMA hatası sayılır, belge reddi sayılmaz", () => {
    expect(
      isConfigurationElogoFailure(
        "XSLT tasarım hatası. (id: 326502, uuid: B85241B4) (GetXsltDocument fail! Document not found.)",
      ),
    ).toBe(true);
    expect(isConfigurationElogoFailure("VKN gecersiz")).toBe(false);
    expect(isConfigurationElogoFailure(null)).toBe(false);
  });

  it("paylaşımlı hesaptaki numara çakışması NUMARA reddi sayılır", () => {
    expect(
      isDuplicateNumberElogoFailure("Aynı fatura numarası tekrar kullanılamaz"),
    ).toBe(true);
    expect(
      isDuplicateNumberElogoFailure(
        "TRD2026000000001 numaralı fatura daha önce gönderilmiş",
      ),
    ).toBe(true);
    expect(isDuplicateNumberElogoFailure("VKN gecersiz")).toBe(false);
    expect(isDuplicateNumberElogoFailure(undefined)).toBe(false);
  });
});
