import {
  legacyKeyToNewKey,
  rewriteLegacyUrlsInText,
} from "./media-folder-migration";

/**
 * Faz 0 — Eski nesnelerin taşınması için saf eşleme yardımcıları
 * (scripts/migrate-media-folders.ts bunları kullanır):
 *  - products/ altına yanlış düşmüş messages/reviews/collections dosyaları
 *    yeni köklerine eşlenir; başka hiçbir key'e DOKUNULMAZ.
 *  - Message.content içine gömülü eski public URL'ler yeni URL'le değiştirilir.
 */
describe("legacyKeyToNewKey", () => {
  it("maps products/messages → messages (private root)", () => {
    expect(legacyKeyToNewKey("staging/products/messages/abc.webp")).toBe(
      "staging/messages/abc.webp",
    );
  });

  it("maps products/reviews → reviews", () => {
    expect(legacyKeyToNewKey("prod/products/reviews/x/y.webp")).toBe(
      "prod/reviews/x/y.webp",
    );
  });

  it("maps products/collections → collections/user-uploads", () => {
    expect(legacyKeyToNewKey("dev/products/collections/c.webp")).toBe(
      "dev/collections/user-uploads/c.webp",
    );
  });

  it("returns null for anything else (gerçek ürün görsellerine dokunma)", () => {
    expect(
      legacyKeyToNewKey("prod/products/product-images/p1/card.webp"),
    ).toBeNull();
    expect(legacyKeyToNewKey("prod/avatars/u1/a.webp")).toBeNull();
    expect(legacyKeyToNewKey("seed-assets/hero/h.webp")).toBeNull();
  });
});

describe("rewriteLegacyUrlsInText", () => {
  const BASE = "https://amzn-tarodan.s3.eu-west-1.amazonaws.com";

  it("rewrites embedded legacy URLs using the mapper and leaves the rest", () => {
    const text = `bak: ${BASE}/dev/products/messages/a.webp ve ${BASE}/dev/products/product-images/p/x.webp`;
    const out = rewriteLegacyUrlsInText(text, BASE, (key) =>
      key === "dev/products/messages/a.webp"
        ? "https://api.test/api/media/message-attachment/mf-1"
        : null,
    );
    expect(out).toBe(
      `bak: https://api.test/api/media/message-attachment/mf-1 ve ${BASE}/dev/products/product-images/p/x.webp`,
    );
  });

  it("returns the text unchanged when nothing matches", () => {
    const text = "duz metin, url yok";
    expect(rewriteLegacyUrlsInText(text, BASE, () => null)).toBe(text);
  });
});
