import { DECORATIVE_GLYPH, PICTOGRAPH, stripPictographs } from "./pictograph";

describe("pictograph rule", () => {
  it.each([
    ["an emoji", "Takas Kabul Edildi! \u{1F389}"],
    ["a dingbat with VS16", "⚠️ Uyarı"],
    ["a flag", "Üretici \u{1F1F9}\u{1F1F7}"],
    ["a keycap", "1️⃣ adım"],
    ["a skin-tone sequence", "Tebrikler \u{1F44F}\u{1F3FD}"],
  ])("flags %s", (_, text) => {
    expect(text).toMatch(PICTOGRAPH);
  });

  it("allows the legal marks and plain typography", () => {
    for (const text of [
      "© 2026 Tarodan",
      "LEGO®",
      "Hot Wheels™",
      "9–12 · 3 × 2",
    ]) {
      expect(text).not.toMatch(PICTOGRAPH);
      expect(text).not.toMatch(DECORATIVE_GLYPH);
    }
  });

  it("flags arrows and check marks, not the breadcrumb separator", () => {
    expect("Profil → Adresler").toMatch(DECORATIVE_GLYPH);
    expect("Finance -> Tax").toMatch(DECORATIVE_GLYPH);
    expect("✓ başarılı").toMatch(DECORATIVE_GLYPH);
    expect("Profil > Adresler").not.toMatch(DECORATIVE_GLYPH);
  });

  it("strips pictographs and the whitespace they leave", () => {
    expect(stripPictographs("Takas Kabul Edildi! \u{1F389}")).toBe(
      "Takas Kabul Edildi!",
    );
    expect(
      stripPictographs("\u{1F680} Öne Çıkarma  Aktif \u{1F1F9}\u{1F1F7}"),
    ).toBe("Öne Çıkarma Aktif");
    expect(stripPictographs("© Tarodan")).toBe("© Tarodan");
  });
});
