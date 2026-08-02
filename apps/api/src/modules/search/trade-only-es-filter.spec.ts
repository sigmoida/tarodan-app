import { tradeOnlyEsFilters } from "./trade-only-es-filter";

/**
 * `sellerCanTrade` alanı dokümana İNDEKSLEME anında yazılır; bu deploy'dan
 * önce indekslenmiş hiçbir dokümanda alan yok. Düz `term: {sellerCanTrade:
 * true}` filtresi alanı olmayan dokümanla hiç eşleşmediği için, reindex
 * çalıştırılana kadar takas araması ES yolunda SIFIR sonuç dönerdi.
 *
 * Kural: alan VARSA true olmalı; alan YOKSA doküman geçer (eski davranış) —
 * reindex tamamlandıkça filtre kendiliğinden sıkılaşır.
 */
describe("tradeOnlyEsFilters", () => {
  it("bayrak + (yetki true VEYA alan hiç yok) şartını üretir", () => {
    const filters = tradeOnlyEsFilters(false);
    expect(filters[0]).toEqual({ term: { isTradeEnabled: true } });
    expect(filters[1]).toEqual({
      bool: {
        should: [
          { term: { sellerCanTrade: true } },
          { bool: { must_not: { exists: { field: "sellerCanTrade" } } } },
        ],
        minimum_should_match: 1,
      },
    });
  });

  it("ücretsiz katmanda takas açıksa yalnız bayrak aranır (herkes yetkili)", () => {
    expect(tradeOnlyEsFilters(true)).toEqual([
      { term: { isTradeEnabled: true } },
    ]);
  });
});
