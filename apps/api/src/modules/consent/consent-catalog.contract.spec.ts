import { readFileSync } from "fs";
import { join } from "path";
import { ConsentAction, ConsentSource } from "@prisma/client";
import {
  CONSENT_ACTIONS,
  CONSENT_DOCUMENT_KEYS,
  CONSENT_DOCUMENTS,
  CONSENT_SOURCES,
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

  it("her belgenin YYYY-MM-DD biçiminde bir sürümü var", () => {
    for (const key of CONSENT_DOCUMENT_KEYS) {
      expect(CONSENT_DOCUMENTS[key].version).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
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

    it("ConsentSource enum değerleri şemayla aynı", () => {
      for (const source of CONSENT_SOURCES) {
        expect(sql).toContain(`'${source}'`);
      }
    });
  });
});
