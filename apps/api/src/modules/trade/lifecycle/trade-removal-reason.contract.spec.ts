import { readFileSync } from "node:fs";
import { join } from "node:path";
import { apiAppRoot } from "../../../common/helpers/app-root";

/**
 * Takasla stoğu biten ilanın kaldırma nedeni: takas Tarodan'da TAMAMLANDIYSA
 * "Tarodan'da takas edildi" (`traded`), tamamlanmadan stok düşen yollar
 * (kargoda kayıp, iade kolisi kayıp) "stok tükendi" (`out_of_stock`) kalır.
 * Çağrı yerleri kaynak metniyle sabitlenir: bir yeni takas-tamamlama yolu ya
 * da yanlış neden bu kontratı bilerek değiştirmeden geçemez.
 */
describe("takas kaldırma nedeni — çağrı yerleri", () => {
  const read = (relative: string) =>
    readFileSync(join(apiAppRoot(), "src", relative), "utf8");
  const count = (source: string, needle: string) =>
    source.split(needle).length - 1;

  it("TradeLifecycleService: iki tamamlama yolu da 'traded' yazar, 'out_of_stock' yazmaz", () => {
    const source = read("modules/trade/lifecycle/trade-lifecycle.service.ts");
    expect(count(source, "ListingRemovalReason.traded")).toBe(2);
    expect(count(source, "ListingRemovalReason.out_of_stock")).toBe(0);
  });

  it("TradeReconciliationService: oto-tamamlama 'traded', kargoda kayıp 'out_of_stock'", () => {
    const source = read(
      "modules/trade/lifecycle/trade-reconciliation.service.ts",
    );
    expect(count(source, "ListingRemovalReason.traded")).toBe(1);
    expect(count(source, "ListingRemovalReason.out_of_stock")).toBe(1);
  });

  it("iade kolisi kaybı (takas tamamlanmadı) 'out_of_stock' kalır", () => {
    const source = read("common/helpers/trade-return-finalize.ts");
    expect(count(source, "ListingRemovalReason.out_of_stock")).toBe(1);
    expect(count(source, "ListingRemovalReason.traded")).toBe(0);
  });
});
