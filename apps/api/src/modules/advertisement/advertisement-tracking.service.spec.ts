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
 * Tık/gösterim sayımı: yalnız yayındaki reklam, IP + reklam (+ alan) başına
 * pencere içinde bir kez (gösterim 30 dk, tık 10 sn). Görselli reklamda tık
 * yalnız bir alana (`?hotspot=`) sayılır; görselsiz reklamda tek bağlantıya.
 * Sayılmayan istek de sessizce kabul edilir — beacon yanıtı okumaz.
 */

const NOW = new Date("2026-10-09T09:00:00Z");

const HOTSPOT = "11111111-1111-4111-8111-111111111111";

/** Varsayılan: yayında, görselsiz (metin) reklam, tek bağlantılı. */
const liveAd = (over: Record<string, unknown> = {}) => ({
  isActive: true,
  startDate: null,
  endDate: null,
  discount: null,
  imageUrl: null,
  linkUrl: "/kategori/x",
  ...over,
});

const imageAd = () =>
  liveAd({ imageUrl: "https://cdn.test/a.png", linkUrl: null });

function makeService(
  ad: Record<string, unknown> | null = liveAd(),
  firstInWindow = true,
  ownedHotspot: { id: string } | null = { id: HOTSPOT },
) {
  const advertisement = {
    findUnique: jest.fn().mockResolvedValue(ad),
    updateMany: jest.fn().mockResolvedValue({ count: 1 }),
  };
  const adHotspot = {
    findFirst: jest.fn().mockResolvedValue(ownedHotspot),
    updateMany: jest.fn().mockResolvedValue({ count: 1 }),
  };
  const $transaction = jest.fn().mockResolvedValue([]);
  const cache = { setIfAbsent: jest.fn().mockResolvedValue(firstInWindow) };
  const service = new AdvertisementTrackingService(
    { advertisement, adHotspot, $transaction } as unknown as PrismaService,
    cache as unknown as CacheService,
  );
  return { service, advertisement, adHotspot, $transaction, cache };
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

  it("yayın kuralını vitrinle aynı alanlardan, tık hedefini görsel/bağlantıdan okur", async () => {
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
      imageUrl: true,
      linkUrl: true,
    });
  });

  it("görselli reklamın gösterimi alan olmadan da sayılır", async () => {
    const { service, advertisement } = makeService(imageAd());
    await service.recordImpression("ad-1", "203.0.113.7");
    expect(advertisement.updateMany).toHaveBeenCalledWith({
      where: { id: "ad-1" },
      data: { impressionCount: { increment: 1 } },
    });
  });
});

describe("AdvertisementTrackingService.recordClick — alanlar (hotspot)", () => {
  beforeEach(() => jest.useFakeTimers().setSystemTime(NOW));
  afterEach(() => jest.useRealTimers());

  it("alan tıkı: reklam ve alan sayacı tek işlemde artar; anahtar IP + reklam + alan", async () => {
    const { service, advertisement, adHotspot, $transaction, cache } =
      makeService(imageAd());

    await service.recordClick("ad-1", "203.0.113.7", HOTSPOT);

    expect(adHotspot.findFirst).toHaveBeenCalledWith({
      where: { id: HOTSPOT, advertisementId: "ad-1" },
      select: { id: true },
    });
    expect(cache.setIfAbsent).toHaveBeenCalledWith(
      `ads:dedupe:click:ad-1:hotspot:${HOTSPOT}:203.0.113.7`,
      10,
    );
    expect($transaction).toHaveBeenCalledTimes(1);
    expect($transaction.mock.calls[0][0]).toHaveLength(2);
    expect(advertisement.updateMany).toHaveBeenCalledWith({
      where: { id: "ad-1" },
      data: { clickCount: { increment: 1 } },
    });
    expect(adHotspot.updateMany).toHaveBeenCalledWith({
      where: { id: HOTSPOT, advertisementId: "ad-1" },
      data: { clickCount: { increment: 1 } },
    });
  });

  it("başka reklamın alanı: yok sayılır, anahtar yakılmaz", async () => {
    const { service, advertisement, adHotspot, $transaction, cache } =
      makeService(imageAd(), true, null);

    await expect(
      service.recordClick("ad-1", "203.0.113.7", HOTSPOT),
    ).resolves.toBeUndefined();

    expect(cache.setIfAbsent).not.toHaveBeenCalled();
    expect($transaction).not.toHaveBeenCalled();
    expect(advertisement.updateMany).not.toHaveBeenCalled();
    expect(adHotspot.updateMany).not.toHaveBeenCalled();
  });

  it.each([
    ["uuid olmayan", "abc"],
    ["tekrarlanan parametre", [HOTSPOT, HOTSPOT]],
  ])("%s alan değeri: 400 değil, sorgusuz yok sayılır", async (_d, raw) => {
    const { service, advertisement, adHotspot, cache } = makeService(imageAd());

    await expect(
      service.recordClick("ad-1", "203.0.113.7", raw),
    ).resolves.toBeUndefined();

    expect(advertisement.findUnique).not.toHaveBeenCalled();
    expect(adHotspot.findFirst).not.toHaveBeenCalled();
    expect(cache.setIfAbsent).not.toHaveBeenCalled();
  });

  it("yayında olmayan reklamın alanı sayılmaz", async () => {
    const { service, adHotspot, $transaction } = makeService(
      liveAd({ imageUrl: "https://cdn.test/a.png", linkUrl: null, isActive: false }),
    );
    await service.recordClick("ad-1", "203.0.113.7", HOTSPOT);
    expect(adHotspot.findFirst).not.toHaveBeenCalled();
    expect($transaction).not.toHaveBeenCalled();
  });

  it("pencere içindeki tekrar alan tıkı sayılmaz", async () => {
    const { service, $transaction } = makeService(imageAd(), false);
    await service.recordClick("ad-1", "203.0.113.7", HOTSPOT);
    expect($transaction).not.toHaveBeenCalled();
  });

  it("alansız tık görselli reklamda yok sayılır", async () => {
    const { service, advertisement, cache } = makeService(imageAd());
    await service.recordClick("ad-1", "203.0.113.7");
    expect(cache.setIfAbsent).not.toHaveBeenCalled();
    expect(advertisement.updateMany).not.toHaveBeenCalled();
  });

  it("alansız tık bağlantısız metin reklamda yok sayılır", async () => {
    const { service, advertisement } = makeService(liveAd({ linkUrl: null }));
    await service.recordClick("ad-1", "203.0.113.7");
    expect(advertisement.updateMany).not.toHaveBeenCalled();
  });

  it("boş `?hotspot=` gönderilmemiş sayılır: metin reklam tıkı sayılır", async () => {
    const { service, advertisement, adHotspot } = makeService();
    await service.recordClick("ad-1", "203.0.113.7", "");
    expect(adHotspot.findFirst).not.toHaveBeenCalled();
    expect(advertisement.updateMany).toHaveBeenCalledWith({
      where: { id: "ad-1" },
      data: { clickCount: { increment: 1 } },
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

  it("tık ucu alanı `hotspot` sorgu parametresinden ham okur", () => {
    const args = Reflect.getMetadata(
      ROUTE_ARGS_METADATA,
      AdvertisementController,
      "recordClick",
    ) as Record<string, { data?: unknown }>;
    const query = Object.entries(args).find(([key]) =>
      key.startsWith(`${RouteParamtypes.QUERY}:`),
    );
    expect(query?.[1].data).toBe("hotspot");
  });

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
