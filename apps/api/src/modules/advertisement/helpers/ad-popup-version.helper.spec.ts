import {
  adCreativeChanged,
  type AdCreativePatch,
  type AdCreativeSnapshot,
} from "./ad-popup-version.helper";

/**
 * popupVersion yalnız kreatif GERÇEKTEN değişince artar: kapatılmış popup'ı
 * herkese yeniden göstermek, aktif/pasif düğmesi gibi kreatif dışı bir
 * düzenlemenin yan etkisi olmamalı.
 */
const spot = {
  x: 0,
  y: 0,
  width: 0.5,
  height: 1,
  label: "Sol",
  linkUrl: "/sol",
};

const stored: AdCreativeSnapshot = {
  title: "Ekim",
  imageUrl: "https://cdn.test/a.png",
  linkUrl: null,
  content: "metin",
  altText: "alt",
  popupFrequency: "until_dismissed",
  hotspots: [spot],
};

const patch = (over: Partial<AdCreativePatch> = {}): AdCreativePatch => ({
  linkUrl: undefined,
  hotspots: { kind: "keep" },
  ...over,
});

describe("adCreativeChanged", () => {
  it("hiçbir kreatif alan gönderilmezse değişmemiştir", () => {
    expect(adCreativeChanged(stored, patch())).toBe(false);
  });

  it("aynı değerleri yeniden yazmak değişiklik değildir", () => {
    expect(
      adCreativeChanged(
        stored,
        patch({
          title: "Ekim",
          imageUrl: "https://cdn.test/a.png",
          content: "metin",
          altText: "alt",
          popupFrequency: "until_dismissed",
          linkUrl: null,
          hotspots: { kind: "replace", hotspots: [{ ...spot, label: " Sol " }] },
        }),
      ),
    ).toBe(false);
  });

  it.each([
    ["title", { title: "Kasım" }],
    ["imageUrl", { imageUrl: "https://cdn.test/b.png" }],
    ["content", { content: null }],
    ["altText", { altText: "yeni" }],
    ["popupFrequency", { popupFrequency: "every_visit" as const }],
    ["linkUrl", { linkUrl: "/yeni" }],
  ])("%s farklıysa değişmiştir", (_f, over) => {
    expect(adCreativeChanged(stored, patch(over))).toBe(true);
  });

  it("alanlar: temizleme yalnız alan varken değişikliktir", () => {
    expect(adCreativeChanged(stored, patch({ hotspots: { kind: "clear" } }))).toBe(
      true,
    );
    expect(
      adCreativeChanged(
        { ...stored, hotspots: [] },
        patch({ hotspots: { kind: "clear" } }),
      ),
    ).toBe(false);
  });

  it.each([
    ["sayı", [spot, { ...spot, x: 0.5 }]],
    ["geometri", [{ ...spot, width: 0.4 }]],
    ["etiket", [{ ...spot, label: "Sağ" }]],
    ["bağlantı", [{ ...spot, linkUrl: "/sag" }]],
  ])("alanlar: %s farklıysa değişmiştir", (_f, hotspots) => {
    expect(
      adCreativeChanged(
        stored,
        patch({ hotspots: { kind: "replace", hotspots } }),
      ),
    ).toBe(true);
  });
});
