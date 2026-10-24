import { cardImageUrl } from "./card-image-url";

describe("cardImageUrl", () => {
  const storage = { getPublicAssetUrl: (k: string) => `https://cdn.test/${k}` };

  it("resolves a card key to its public URL", () => {
    expect(cardImageUrl(storage, "products/p1/card.webp")).toBe(
      "https://cdn.test/products/p1/card.webp",
    );
  });

  it.each([undefined, null, ""])(
    "returns null for a missing key (%p)",
    (key) => {
      expect(cardImageUrl(storage, key)).toBeNull();
    },
  );

  it("returns null when the public storage root is not configured", () => {
    expect(
      cardImageUrl({ getPublicAssetUrl: () => "" }, "products/p1/card.webp"),
    ).toBeNull();
  });
});
