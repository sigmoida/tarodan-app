import { readFileSync } from "node:fs";
import { join } from "node:path";
import { AdPopupFrequency, ContentPlatform } from "@prisma/client";
import {
  AD_POPUP_FREQUENCIES,
  AD_POPUP_FREQUENCY_DEFAULT,
  CONTENT_PLATFORMS,
} from "@tarodan/types";
import { apiAppRoot } from "../../../common/helpers/app-root";
import { adDeviceTypeFor } from "./ad-platform.helper";

/**
 * `20261016110000_ad_platform_popup`: reklama platform (web / app / all),
 * popup sıklığı ve popup sürümü gelir. Göç YALNIZ şemadır; eski
 * `device_type` değerlerinin taşınması ayrı, idempotent script'tir
 * (`maintenance/backfill-ad-platform.ts`, CLAUDE.md §13). Kolon silinmez
 * (eski mobil sürümler türetilmiş `deviceType` okur). `ContentPlatform` tipi
 * hero göçüyle ortaktır: hangisi önce çalışırsa kurar.
 */
describe("ad platform + popup migration", () => {
  const root = apiAppRoot();
  const sql = readFileSync(
    join(
      root,
      "prisma/migrations/20261016110000_ad_platform_popup/migration.sql",
    ),
    "utf8",
  );
  const schema = readFileSync(join(root, "prisma/schema.prisma"), "utf8");

  const enumValues = (name: string) =>
    (new RegExp(`enum ${name} \\{([\\s\\S]*?)\\}`).exec(schema)?.[1] ?? "")
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("///"));

  it("ContentPlatform tipini hero göçüyle çakışmadan kurar", () => {
    expect(sql).toContain(
      `DO $$ BEGIN CREATE TYPE "ContentPlatform" AS ENUM ('web', 'app', 'all'); EXCEPTION WHEN duplicate_object THEN null; END $$;`,
    );
  });

  it("popup sıklığı tipi iki değer taşır", () => {
    expect(sql).toContain(
      `CREATE TYPE "AdPopupFrequency" AS ENUM ('every_visit', 'until_dismissed')`,
    );
  });

  it("kolonlar şema varsayılanlarıyla eklenir", () => {
    expect(sql).toMatch(
      /ADD COLUMN "platform" "ContentPlatform" NOT NULL DEFAULT 'all'/,
    );
    expect(sql).toMatch(
      /ADD COLUMN "popup_frequency" "AdPopupFrequency" NOT NULL DEFAULT 'until_dismissed'/,
    );
    expect(sql).toMatch(/ADD COLUMN "popup_version" INTEGER NOT NULL DEFAULT 1/);
  });

  it("göç veri yazmaz: geri doldurma ayrı script'te", () => {
    expect(sql).not.toMatch(/^\s*UPDATE\b/im);
    expect(sql).not.toMatch(/^\s*INSERT\b/im);
    expect(sql).toContain("maintenance/backfill-ad-platform.ts");
  });

  describe("backfill script (maintenance/backfill-ad-platform.ts)", () => {
    const script = readFileSync(
      join(root, "maintenance/backfill-ad-platform.ts"),
      "utf8",
    );
    const update = /UPDATE "advertisements"[\s\S]*?`/.exec(script)?.[0] ?? "";

    it("desktop→web, mobile→app eşler", () => {
      expect(update).toMatch(/WHEN 'desktop' THEN 'web'::"ContentPlatform"/);
      expect(update).toMatch(/WHEN 'mobile' THEN 'app'::"ContentPlatform"/);
    });

    it("idempotent: yalnız göçten kalmış satırlar (platform all + eski cihaz)", () => {
      expect(update).toMatch(/WHERE "platform" = 'all'/);
      expect(update).toMatch(/AND "device_type" IN \('desktop', 'mobile'\)/);
    });

    it("updated_at'e dokunmaz, satır silmez; --dry-run destekler", () => {
      expect(update).not.toMatch(/updated_at/);
      expect(script).not.toMatch(/DELETE\s+FROM/i);
      expect(script).toContain('process.argv.includes("--dry-run")');
    });

    it("üretim komutu tanımlı ve seed derlemesine dahil", () => {
      const pkg = JSON.parse(
        readFileSync(join(root, "package.json"), "utf8"),
      ) as { scripts: Record<string, string> };
      expect(pkg.scripts["backfill:prod:ad-platform"]).toBe(
        "node dist-seed/maintenance/backfill-ad-platform.js",
      );
      const seedTsconfig = readFileSync(
        join(root, "tsconfig.seed.json"),
        "utf8",
      );
      expect(seedTsconfig).toContain('"maintenance/**/*.ts"');
    });
  });

  it("geri doldurma eşlemesi, API'nin türettiği deviceType'ın tersidir", () => {
    // Taşıma sonrası türetilen deviceType eski kolonla aynı kalmalı.
    expect(adDeviceTypeFor("web")).toBe("desktop");
    expect(adDeviceTypeFor("app")).toBe("mobile");
    expect(adDeviceTypeFor("all")).toBe("all");
  });

  it("satır silmez, device_type kolonunu düşürmez", () => {
    expect(sql).not.toMatch(/DELETE\s+FROM/i);
    expect(sql).not.toMatch(/DROP COLUMN/i);
  });

  it("şema, üretilmiş istemci ve paylaşılan tipler aynı değerleri taşır", () => {
    expect(enumValues("ContentPlatform")).toEqual(["web", "app", "all"]);
    expect(Object.values(ContentPlatform)).toEqual([...CONTENT_PLATFORMS]);
    expect(enumValues("AdPopupFrequency")).toEqual([
      "every_visit",
      "until_dismissed",
    ]);
    expect(Object.values(AdPopupFrequency)).toEqual([
      "every_visit",
      "until_dismissed",
    ]);
    expect([...AD_POPUP_FREQUENCIES].sort()).toEqual(
      Object.values(AdPopupFrequency).sort(),
    );
    expect(sql).toContain(`DEFAULT '${AD_POPUP_FREQUENCY_DEFAULT}'`);
  });
});
