import { existsSync, readdirSync, readFileSync } from "fs";
import { join } from "path";
import { ConsentAction, ConsentSource } from "@prisma/client";
import {
  ACCOUNT_REQUIRED_CONSENTS,
  CONSENT_ACTIONS,
  CONSENT_DOCUMENT_KEYS,
  CONSENT_DOCUMENTS,
  CONSENT_SOURCES,
  isDraftConsentVersion,
} from "@tarodan/types";
import { apiAppRoot } from "../../common/helpers/app-root";
import { clientIpThrottleTracker } from "../../common/helpers/client-ip";
import { ConsentController } from "./consent.controller";

/**
 * SÖZLEŞME: onay kataloğunun iki yüzü ayrışmasın.
 *
 * Admin ekranı kaynak/aksiyon etiketlerini ve filtrelerini `@tarodan/types`
 * listelerinden kurar; veritabanı ise Prisma enum'larını tutar. Biri değişip
 * diğeri kalırsa admin ya bilinmeyen bir değeri etiketsiz gösterir ya da
 * hiç oluşmayacak bir değerle filtreler.
 */
describe("consent catalog contract", () => {
  it("ConsentSource enum'u paylaşılan listeyle birebir", () => {
    expect(Object.values(ConsentSource).sort()).toEqual(
      [...CONSENT_SOURCES].sort(),
    );
  });

  it("ConsentAction enum'u paylaşılan listeyle birebir", () => {
    expect(Object.values(ConsentAction).sort()).toEqual(
      [...CONSENT_ACTIONS].sort(),
    );
  });

  it("every document has a YYYY-MM-DD version, optionally marked -draft", () => {
    for (const key of CONSENT_DOCUMENT_KEYS) {
      expect(CONSENT_DOCUMENTS[key].version).toMatch(
        /^\d{4}-\d{2}-\d{2}(-draft)?$/,
      );
    }
  });

  it("a document required for every account is never a draft", () => {
    // A draft there would send every member to the re-consent gate for a
    // text legal has not signed off.
    for (const key of ACCOUNT_REQUIRED_CONSENTS) {
      expect(isDraftConsentVersion(CONSENT_DOCUMENTS[key].version)).toBe(false);
    }
  });

  it("the platform service documents are per order, not an account gate", () => {
    expect(CONSENT_DOCUMENTS.platform_service_sales).toMatchObject({
      requiredForAccount: false,
      path: "/platform-service-sales",
    });
    expect(CONSENT_DOCUMENTS.withdrawal_waiver).toMatchObject({
      requiredForAccount: false,
      path: null,
    });
  });

  it("isDraftConsentVersion reads the -draft suffix only", () => {
    expect(isDraftConsentVersion("2026-10-21-draft")).toBe(true);
    expect(isDraftConsentVersion("2026-10-21")).toBe(false);
    expect(isDraftConsentVersion("draft-2026-10-21")).toBe(false);
  });

  it("çerez ucu tarayıcı başına (istemci IP) sıkı hız sınırı taşır", () => {
    const handler = ConsentController.prototype.recordCookies;
    expect(Reflect.getMetadata("THROTTLER:LIMITdefault", handler)).toBe(10);
    expect(Reflect.getMetadata("THROTTLER:TTLdefault", handler)).toBe(60000);
    expect(Reflect.getMetadata("THROTTLER:TRACKERdefault", handler)).toBe(
      clientIpThrottleTracker,
    );
  });

  describe("göç dosyası", () => {
    const sql = readFileSync(
      join(
        apiAppRoot(),
        "prisma/migrations/20261005100000_consent_records/migration.sql",
      ),
      "utf8",
    )
      // Yorum satırları karşılaştırmaya girmesin.
      .replace(/--.*$/gm, "");

    it("yalnız ekleme yapar (DROP / RENAME / NOT NULL'a çekme yok)", () => {
      expect(sql).not.toMatch(/\bDROP\s+(TABLE|COLUMN|TYPE|INDEX)\b/i);
      expect(sql).not.toMatch(/\bRENAME\b/i);
      expect(sql).not.toMatch(/ALTER\s+COLUMN[^;]*SET\s+NOT\s+NULL/i);
    });

    it("ekleme-yalnız tetikleyicisini kurar", () => {
      expect(sql).toMatch(
        /CREATE TRIGGER consent_records_append_only_guard\s+BEFORE UPDATE OR DELETE ON "consent_records"/,
      );
    });

    it("every ConsentSource value is created by a migration", () => {
      // The enum is created here; later values arrive as `ADD VALUE` in their
      // own migrations, so all migrations touching the type are read.
      const migrationsDir = join(apiAppRoot(), "prisma/migrations");
      const enumSql = readdirSync(migrationsDir)
        .map((folder) => join(migrationsDir, folder, "migration.sql"))
        .filter((file) => existsSync(file))
        .map((file) => readFileSync(file, "utf8").replace(/--.*$/gm, ""))
        .filter((text) => text.includes('"ConsentSource"'))
        .join("\n");
      for (const source of CONSENT_SOURCES) {
        expect(enumSql).toContain(`'${source}'`);
      }
    });
  });
});
