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
 * popup sıklığı ve popup sürümü gelir. Eski `device_type` değerleri birebir
 * taşınır; kolon silinmez (eski mobil sürümler türetilmiş `deviceType` okur).
 * `ContentPlatform` tipi hero göçüyle ortaktır: hangisi önce çalışırsa kurar.
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

  it("geri doldurma desktop→web, mobile→app, diğer→all; kolon eklendikten sonra", () => {
    const backfill = sql.search(/UPDATE "advertisements"\s+SET "platform" = CASE "device_type"/);
    expect(backfill).toBeGreaterThan(sql.indexOf('ADD COLUMN "platform"'));
    expect(sql).toMatch(/WHEN 'desktop' THEN 'web'::"ContentPlatform"/);
    expect(sql).toMatch(/WHEN 'mobile' THEN 'app'::"ContentPlatform"/);
    expect(sql).toMatch(/ELSE 'all'::"ContentPlatform"/);
  });

  it("geri doldurma eşlemesi, API'nin türettiği deviceType'ın tersidir", () => {
    // Göç sonrası türetilen deviceType eski kolonla aynı kalmalı.
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
