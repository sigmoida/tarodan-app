import { extractImageMarkerTargets } from "./message-image-markers.helper";

describe("extractImageMarkerTargets", () => {
  const ATT =
    "https://api.tarodan.test/api/media/message-attachment/0b0f6c3e-8a2d-4c1b-9f51-3a7e2d9c4b10";

  it("işaretsiz gövde → boş", () => {
    expect(extractImageMarkerTargets("merhaba, ürün duruyor mu?")).toEqual([]);
    expect(extractImageMarkerTargets("")).toEqual([]);
  });

  it("istemcinin ürettiği biçimi (metin + işaret) çıkarır", () => {
    expect(extractImageMarkerTargets(`bak bu güzel [IMG:${ATT}]`)).toEqual([
      ATT,
    ]);
  });

  it("birden çok işareti sırasıyla döner (web: satır başına bir işaret)", () => {
    const other = ATT.replace("4b10", "4b11");
    expect(
      extractImageMarkerTargets(`metin\n\n[IMG:${ATT}]\n[IMG:${other}]`),
    ).toEqual([ATT, other]);
  });

  it("büyük/küçük harf duyarsız — `[img:` da yakalanır", () => {
    expect(
      extractImageMarkerTargets("[img:https://evil.example/x.png]"),
    ).toEqual(["https://evil.example/x.png"]);
  });

  it("hedefi boşluklar dahil bir sonraki `]`'e kadar alır (kırpmaz)", () => {
    expect(extractImageMarkerTargets(`[IMG: ${ATT} ]`)).toEqual([` ${ATT} `]);
  });

  it("iç içe işaretin İKİ başlangıcı da ayrı hedef olarak görülür", () => {
    // Web istemcisi içteki `[IMG:https://evil…]`'i çizer; dıştaki tarama onu
    // yutmamalı.
    expect(
      extractImageMarkerTargets("[IMG:[IMG:https://evil.example/x.png]]"),
    ).toEqual([
      "[IMG:https://evil.example/x.png",
      "https://evil.example/x.png",
    ]);
  });

  it("kapanmayan işaretin hedefi boş sayılır (geçersiz)", () => {
    expect(extractImageMarkerTargets(`selam [IMG:${ATT}`)).toEqual([""]);
  });
});
