import { isPublicBucket, isPublicStorageKey } from "./storage.service";

/**
 * Faz 0 — Görünürlük sözleşmesi: `reviews` public köke taşındı (S3 policy'de
 * karşılığı var); `messages` BİLEREK public listede DEĞİL — mesaj ekleri artık
 * yalnız yetkili endpoint'ten presigned ile okunur. Eskiden ikisi de public
 * `products/` altındaydı ve özel mesaj görselleri URL'yi bilen herkese açıktı.
 */
describe("bucket visibility contract", () => {
  it("treats reviews as public", () => {
    expect(isPublicBucket("reviews")).toBe(true);
    expect(isPublicStorageKey("staging/reviews/user-1/a.webp")).toBe(true);
  });

  it("keeps messages PRIVATE", () => {
    expect(isPublicBucket("messages")).toBe(false);
    expect(isPublicStorageKey("staging/messages/user-1/a.webp")).toBe(false);
  });

  it("keeps existing roots unchanged", () => {
    expect(isPublicBucket("products")).toBe(true);
    expect(isPublicBucket("documents")).toBe(false);
    expect(isPublicBucket("tickets")).toBe(false);
  });
});
