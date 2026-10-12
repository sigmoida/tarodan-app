import {
  HERO_MAX_SLIDES,
  HERO_PLACEMENTS,
  HERO_TEXT_LIMITS,
  TRUST_BADGE_ICONS,
  normalizeLocalizedText,
  parseLocalizedText,
  pickLocalized,
  validateLocalizedText,
} from "@tarodan/types";

const REQUIRED = { maxLength: 10, required: true };
const OPTIONAL = { maxLength: 10, required: false };

describe("pickLocalized (@tarodan/types)", () => {
  it("istenen dili döner", () => {
    expect(pickLocalized({ tr: "Merhaba", en: "Hello" }, "en")).toBe("Hello");
    expect(pickLocalized({ tr: "Merhaba", en: "Hello" }, "tr")).toBe("Merhaba");
  });

  it.each([
    ["yok", undefined],
    ["null", null],
    ["boş", ""],
    ["yalnız boşluk", "   "],
  ])("İngilizce %s → Türkçeye düşer", (_d, en) => {
    expect(pickLocalized({ tr: "Merhaba", en }, "en")).toBe("Merhaba");
  });

  it("değer yoksa boş dize döner (istemci boşluktan karar verir)", () => {
    expect(pickLocalized(null, "tr")).toBe("");
    expect(pickLocalized(undefined, "en")).toBe("");
  });
});

describe("validateLocalizedText (@tarodan/types)", () => {
  it("geçerli değerde null döner", () => {
    expect(validateLocalizedText({ tr: "Başlık" }, REQUIRED)).toBeNull();
    expect(
      validateLocalizedText({ tr: "Başlık", en: "Title" }, REQUIRED),
    ).toBeNull();
    expect(
      validateLocalizedText({ tr: "Başlık", en: null }, REQUIRED),
    ).toBeNull();
  });

  it.each([
    ["undefined", undefined],
    ["null", null],
    ["iki dil boş", { tr: " ", en: "" }],
  ])("zorunlu alan %s → required; zorunlu değilse geçerli", (_d, value) => {
    expect(validateLocalizedText(value, REQUIRED)).toBe("required");
    expect(validateLocalizedText(value, OPTIONAL)).toBeNull();
  });

  it("İngilizce var ama Türkçe boş → trMissing (zorunlu olmasa da)", () => {
    expect(validateLocalizedText({ tr: "", en: "Title" }, OPTIONAL)).toBe(
      "trMissing",
    );
    expect(validateLocalizedText({ en: "Title" }, REQUIRED)).toBe("trMissing");
  });

  it("sınır kırpılmış metne uygulanır, her dil için ayrı", () => {
    expect(validateLocalizedText({ tr: "  1234567890  " }, REQUIRED)).toBeNull();
    expect(validateLocalizedText({ tr: "12345678901" }, REQUIRED)).toBe(
      "tooLong",
    );
    expect(
      validateLocalizedText({ tr: "kısa", en: "12345678901" }, REQUIRED),
    ).toBe("tooLong");
  });

  it.each([
    ["dize", "Başlık"],
    ["dizi", ["Başlık"]],
    ["sayı", 5],
    ["bilinmeyen dil", { tr: "Başlık", de: "Titel" }],
    ["metin olmayan tr", { tr: 5 }],
    ["metin olmayan en", { tr: "Başlık", en: { x: 1 } }],
  ])("%s → invalid", (_d, value) => {
    expect(validateLocalizedText(value, REQUIRED)).toBe("invalid");
  });
});

describe("normalizeLocalizedText / parseLocalizedText (@tarodan/types)", () => {
  it("kırpar, boş İngilizceyi null yapar, boş değeri null'a indirir", () => {
    expect(normalizeLocalizedText({ tr: " A ", en: " B " })).toEqual({
      tr: "A",
      en: "B",
    });
    expect(normalizeLocalizedText({ tr: "A", en: "  " })).toEqual({
      tr: "A",
      en: null,
    });
    expect(normalizeLocalizedText({ tr: " ", en: "" })).toBeNull();
    expect(normalizeLocalizedText(null)).toBeNull();
  });

  it("saklanan JSON'u toleranslı okur", () => {
    expect(parseLocalizedText({ tr: "A", en: "B" })).toEqual({
      tr: "A",
      en: "B",
    });
    expect(parseLocalizedText({ tr: "A" })).toEqual({ tr: "A", en: null });
    expect(parseLocalizedText({ en: "B" })).toBeNull();
    expect(parseLocalizedText("A")).toBeNull();
    expect(parseLocalizedText(null)).toBeNull();
  });
});

describe("hero sözleşmesi (@tarodan/types)", () => {
  it("yerleşimler, sınırlar ve ikon listesi sabittir", () => {
    expect(HERO_PLACEMENTS).toEqual(["home", "auth_default", "auth_register"]);
    expect(HERO_MAX_SLIDES).toBe(5);
    expect(HERO_TEXT_LIMITS).toEqual({
      title: 120,
      subtitle: 240,
      ctaLabel: 40,
      imageAlt: 160,
    });
    expect(TRUST_BADGE_ICONS).toHaveLength(6);
    expect(new Set(TRUST_BADGE_ICONS).size).toBe(6);
  });
});
