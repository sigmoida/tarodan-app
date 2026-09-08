import {
  ENTITY_PREFIX,
  EXTERNAL_CODE_FORMATS,
  REFERENCE_PREFIX,
  invoiceRecordReference,
  promoteUserCodeToCorporate,
} from "./code-prefixes";
import { generateReferenceCode } from "./generate-reference";

describe("code prefixes", () => {
  it("keeps every entity prefix a single distinct uppercase letter", () => {
    const values = Object.values(ENTITY_PREFIX);
    expect(new Set(values).size).toBe(values.length);
    for (const prefix of values) {
      expect(prefix).toMatch(/^[A-Z]$/);
    }
  });

  it("keeps every reference prefix three distinct uppercase letters", () => {
    const values = Object.values(REFERENCE_PREFIX);
    expect(new Set(values).size).toBe(values.length);
    for (const prefix of values) {
      expect(prefix).toMatch(/^[A-Z]{3}$/);
    }
  });

  it("never reuses an externally dictated prefix", () => {
    // e-Arşiv numarası "TRD" ile başlar (GİB'e kayıtlı); takas referansı bu
    // yüzden TKS kullanır. Bu test öneki geri almayı engeller.
    const elogoPrefix = EXTERNAL_CODE_FORMATS.elogoInvoice.slice(0, 3);
    expect(Object.values(REFERENCE_PREFIX)).not.toContain(elogoPrefix);
  });

  it("produces references that parse back to their prefix", () => {
    for (const prefix of Object.values(REFERENCE_PREFIX)) {
      // PYT istisnası: PayTR trans_id tire kabul etmez (payout-trans-id.ts).
      if (prefix === REFERENCE_PREFIX.payoutTransfer) continue;
      const code = generateReferenceCode(prefix);
      expect(code).toMatch(/^[A-Z]{3}-[23456789ABCDEFGHJKMNPQRSTVWXYZ]{10}$/);
      expect(code.split("-")[0]).toBe(prefix);
    }
  });

  it("supports a hyphen-free separator for provider-imposed formats", () => {
    const code = generateReferenceCode(REFERENCE_PREFIX.payoutTransfer, 10, "");
    expect(code).toMatch(/^PYT[23456789ABCDEFGHJKMNPQRSTVWXYZ]{10}$/);
  });

  describe("promoteUserCodeToCorporate", () => {
    it("swaps the prefix and keeps the permanent number", () => {
      expect(promoteUserCodeToCorporate("B010023")).toBe("K010023");
    });

    it("returns null when the account is already corporate", () => {
      expect(promoteUserCodeToCorporate("K010023")).toBeNull();
    });

    it("returns null for codes that are not entity codes", () => {
      for (const code of ["", "ORD-K7X9M2QF3N", "b010023", "B10", "010023"]) {
        expect(promoteUserCodeToCorporate(code)).toBeNull();
      }
    });
  });

  it("keeps entity and reference formats visually distinguishable", () => {
    // Varlık kodu: tek harf + rakam, tiresiz. İşlem referansı: üç harf + tire.
    const entityPattern = /^[A-Z]\d{6}$/;
    for (const prefix of Object.values(ENTITY_PREFIX)) {
      expect(`${prefix}010001`).toMatch(entityPattern);
    }
    expect(generateReferenceCode(REFERENCE_PREFIX.order)).not.toMatch(
      entityPattern,
    );
  });

  describe("invoiceRecordReference", () => {
    it("koli kodunun GÖVDESİNİ korur, yalnız öneki değiştirir", () => {
      // Gövde aynı kaldığı için fatura ile koli gözle eşleşir; ayrı bir
      // eşleme tablosu tutulmaz.
      expect(invoiceRecordReference("PKG-K7X9M2QF3N")).toBe("KYT-K7X9M2QF3N");
      expect(invoiceRecordReference("ORD-A1B2C3D4E5")).toBe("KYT-A1B2C3D4E5");
    });

    it("kaynağı olmayan belge referanssız kesilir", () => {
      expect(invoiceRecordReference(null)).toBeNull();
      expect(invoiceRecordReference("  ")).toBeNull();
    });
  });
});
