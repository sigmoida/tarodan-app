import { isPublicStorageKey } from "./storage.service";

describe("isPublicStorageKey", () => {
  it.each([
    "dev/products/product-images/p1/card.webp",
    "staging/collections/covers/c1.webp",
    "prod/avatars/u1/avatar.webp",
  ])("accepts a public media key from any isolated environment: %s", (key) => {
    expect(isPublicStorageKey(key)).toBe(true);
  });

  it.each([
    "prod/documents/invoice.pdf",
    "staging/tickets/private.webp",
    "not-a-storage-key",
    "https://example.com/image.webp",
  ])("rejects private or malformed storage values: %s", (key) => {
    expect(isPublicStorageKey(key)).toBe(false);
  });
});
