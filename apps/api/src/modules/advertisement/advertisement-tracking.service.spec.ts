import { HttpStatus } from "@nestjs/common";
import {
  HTTP_CODE_METADATA,
  ROUTE_ARGS_METADATA,
} from "@nestjs/common/constants";
import { RouteParamtypes } from "@nestjs/common/enums/route-paramtypes.enum";
import { AdvertisementTrackingService } from "./advertisement-tracking.service";
import { AdvertisementController } from "./advertisement.controller";
import { clientIpThrottleTracker } from "../../common/helpers/client-ip";
import type { PrismaService } from "../../prisma";
import type { CacheService } from "../cache/cache.service";

/**
 * Tık/gösterim sayımı: yalnız yayındaki reklam, IP + reklam başına pencere
 * içinde bir kez (gösterim 30 dk, tık 10 sn). Sayılmayan istek de sessizce
 * kabul edilir — beacon yanıtı okumaz.
 */

const NOW = new Date("2026-10-09T09:00:00Z");

const liveAd = (over: Record<string, unknown> = {}) => ({
  isActive: true,
  startDate: null,
  endDate: null,
  discount: null,
  ...over,
});

function makeService(
  ad: Record<string, unknown> | null = liveAd(),
  firstInWindow = true,
) {
  const advertisement = {
    findUnique: jest.fn().mockResolvedValue(ad),
    updateMany: jest.fn().mockResolvedValue({ count: 1 }),
  };
  const cache = { setIfAbsent: jest.fn().mockResolvedValue(firstInWindow) };
  const service = new AdvertisementTrackingService(
    { advertisement } as unknown as PrismaService,
    cache as unknown as CacheService,
  );
  return { service, advertisement, cache };
}

describe("AdvertisementTrackingService", () => {
  beforeEach(() => jest.useFakeTimers().setSystemTime(NOW));
  afterEach(() => jest.useRealTimers());

  it("gösterimi sayar; anahtar IP + reklam, pencere 30 dk", async () => {
    const { service, advertisement, cache } = makeService();

    await service.recordImpression("ad-1", "203.0.113.7");

    expect(cache.setIfAbsent).toHaveBeenCalledWith(
      "ads:dedupe:impression:ad-1:203.0.113.7",
      1800,
    );
    expect(advertisement.updateMany).toHaveBeenCalledWith({
      where: { id: "ad-1" },
      data: { impressionCount: { increment: 1 } },
    });
  });

  it("tıkı sayar; pencere 10 sn", async () => {
    const { service, advertisement, cache } = makeService();

    await service.recordClick("ad-1", "203.0.113.7");

    expect(cache.setIfAbsent).toHaveBeenCalledWith(
      "ads:dedupe:click:ad-1:203.0.113.7",
      10,
    );
    expect(advertisement.updateMany).toHaveBeenCalledWith({
      where: { id: "ad-1" },
      data: { clickCount: { increment: 1 } },
    });
  });

  it("pencere içindeki tekrar sayılmaz", async () => {
    const { service, advertisement } = makeService(liveAd(), false);
    await service.recordClick("ad-1", "203.0.113.7");
    expect(advertisement.updateMany).not.toHaveBeenCalled();
  });

  it.each([
    ["bilinmeyen reklam", null],
    ["pasif reklam", liveAd({ isActive: false })],
    ["süresi bitmiş reklam", liveAd({ endDate: new Date("2026-10-01") })],
    ["henüz başlamamış reklam", liveAd({ startDate: new Date("2026-11-01") })],
    [
      "kampanyası bitmiş reklam",
      liveAd({
        discount: {
          isActive: true,
          startDate: new Date("2026-09-01"),
          endDate: new Date("2026-10-01"),
          budgetStoppedAt: null,
        },
      }),
    ],
  ])("%s: hata vermeden yok sayılır, anahtar yakılmaz", async (_d, ad) => {
    const { service, advertisement, cache } = makeService(ad);

    await expect(
      service.recordImpression("ad-1", "203.0.113.7"),
    ).resolves.toBeUndefined();

    expect(cache.setIfAbsent).not.toHaveBeenCalled();
    expect(advertisement.updateMany).not.toHaveBeenCalled();
  });

  it("yayın kuralını vitrinle aynı alanlardan okur", async () => {
    const { service, advertisement } = makeService();
    await service.recordImpression("ad-1", "203.0.113.7");
    expect(advertisement.findUnique.mock.calls[0][0].select).toEqual({
      isActive: true,
      startDate: true,
      endDate: true,
      discount: {
        select: {
          isActive: true,
          startDate: true,
          endDate: true,
          budgetStoppedAt: true,
        },
      },
    });
  });
});

describe("AdvertisementController — tık/gösterim uçları", () => {
  const proto = AdvertisementController.prototype as unknown as Record<
    string,
    object
  >;

  it.each(["recordClick", "recordImpression"])(
    "%s istemci IP'si başına 60/dk kısılır ve 204 döner",
    (name) => {
      const handler = proto[name];
      expect(Reflect.getMetadata("THROTTLER:LIMITdefault", handler)).toBe(60);
      expect(Reflect.getMetadata("THROTTLER:TTLdefault", handler)).toBe(60000);
      expect(Reflect.getMetadata("THROTTLER:TRACKERdefault", handler)).toBe(
        clientIpThrottleTracker,
      );
      expect(Reflect.getMetadata(HTTP_CODE_METADATA, handler)).toBe(
        HttpStatus.NO_CONTENT,
      );
    },
  );

  it("gövde parametresi almaz (sendBeacon text/plain ya da boş gönderir)", () => {
    for (const name of ["recordClick", "recordImpression"]) {
      const args =
        (Reflect.getMetadata(
          ROUTE_ARGS_METADATA,
          AdvertisementController,
          name,
        ) as Record<string, unknown> | undefined) ?? {};
      // Anahtar "<RouteParamtypes>:<index>" biçimindedir.
      expect(
        Object.keys(args).some((key) =>
          key.startsWith(`${RouteParamtypes.BODY}:`),
        ),
      ).toBe(false);
    }
  });
});
