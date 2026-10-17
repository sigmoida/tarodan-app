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
 * `claimKey` is the same atomic SET but keeps "Redis down" apart from "held":
 * the Sentry repeat throttle reports on an outage instead of going silent.
 */
describe("CacheService.claimKey", () => {
  const withClient = (set: jest.Mock) => {
    const service = new CacheService({} as ConfigService);
    (service as unknown as { client: { set: jest.Mock } }).client = { set };
    return service;
  };

  it("claims a free key with one atomic SET EX NX", async () => {
    const set = jest.fn().mockResolvedValue("OK");
    await expect(withClient(set).claimKey("k", 60)).resolves.toBe("claimed");
    expect(set).toHaveBeenCalledWith("k", "1", "EX", 60, "NX");
  });

  it("reports a key someone else holds as held", async () => {
    const service = withClient(jest.fn().mockResolvedValue(null));
    await expect(service.claimKey("k", 60)).resolves.toBe("held");
  });

  it("reports a Redis failure as unavailable, never as held", async () => {
    const service = withClient(jest.fn().mockRejectedValue(new Error("down")));
    await expect(service.claimKey("k", 60)).resolves.toBe("unavailable");
  });
});
