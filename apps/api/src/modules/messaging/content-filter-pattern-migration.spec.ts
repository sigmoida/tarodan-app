import { readFileSync } from "node:fs";
import { join } from "node:path";
import { apiAppRoot } from "../../common/helpers/app-root";
import {
  INSTAGRAM_HANDLE_PATTERN_SOURCE,
  WHATSAPP_PATTERN_SOURCE,
} from "../../common/helpers/contact-patterns";

/**
 * `20261013130000_content_filter_word_boundary_patterns`: seed.ts kalıbı
 * yalnız yeniden seed'de tazeliyordu; staging/prod satırları eski sınırsız
 * kalıpta kalmıştı. Göç yalnız eski seed değerini BİREBİR taşıyan satırları
 * günceller (yönetici düzenlemesine dokunmaz) ve kalıp kaynağıyla aynı kalır.
 */
describe("content filter word-boundary pattern migration", () => {
  const sql = readFileSync(
    join(
      apiAppRoot(),
      "prisma/migrations/20261013130000_content_filter_word_boundary_patterns/migration.sql",
    ),
    "utf8",
  );
  const statements = sql
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n");

  const updates = statements
    .split(";")
    .map((statement) => statement.trim())
    .filter(Boolean);

  const newPattern = (statement: string) =>
    statement.match(/SET "pattern" = \$new\$(.*)\$new\$/)?.[1];
  const oldPattern = (statement: string) =>
    statement.match(/"pattern" = \$old\$(.*)\$old\$/)?.[1];

  it("yalnız iki UPDATE içerir, şemaya dokunmaz", () => {
    expect(updates).toHaveLength(2);
    for (const statement of updates) {
      expect(statement.startsWith('UPDATE "content_filters"')).toBe(true);
    }
    expect(statements).not.toMatch(/ALTER|DROP|DELETE|INSERT|TRUNCATE/i);
  });

  it("yeni kalıplar ortak kaynakla birebir aynı", () => {
    expect(newPattern(updates[0])).toBe(WHATSAPP_PATTERN_SOURCE);
    expect(newPattern(updates[1])).toBe(INSTAGRAM_HANDLE_PATTERN_SOURCE);
  });

  it("yalnız seed satırı ve eski seed kalıbıyla birebir eşleşen satır güncellenir", () => {
    expect(updates[0]).toContain(`"id" = 'whatsapp-filter'`);
    expect(updates[1]).toContain(`"id" = 'instagram-filter'`);
    // Eski seed kalıpları (3e6923319 öncesi seed.ts).
    expect(oldPattern(updates[0])).toBe("(whatsapp|wp|wa)[\\s:]*[\\d+()-]+");
    expect(oldPattern(updates[1])).toBe(
      "(instagram|ig|insta)[:\\s@]+[a-zA-Z0-9_.]+",
    );
  });

  it("eski Instagram kalıbı Big Rig için yanlış pozitif verir, yenisi vermez (göçün gerekçesi)", () => {
    const oldInstagram = new RegExp(oldPattern(updates[1]) ?? "", "gi");
    const newInstagram = new RegExp(INSTAGRAM_HANDLE_PATTERN_SOURCE, "gi");
    expect(oldInstagram.test("Big Rig modeli")).toBe(true);
    expect(newInstagram.test("Big Rig modeli")).toBe(false);
  });
});
