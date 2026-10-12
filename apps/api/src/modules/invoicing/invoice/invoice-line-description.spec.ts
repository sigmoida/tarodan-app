import {
  invoiceDescriptionOf,
  invoiceTypesMatchingDescription,
  LINE_DESCRIPTION,
} from "./invoice-line-description";

/**
 * Açıklama, belgenin ÜSTÜNDE yazan metindir; kesim anında snapshot'lanır.
 * Snapshot varsa o kazanır — tipin varsayılan metni sonradan değişse bile
 * kesilmiş belgenin yazısı değişmemeli.
 */
describe("invoiceDescriptionOf", () => {
  it("snapshot varsa onu döner", () => {
    expect(invoiceDescriptionOf("boost", "Vitrin paketi (7 gün)")).toBe(
      "Vitrin paketi (7 gün)",
    );
  });

  it("snapshot boşsa tipin varsayılan metnine düşer", () => {
    expect(invoiceDescriptionOf("seller_commission", null)).toBe(
      LINE_DESCRIPTION.seller_commission,
    );
    expect(invoiceDescriptionOf("seller_commission", "   ")).toBe(
      LINE_DESCRIPTION.seller_commission,
    );
  });

  it("bilinmeyen tipte bile boş metin göstermez", () => {
    expect(invoiceDescriptionOf("bilinmeyen_tip", null)).toBe("Fatura");
  });
});

describe("invoiceTypesMatchingDescription", () => {
  it("açıklama araması snapshot'sız belgeleri de bulsun diye eşleşen tipleri döner", () => {
    const types = invoiceTypesMatchingDescription("komisyon");
    expect(types).toEqual(
      expect.arrayContaining([
        "commission",
        "buyer_commission",
        "seller_commission",
        "trade_commission",
      ]),
    );
  });

  it("Türkçe büyük/küçük harfi doğru katlar (İ/ı tuzağı)", () => {
    expect(invoiceTypesMatchingDescription("KARGO")).toEqual(
      expect.arrayContaining(["buyer_shipping", "seller_shipping"]),
    );
  });

  it("boş arama hiçbir tipi eşleştirmez — aksi halde filtre her şeyi getirirdi", () => {
    expect(invoiceTypesMatchingDescription("   ")).toEqual([]);
  });
});
