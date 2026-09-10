import { describe, expect, it } from "vitest";
import { INVOICE_TAB_KEYS, normalizeInvoiceTab } from "./types";

/**
 * Sekme anahtarı sunucuya `scope` olarak gider ve orada kapalı bir listeye
 * karşı doğrulanır. `?tab=` ise serbest metindir: tanınmayan bir değer
 * geçerse istek 400 döner ve ekran boş kalır — ekranın sekmeleri yeniden
 * adlandırıldığı için bu, eski bir yer iminin gerçek sonucuydu.
 */
describe("normalizeInvoiceTab", () => {
  it("bilinen her sekmeyi olduğu gibi bırakır", () => {
    for (const key of INVOICE_TAB_KEYS) {
      expect(normalizeInvoiceTab(key)).toBe(key);
    }
  });

  it("eski yer imini (`elogo`) tüm faturalara düşürür", () => {
    expect(normalizeInvoiceTab("elogo")).toBe("all");
  });

  it("boş ve uydurma değerler de tüm faturalara düşer", () => {
    expect(normalizeInvoiceTab("")).toBe("all");
    expect(normalizeInvoiceTab("' OR 1=1")).toBe("all");
  });
});
