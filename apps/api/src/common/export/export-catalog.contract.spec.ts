import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { getMessages, locales } from "@tarodan/i18n";
import {
  EXPORT_CATALOGS,
  EXPORT_COLUMN_TYPES,
  type ExportCatalog,
} from "@tarodan/types";

import { lookupNode } from "../../modules/i18n/translate";
import { apiAppRoot } from "../helpers/app-root";

/**
 * Admin dökümlerinin sözleşmesi (docs/ADMIN_EXPORTS.md):
 *
 * 1. Her katalog kolonunun başlığı i18n kataloğunda VARDIR (tr + en). Eksik
 *    anahtar dosyada ham anahtar olarak görünürdü — sessiz bir bozulma.
 * 2. Ortak yazıcının ve hattın kullandığı `server.export.*` anahtarları vardır.
 * 3. Admin controller'larındaki her `/export` ucu dosyayı `sendExport` ile
 *    döner (başlıkların tek yazıldığı yer). Bir uç kendi CSV'sini ya da
 *    başlıklarını yeniden elle kurarsa bu spec kırılır.
 */

const SRC = join(apiAppRoot(), "src");
const ADMIN_DIR = join(SRC, "modules", "admin");

/**
 * Henüz hatta taşınmamış dökümler — BİLİNÇLİ ve yalnız küçülür. Finans
 * dökümleri Netsis yeniden adlandırmasını bekliyor (ayrı paket).
 */
const PENDING_EXPORT_ROUTES = ["settlement-report/export"];

function filesUnder(dir: string, suffix: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? filesUnder(join(dir, entry.name), suffix)
      : entry.name.endsWith(suffix)
        ? [join(dir, entry.name)]
        : [],
  );
}

const hasMessage = (locale: (typeof locales)[number], key: string) =>
  typeof lookupNode(
    getMessages(locale) as unknown as Record<string, unknown>,
    key,
  ) === "string";

describe("export catalogs", () => {
  const catalogs: Array<[string, ExportCatalog]> =
    Object.entries(EXPORT_CATALOGS);

  it("tarama kendini doğrular: kapsamdaki kaynakların hepsi tanımlı", () => {
    expect(Object.keys(EXPORT_CATALOGS).sort()).toEqual(
      [
        "cancellations",
        "consents",
        "deletedIdentities",
        "gibReport",
        "payoutHolds",
        "payoutTransfers",
        "refundRequests",
        "voucherCodes",
      ].sort(),
    );
  });

  it.each(catalogs)("%s: kaynak adı haritadaki anahtarla aynı", (name, c) => {
    expect(c.resource).toBe(name);
    expect(c.keys).toEqual(c.columns.map((column) => column.key));
    expect(new Set(c.keys).size).toBe(c.keys.length);
  });

  it.each(catalogs)("%s: her kolonun tipi bilinen bir tiptir", (_n, c) => {
    for (const column of c.columns) {
      expect(EXPORT_COLUMN_TYPES).toContain(column.type);
    }
  });

  it.each(catalogs)(
    "%s: her başlık anahtarı tr ve en kataloğunda var",
    (_name, c) => {
      const missing = c.columns.flatMap((column) =>
        locales
          .filter((locale) => !hasMessage(locale, column.labelKey))
          .map((locale) => `${locale}:${column.labelKey}`),
      );
      expect(missing).toEqual([]);
    },
  );
});

describe("export pipeline i18n", () => {
  it("hattın ve yazıcının kullandığı server.export.* anahtarları tr ve en'de var", () => {
    const sources = filesUnder(join(SRC, "common", "export"), ".ts")
      .filter((f) => !f.endsWith(".spec.ts"))
      .map((f) => readFileSync(f, "utf8"))
      .join("\n");
    const keys = [
      ...new Set(
        [...sources.matchAll(/"(server\.export\.[A-Za-z.]+)"/g)].map(
          (m) => m[1],
        ),
      ),
    ];

    expect(keys.length).toBeGreaterThan(5);
    const missing = keys.flatMap((key) =>
      locales
        .filter((locale) => !hasMessage(locale, key))
        .map((l) => `${l}:${key}`),
    );
    expect(missing).toEqual([]);
  });
});

describe("admin export endpoints", () => {
  const controllers = filesUnder(ADMIN_DIR, ".controller.ts").map((file) => ({
    file: relative(SRC, file),
    source: readFileSync(file, "utf8"),
  }));

  const routes = controllers.flatMap(({ file, source }) =>
    [...source.matchAll(/@Get\("([^"]*export[^"]*)"\)/g)].map((m) => ({
      file,
      route: m[1],
      source,
    })),
  );

  it("tarama kendini doğrular: dökümler bulundu", () => {
    // payouts (2), discounts, consents, deleted-identities, gib-report,
    // cancellations, analytics + bekleyen finans dökümü.
    expect(routes.length).toBeGreaterThanOrEqual(9);
  });

  it("silinen ürün dökümü geri gelmedi (tavansız, hiçbir düğme çağırmıyor)", () => {
    expect(routes.map((r) => r.route)).not.toContain("products-export");
  });

  it("bekleyen listesi yalnız gerçekten bekleyen uçları taşır (liste küçülür)", () => {
    for (const pending of PENDING_EXPORT_ROUTES) {
      expect(routes.map((r) => r.route)).toContain(pending);
    }
  });

  it("her /export ucu dosyayı ortak yanıtla (sendExport) döner", () => {
    const offenders = controllers.flatMap(({ file, source }) => {
      const exportRoutes = [
        ...source.matchAll(/@Get\("([^"]*export[^"]*)"\)/g),
      ].filter((m) => !PENDING_EXPORT_ROUTES.includes(m[1]));
      if (exportRoutes.length === 0) return [];
      const calls = source.match(/\bsendExport\(/g)?.length ?? 0;
      return calls === exportRoutes.length
        ? []
        : [`${file}: ${exportRoutes.length} export route, ${calls} sendExport`];
    });
    expect(offenders).toEqual([]);
  });

  it("taşınan uçlar başlıkları ya da gövdeyi elle yazmaz", () => {
    const offenders = controllers
      .filter(({ source }) => /\bsendExport\(/.test(source))
      .filter(
        ({ source }) =>
          /setHeader\(\s*"Content-(Type|Disposition)"/.test(source) ||
          /text\/csv/.test(source),
      )
      .map(({ file }) => file);
    expect(offenders).toEqual([]);
  });
});
