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
});
