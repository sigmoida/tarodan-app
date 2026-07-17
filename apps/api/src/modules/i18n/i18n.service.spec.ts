// #223 — the api renders from the shared @tarodan/i18n catalog (no inline
// tables). Runs in the dist-less jest job: @tarodan/i18n is source-mapped, so
// this also proves the package (ICU + catalog JSON) resolves in api tests.
import { I18nService } from "./i18n.service";
import { resolveRequestLocale, parseAcceptLanguage } from "./locale.util";

describe("I18nService (#223) — shared catalog + ICU", () => {
  const svc = new I18nService();

  it("renders a catalog key in the requested locale", () => {
    expect(svc.translate("common.save", "tr")).toBe("Kaydet");
    expect(svc.translate("common.save", "en")).toBe("Save");
  });

  it("interpolates ICU params", () => {
    expect(
      svc.translate("product.searchResultsFor", "tr", { query: "lastik" }),
    ).toBe('"lastik" araması');
  });

  it("degrades to the raw key when a key is missing (no throw)", () => {
    expect(svc.translate("__does.not.exist__", "tr")).toBe(
      "__does.not.exist__",
    );
  });

  it("falls back to the default locale for an unsupported locale", () => {
    // 'de' is not supported → resolveLocale → 'tr'
    expect(svc.translate("common.save", "de" as never)).toBe("Kaydet");
  });

  it("exposes supported locales + default", () => {
    expect(svc.getSupportedLanguages()).toEqual(["tr", "en"]);
    expect(svc.getDefaultLanguage()).toBe("tr");
  });

  it("serves a namespace slice of the catalog", () => {
    const common = svc.getAllTranslations("en", "common") as Record<
      string,
      unknown
    >;
    expect(common.save).toBe("Save");
    expect(svc.getAllTranslations("tr", "nope.zzz")).toEqual({});
  });

  describe("Accept-Language parsing", () => {
    it("picks the highest-q supported locale", () => {
      expect(parseAcceptLanguage("en-US,en;q=0.9,tr;q=0.8")).toBe("en");
      expect(parseAcceptLanguage("tr-TR,tr;q=0.9")).toBe("tr");
    });
    it("falls back to default for unknown / empty", () => {
      expect(parseAcceptLanguage("fr-FR,de;q=0.9")).toBe("tr");
      expect(parseAcceptLanguage(undefined)).toBe("tr");
    });
  });

  describe("resolveRequestLocale precedence", () => {
    it("prefers the user preference over the header", () => {
      expect(
        resolveRequestLocale({
          user: { preferredLanguage: "en" },
          headers: { "accept-language": "tr" },
        }),
      ).toBe("en");
    });
    it("uses Accept-Language when no user preference", () => {
      expect(
        resolveRequestLocale({ headers: { "accept-language": "en;q=1" } }),
      ).toBe("en");
    });
    it("defaults to tr with nothing to go on", () => {
      expect(resolveRequestLocale({})).toBe("tr");
    });
  });
});
