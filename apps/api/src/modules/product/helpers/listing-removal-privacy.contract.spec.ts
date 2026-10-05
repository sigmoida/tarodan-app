import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { apiAppRoot } from "../../../common/helpers/app-root";

/**
 * GİZLİLİK KONTRATI: satıcının kaldırma notu (`ProductRemovalEvent.detail`)
 * YALNIZ yöneticilere görünür; vitrin ilanın neden kalktığına dair hiçbir şey
 * göstermez.
 *
 * Serbest metin `Product` satırında hiç durmaz — yalnız olay tablosundadır.
 * Bu yüzden kontrat, olay tablosunu (`productRemovalEvent` delegesi ya da
 * `removalEvents` ilişkisi) OKUYAN kodun yalnız admin uçları olmasını şart
 * koşar. Yazan tek yer kayıt fonksiyonudur; dashboard kırılımı yalnız grup
 * sayıları okur (serbest metin seçmez). Yeni bir okuyucu eklemek bu listeyi
 * BİLİNÇLİ olarak değiştirmeyi gerektirir.
 *
 * Kontrat ağacı özyinelemeli tarar (bkz. apps/api/CLAUDE.md §1): klasör
 * taşınsa da kapsam düşmez.
 */
describe("listing removal — serbest metin yalnız admin uçlarında", () => {
  const srcRoot = join(apiAppRoot(), "src");

  const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) return walk(path);
      return path.endsWith(".ts") && !path.endsWith(".spec.ts") ? [path] : [];
    });

  /** Olay tablosuna dokunmasına izin verilen kaynaklar (src'ye göre). */
  const ALLOWED = new Set([
    // Tek yazıcı.
    "modules/product/helpers/listing-removal.ts",
    // Admin ürün listesi/detayı/dışa aktarımı (liste seçimi serbest metin içermez).
    "modules/admin/catalog/admin-product.service.ts",
    "modules/admin/catalog/admin-product-removal.helper.ts",
    // Dashboard dönem kırılımı: yalnız groupBy sayıları.
    "modules/admin/analytics/dashboard/admin-dashboard-removals.service.ts",
  ]);

  const readers = walk(srcRoot)
    .filter((file) =>
      /\bproductRemovalEvent\b|\bremovalEvents\b/.test(
        readFileSync(file, "utf8"),
      ),
    )
    .map((file) => relative(srcRoot, file).split("\\").join("/"));

  it("olay tablosunu yalnız izinli (admin/yazıcı) kaynaklar okur", () => {
    expect(readers.filter((file) => !ALLOWED.has(file))).toEqual([]);
  });

  it("izin listesindeki her kaynak gerçekten var (bayat giriş kalmasın)", () => {
    for (const file of ALLOWED) {
      expect(readers).toContain(file);
    }
  });

  it("admin dışı tek yazıcı serbest metni yazar ama OKUMAZ (geçmiş okuması yalnız açık select ile, metinsiz)", () => {
    const writer = readFileSync(
      join(srcRoot, "modules/product/helpers/listing-removal.ts"),
      "utf8",
    );
    // Geç "başka platformda satıldı" bayrağı için geçmiş okunur; bu okuma
    // yalnız neden ve vitrin bayrağını seçer, serbest metni asla.
    const reads = writer.match(
      /productRemovalEvent\.find\w+\(\{[\s\S]*?\}\);/g,
    );
    expect(reads).toHaveLength(1);
    expect(reads?.[0]).toMatch(
      /select:\s*\{\s*reason:\s*true,\s*fromStorefront:\s*true\s*\}/,
    );
    expect(writer).not.toMatch(/detail\s*:\s*true/);
    expect(writer).not.toMatch(/removalEvents\s*:/);
  });

  it("vitrin/satıcı ilan yanıtı (formatProductResponse) kaldırma alanı taşımaz", () => {
    const formatter = readFileSync(
      join(srcRoot, "modules/product/product-common.service.ts"),
      "utf8",
    );
    expect(formatter).not.toMatch(/removalReason|removalEvents|removalDetail/);
  });

  it("dashboard kırılımı serbest metni seçmez", () => {
    const dashboard = readFileSync(
      join(
        srcRoot,
        "modules/admin/analytics/dashboard/admin-dashboard-removals.service.ts",
      ),
      "utf8",
    );
    expect(dashboard).not.toMatch(/detail\s*:\s*true/);
  });
});
