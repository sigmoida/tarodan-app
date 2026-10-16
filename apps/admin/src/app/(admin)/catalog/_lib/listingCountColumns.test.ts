import { describe, expect, it } from "vitest";
import { listingCountColumns, type ListingCounts } from "./listingCountColumns";

type Row = ListingCounts & { id: string };

const t = ((key: string) => key) as Parameters<typeof listingCountColumns>[0];

describe("listingCountColumns", () => {
  const columns = listingCountColumns<Row>(t);

  it("aktif ve toplam ilan kolonlarını i18n başlıklarıyla döndürür", () => {
    expect(columns.map((c) => c.id)).toEqual([
      "admin.catalog.common.activeListingCount",
      "admin.catalog.common.listingCount",
    ]);
  });

  it("iki kolon da API'nin tanıdığı anahtarla sayısal sıralanır", () => {
    expect(
      columns.map((c) => [c.meta?.sortKey, c.meta?.sortType, c.meta?.sortable]),
    ).toEqual([
      ["activeListingCount", "number", true],
      ["listingCount", "number", true],
    ]);
  });
});
