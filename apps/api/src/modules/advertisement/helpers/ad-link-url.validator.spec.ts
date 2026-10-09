import { AD_LINK_URL_MAX_LENGTH, isAdLinkUrl } from "./ad-link-url.validator";

/**
 * Reklam bağlantısı web'de `<a href>` olarak render edilir: şema ya da
 * protokol-göreli bir adres tıklayanı başka yere götürür veya kod çalıştırır.
 */
describe("isAdLinkUrl", () => {
  it.each([
    "https://x.com",
    "https://kampanya.example.com/ekim?utm_source=tarodan",
    "http://x.com/path",
    "/kategori/x",
    "/listings?sort=new&page=2",
    "/",
  ])("kabul: %s", (value) => {
    expect(isAdLinkUrl(value)).toBe(true);
  });

  it.each([
    ["javascript şeması", "javascript:alert(1)"],
    ["büyük harfli javascript", "JavaScript:alert(1)"],
    ["data şeması", "data:text/html,<script>alert(1)</script>"],
    ["protokol-göreli", "//evil.com"],
    ["ters bölü ile protokol-göreli", "/\\evil.com"],
    ["yolda ters bölü", "/kategori\\x"],
    ["yolda boşluk", "/kategori/ x"],
    ["şemasız alan adı", "evil.com"],
    ["ftp", "ftp://x.com/file"],
    ["boş dize", ""],
    ["dize olmayan", 42],
  ])("ret (%s)", (_d, value) => {
    expect(isAdLinkUrl(value)).toBe(false);
  });

  it("uzunluk tavanını aşan bağlantıyı reddeder", () => {
    const long = "/" + "a".repeat(AD_LINK_URL_MAX_LENGTH);
    expect(isAdLinkUrl(long)).toBe(false);
  });
});
