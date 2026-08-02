import { hasEnvPrefix } from "./storage.service";

/**
 * Env prefix tespiti SINIR duyarlı olmalı: `"products/…".startsWith("prod")`
 * true döndüğünden prod ortamında listObjects/listFolder env'siz prefix'le
 * S3'e gidiyordu → temp temizlik cron'u 0 nesne tarıyor, admin medya
 * tarayıcısında products/ boş görünüyordu. Sözleşme: yalnız tam segment
 * eşleşmesi ("prod" veya "prod/…") prefix'li sayılır.
 */
describe("hasEnvPrefix", () => {
  it("does NOT treat a folder that merely shares characters as prefixed", () => {
    expect(hasEnvPrefix("prod", "products/product-images/temp/")).toBe(false);
    expect(hasEnvPrefix("prod", "products/uploads/a.webp")).toBe(false);
    expect(hasEnvPrefix("dev", "devices/a.webp")).toBe(false);
  });

  it("accepts keys already under the env root", () => {
    expect(hasEnvPrefix("prod", "prod/products/uploads/a.webp")).toBe(true);
    expect(hasEnvPrefix("staging", "staging/messages/u1/b.webp")).toBe(true);
  });

  it("accepts the bare env root itself", () => {
    expect(hasEnvPrefix("prod", "prod")).toBe(true);
    expect(hasEnvPrefix("prod", "prod/")).toBe(true);
  });

  it("rejects the empty prefix (root listing must gain the env root)", () => {
    expect(hasEnvPrefix("staging", "")).toBe(false);
  });
});
