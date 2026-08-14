/**
 * `tradeOnly` aramasının ES filtreleri.
 *
 * `sellerCanTrade` dokümana indeksleme anında denormalize edilir; deploy'dan
 * önce indekslenmiş dokümanlarda alan YOK. Düz bir `term` filtresi alanı
 * olmayan dokümanla hiç eşleşmez — reindex'e kadar takas araması boş dönerdi.
 * Bu yüzden alanı olmayan doküman GEÇER (eski davranış); reindex tamamlandıkça
 * filtre kendiliğinden sıkılaşır.
 */
export function tradeOnlyEsFilters(
  freeTierCanTrade: boolean,
): Array<Record<string, unknown>> {
  const filters: Array<Record<string, unknown>> = [
    { term: { isTradeEnabled: true } },
  ];
  if (!freeTierCanTrade) {
    filters.push({
      bool: {
        should: [
          { term: { sellerCanTrade: true } },
          { bool: { must_not: { exists: { field: "sellerCanTrade" } } } },
        ],
        minimum_should_match: 1,
      },
    });
  }
  return filters;
}
