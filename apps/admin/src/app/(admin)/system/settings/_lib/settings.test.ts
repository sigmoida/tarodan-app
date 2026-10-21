import { describe, expect, it } from "vitest";
import type { useTranslations } from "next-intl";
import {
  parseSettings,
  settingPayloadValue,
  settingsSchema,
  tabFields,
  toFormValues,
} from "./settings";

type T = ReturnType<typeof useTranslations<never>>;
const t = ((key: string) => key) as unknown as T;

const listingFields = () => tabFields(t).listing;
const field = (key: string) => {
  const found = listingFields().find((f) => f.key === key);
  if (!found) throw new Error(`field ${key} not found`);
  return found;
};

/** Diğer sekmelerin zorunlu alanlarını doldurur; yalnız fiyat sınırları değişir. */
const validForm = (overrides: Record<string, string> = {}) => ({
  minProductPrice: "250",
  maxProductPrice: "100000",
  maxMessageLength: "1000",
  pspFeeRate: "3",
  adminSessionTimeoutMinutes: "30",
  ...overrides,
});

describe("ilan fiyat sınırı ayarları — boş = kural yok", () => {
  it("ayar satırı yokken sınırlar null'dır (uydurma varsayılan yok)", () => {
    const parsed = parseSettings([]);

    expect(parsed.minProductPrice).toBeNull();
    expect(parsed.maxProductPrice).toBeNull();
  });

  it("kayıtlı sayısal değerleri okur", () => {
    const parsed = parseSettings([
      { settingKey: "min_product_price", settingValue: "250" },
      { settingKey: "max_product_price", settingValue: "5000.5" },
    ]);

    expect(parsed.minProductPrice).toBe(250);
    expect(parsed.maxProductPrice).toBe(5000.5);
  });

  it.each(["", "   ", "abc"])("kayıtlı %j değeri null'a düşer", (value) => {
    const parsed = parseSettings({
      min_product_price: value,
      max_product_price: value,
    });

    expect(parsed.minProductPrice).toBeNull();
    expect(parsed.maxProductPrice).toBeNull();
  });

  it('null sınır forma BOŞ metin olarak gider ("null" değil)', () => {
    const values = toFormValues(parseSettings([]));

    expect(values.minProductPrice).toBe("");
    expect(values.maxProductPrice).toBe("");
    expect(values.maxMessageLength).toBe("1000");
  });

  it("şema fiyat sınırlarını BOŞ kabul eder", () => {
    const result = settingsSchema(t).safeParse(
      validForm({ minProductPrice: "", maxProductPrice: "  " }),
    );

    expect(result.success).toBe(true);
  });

  it("şema boş olmayan geçersiz sınırı yine reddeder", () => {
    const negative = settingsSchema(t).safeParse(
      validForm({ minProductPrice: "-5" }),
    );
    const text = settingsSchema(t).safeParse(
      validForm({ maxProductPrice: "abc" }),
    );

    expect(negative.success).toBe(false);
    expect(text.success).toBe(false);
  });

  it("zorunlu alanlar (ör. mesaj uzunluğu) boş bırakılamaz", () => {
    const result = settingsSchema(t).safeParse(
      validForm({ maxMessageLength: "" }),
    );

    expect(result.success).toBe(false);
  });

  it("boş opsiyonel alan API'ye BOŞ gider, '0' değil", () => {
    expect(settingPayloadValue(field("minProductPrice"), "")).toBe("");
    expect(settingPayloadValue(field("maxProductPrice"), "  ")).toBe("");
  });

  it("dolu alan sayıya normalleştirilerek gider", () => {
    expect(settingPayloadValue(field("minProductPrice"), "250")).toBe("250");
    expect(settingPayloadValue(field("minProductPrice"), "250.50")).toBe(
      "250.5",
    );
  });

  it("reads the price limits as TL amounts, never a grouped dot as a decimal", () => {
    const grouped = settingsSchema(t).safeParse(
      validForm({ minProductPrice: "1.000" }),
    );
    expect(grouped.success).toBe(false);
    if (!grouped.success) {
      expect(grouped.error.issues).toEqual([
        expect.objectContaining({
          path: ["minProductPrice"],
          message: "validation.amountFormatRefused",
        }),
      ]);
    }
    expect(
      settingsSchema(t).safeParse(
        validForm({ minProductPrice: "1250,50", maxProductPrice: "100000" }),
      ).success,
    ).toBe(true);
    expect(settingPayloadValue(field("minProductPrice"), "1250,50")).toBe(
      "1250.5",
    );
    expect(settingPayloadValue(field("maxProductPrice"), "1000")).toBe("1000");
  });

  it("prefills the price limits with a decimal comma", () => {
    const values = toFormValues(
      parseSettings([
        { settingKey: "min_product_price", settingValue: "250.5" },
        { settingKey: "max_product_price", settingValue: "100000" },
      ]),
    );
    expect(values.minProductPrice).toBe("250,50");
    expect(values.maxProductPrice).toBe("100000");
  });

  it("compares comma limits as TL", () => {
    expect(
      settingsSchema(t).safeParse(
        validForm({ minProductPrice: "100,01", maxProductPrice: "100" }),
      ).success,
    ).toBe(false);
  });

  it("reports refused limit text once, not also as a min above max", () => {
    // "1.000" read as 1 would also put the 500 minimum above the maximum.
    const result = settingsSchema(t).safeParse(
      validForm({ minProductPrice: "500", maxProductPrice: "1.000" }),
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues).toEqual([
        expect.objectContaining({
          path: ["maxProductPrice"],
          message: "validation.amountFormatRefused",
        }),
      ]);
    }
  });

  it("alt sınır üst sınırdan büyükse alt sınır alanında hata verir", () => {
    const result = settingsSchema(t).safeParse(
      validForm({ minProductPrice: "500", maxProductPrice: "100" }),
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues).toEqual([
        expect.objectContaining({
          path: ["minProductPrice"],
          message: "admin.settings.validation.minAboveMax",
        }),
      ]);
    }
  });

  it("alt = üst ya da biri boşsa tutarlılık hatası yok", () => {
    const equal = settingsSchema(t).safeParse(
      validForm({ minProductPrice: "100", maxProductPrice: "100" }),
    );
    const onlyMin = settingsSchema(t).safeParse(
      validForm({ minProductPrice: "999999", maxProductPrice: "" }),
    );

    expect(equal.success).toBe(true);
    expect(onlyMin.success).toBe(true);
  });
});
