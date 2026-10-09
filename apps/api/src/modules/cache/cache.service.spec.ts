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
