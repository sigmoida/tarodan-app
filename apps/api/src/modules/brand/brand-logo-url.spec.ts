import { resolveBrandLogoUrl } from "./brand-logo-url";

/**
 * Faz 1 — Brand.logo artık S3 KEY taşır ({env}/brands/{slug}.webp); URL tek
 * yerden (getPublicAssetUrl) kurulur. Eski repo yolları ("/photos/logolar/…")
 * null'a düşer: statik dosyalar silindi, önyüz baş-harf placeholder gösterir.
 */
describe("resolveBrandLogoUrl", () => {
  const toUrl = (key: string) => `https://cdn.test/${key}`;

  it("builds the public URL from an S3 key", () => {
    expect(resolveBrandLogoUrl("staging/brands/kyosho.png", toUrl)).toBe(
      "https://cdn.test/staging/brands/kyosho.png",
    );
  });

  it("passes absolute URLs through unchanged (admin'in yapıştırdığı harici logo)", () => {
    expect(resolveBrandLogoUrl("https://ext.example/logo.png", toUrl)).toBe(
      "https://ext.example/logo.png",
    );
  });

  it("maps legacy repo paths to null (statikler kaldırıldı)", () => {
    expect(resolveBrandLogoUrl("/photos/logolar/x.png", toUrl)).toBeNull();
  });

  it("maps empty/null to null", () => {
    expect(resolveBrandLogoUrl(null, toUrl)).toBeNull();
    expect(resolveBrandLogoUrl("", toUrl)).toBeNull();
  });

  it("returns null when the URL builder yields empty (S3 yapılandırılmamış)", () => {
    expect(resolveBrandLogoUrl("staging/brands/x.png", () => "")).toBeNull();
  });
});
