import { StorageService } from "./storage.service";

/**
 * `S3_PUBLIC_BASE_URL` tanımsızken okuma yolları boş URL'le yedeğe düşer;
 * yükleme yolu ise önceden `hasPublicAssetBaseUrl()` sorup açık hata verir
 * (MediaService.upload). İki davranış aynı ayarı okur.
 */
describe("StorageService — public kök URL'i", () => {
  const makeService = (baseUrl: string | undefined) => {
    const config = {
      get: (key: string, fallback?: unknown) =>
        key === "S3_PUBLIC_BASE_URL" ? (baseUrl ?? fallback) : fallback,
    };
    return new StorageService(config as never, {} as never);
  };

  it("tanımlıyken true döner ve URL'i kurar", () => {
    const svc = makeService("https://cdn.example.com/");
    expect(svc.hasPublicAssetBaseUrl()).toBe(true);
    expect(svc.getPublicAssetUrl("dev/products/ads/a.webp")).toBe(
      "https://cdn.example.com/dev/products/ads/a.webp",
    );
  });

  it.each([
    ["tanımsız", undefined],
    ["boş", ""],
    ["yalnız boşluk", "   "],
  ])("%s iken false döner", (_d, value) => {
    expect(makeService(value).hasPublicAssetBaseUrl()).toBe(false);
  });

  it("okuma yolu tanımsızken boş URL döner (yedek görsele düşmek için)", () => {
    expect(makeService("").getPublicAssetUrl("k")).toBe("");
  });
});
