import { defaultLocale, formatMessage, locales } from "@tarodan/i18n";

describe("@tarodan/i18n workspace package", () => {
  it("resolves from source in dist-less Jest jobs", () => {
    expect(locales).toEqual(["tr", "en"]);
    expect(defaultLocale).toBe("tr");
    expect(formatMessage("Merhaba {name}", { name: "Tarodan" })).toBe(
      "Merhaba Tarodan",
    );
  });
});
