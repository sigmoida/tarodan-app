import { ConfigService } from "@nestjs/config";
import { CacheService } from "./cache.service";

/**
 * `setIfAbsent` tekilleştirme kapısıdır (reklam tık/gösterim sayımı): tek
 * atomik `SET … EX … NX` olmalı ve Redis hatasında kapalı başarısız olmalı.
 */
describe("CacheService.setIfAbsent", () => {
  const withClient = (set: jest.Mock) => {
    const service = new CacheService({} as ConfigService);
    (service as unknown as { client: { set: jest.Mock } }).client = { set };
    return service;
  };

  it("anahtarı tek atomik SET EX NX ile yazar ve ilk yazımda true döner", async () => {
    const set = jest.fn().mockResolvedValue("OK");
    const service = withClient(set);

    await expect(service.setIfAbsent("k", 30)).resolves.toBe(true);
    expect(set).toHaveBeenCalledWith("k", "1", "EX", 30, "NX");
  });

  it("stores a given value as JSON with the same atomic SET EX NX", async () => {
    const set = jest.fn().mockResolvedValue("OK");
    const service = withClient(set);

    await expect(service.setIfAbsent("k", 300, { userId: "u1" })).resolves.toBe(
      true,
    );
    expect(set).toHaveBeenCalledWith(
      "k",
      JSON.stringify({ userId: "u1" }),
      "EX",
      300,
      "NX",
    );
  });

  it("anahtar zaten varsa false döner", async () => {
    const service = withClient(jest.fn().mockResolvedValue(null));
    await expect(service.setIfAbsent("k", 30)).resolves.toBe(false);
  });

  it("Redis hatasında false döner (kapalı başarısızlık)", async () => {
    const service = withClient(jest.fn().mockRejectedValue(new Error("down")));
    await expect(service.setIfAbsent("k", 30)).resolves.toBe(false);
  });
});

/**
 * The step-up (`ReauthService`) fails closed on these answers: `incr` 0 means
 * "no attempt reserved" (503, no proof checked) and `get` null means "no
 * token" (403 REAUTH_REQUIRED). A rethrow or another value here would change
 * what a step-up answers while Redis is down.
 */
describe("CacheService answers on a Redis error", () => {
  const withFailingClient = () => {
    const service = new CacheService({} as ConfigService);
    const down = jest.fn().mockRejectedValue(new Error("down"));
    (service as unknown as { client: Record<string, jest.Mock> }).client = {
      incr: down,
      get: down,
    };
    return service;
  };

  it("incr answers 0", async () => {
    await expect(withFailingClient().incr("k")).resolves.toBe(0);
  });

  it("get answers null", async () => {
    await expect(withFailingClient().get("k")).resolves.toBeNull();
  });
});
