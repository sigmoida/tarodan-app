import { HttpStatus } from "@nestjs/common";
import {
  HTTP_CODE_METADATA,
  ROUTE_ARGS_METADATA,
} from "@nestjs/common/constants";
import { RouteParamtypes } from "@nestjs/common/enums/route-paramtypes.enum";
import { HeroTrackingService } from "./hero-tracking.service";
import { HeroSlideController } from "./hero-slide.controller";
import { parseHeroCtaParam } from "./helpers/hero-tracking.helper";
import { clientIpThrottleTracker } from "../../common/helpers/client-ip";
import type { PrismaService } from "../../prisma";
import type { CacheService } from "../cache/cache.service";

/**
 * Hero tık/gösterim sayımı: yalnız yayındaki slayt, IP + slayt (+ buton)
 * başına pencere içinde bir kez (gösterim 30 dk, tık 10 sn — reklamla aynı).
 * Buton tıkı slayt toplamını da artırır; olmayan butona tık sayılmaz.
 * Sayılmayan istek de sessizce kabul edilir — beacon yanıtı okumaz.
 */

const NOW = new Date("2026-10-12T12:00:00Z");
const IP = "203.0.113.7";

const liveSlide = (over: Record<string, unknown> = {}) => ({
  isActive: true,
  startDate: null,
  endDate: null,
  cta1Label: { tr: "İlanlar" },
  cta1Href: "/listings",
  cta2Label: null,
  cta2Href: null,
  ...over,
});

function makeService(
  slide: Record<string, unknown> | null = liveSlide(),
  firstInWindow = true,
) {
  const heroSlide = {
    findUnique: jest.fn().mockResolvedValue(slide),
    updateMany: jest.fn().mockResolvedValue({ count: 1 }),
  };
  const cache = { setIfAbsent: jest.fn().mockResolvedValue(firstInWindow) };
  const service = new HeroTrackingService(
    { heroSlide } as unknown as PrismaService,
    cache as unknown as CacheService,
  );
  return { service, heroSlide, cache };
}

describe("HeroTrackingService", () => {
  beforeEach(() => jest.useFakeTimers().setSystemTime(NOW));
  afterEach(() => jest.useRealTimers());

  it("gösterimi sayar; anahtar IP + slayt, pencere 30 dk", async () => {
    const { service, heroSlide, cache } = makeService();
    await service.recordImpression("s-1", IP);
    expect(cache.setIfAbsent).toHaveBeenCalledWith(
      `hero:dedupe:impression:s-1:${IP}`,
      1800,
    );
    expect(heroSlide.updateMany).toHaveBeenCalledWith({
      where: { id: "s-1" },
      data: { impressionCount: { increment: 1 } },
    });
  });

  it("butonsuz tık slayt toplamını sayar; pencere 10 sn", async () => {
    const { service, heroSlide, cache } = makeService();
    await service.recordClick("s-1", IP);
    expect(cache.setIfAbsent).toHaveBeenCalledWith(
      `hero:dedupe:click:s-1:${IP}`,
      10,
    );
    expect(heroSlide.updateMany).toHaveBeenCalledWith({
      where: { id: "s-1" },
      data: { clickCount: { increment: 1 } },
    });
  });

  it("buton tıkı slayt toplamı ile buton sayacını aynı yazımda artırır; anahtar butonu taşır", async () => {
    const { service, heroSlide, cache } = makeService();
    await service.recordClick("s-1", IP, "1");
    expect(cache.setIfAbsent).toHaveBeenCalledWith(
      `hero:dedupe:click:s-1:cta1:${IP}`,
      10,
    );
    expect(heroSlide.updateMany).toHaveBeenCalledTimes(1);
    expect(heroSlide.updateMany).toHaveBeenCalledWith({
      where: { id: "s-1" },
      data: {
        clickCount: { increment: 1 },
        cta1ClickCount: { increment: 1 },
      },
    });
  });

  it("ikinci buton kendi sayacını artırır", async () => {
    const { service, heroSlide } = makeService(
      liveSlide({ cta2Label: { tr: "Koleksiyonlar" }, cta2Href: "/collections" }),
    );
    await service.recordClick("s-1", IP, "2");
    expect(heroSlide.updateMany.mock.calls[0][0].data).toEqual({
      clickCount: { increment: 1 },
      cta2ClickCount: { increment: 1 },
    });
  });

  it("slaytta olmayan butona tık yok sayılır, anahtar yakılmaz", async () => {
    const { service, heroSlide, cache } = makeService();
    await service.recordClick("s-1", IP, "2");
    expect(cache.setIfAbsent).not.toHaveBeenCalled();
    expect(heroSlide.updateMany).not.toHaveBeenCalled();
  });

  it("pencere içindeki tekrar sayılmaz", async () => {
    const { service, heroSlide } = makeService(liveSlide(), false);
    await service.recordClick("s-1", IP, "1");
    await service.recordImpression("s-1", IP);
    expect(heroSlide.updateMany).not.toHaveBeenCalled();
  });

  it.each([
    ["bilinmeyen slayt", null],
    ["pasif slayt", liveSlide({ isActive: false })],
    ["süresi bitmiş slayt", liveSlide({ endDate: new Date("2026-10-01") })],
    ["henüz başlamamış slayt", liveSlide({ startDate: new Date("2026-11-01") })],
  ])("%s: hata vermeden yok sayılır, anahtar yakılmaz", async (_d, slide) => {
    const { service, heroSlide, cache } = makeService(slide);
    await expect(service.recordImpression("s-1", IP)).resolves.toBeUndefined();
    await expect(service.recordClick("s-1", IP, "1")).resolves.toBeUndefined();
    expect(cache.setIfAbsent).not.toHaveBeenCalled();
    expect(heroSlide.updateMany).not.toHaveBeenCalled();
  });

  it.each([
    ["3", "3"],
    ["metin", "abc"],
    ["tekrarlanan parametre", ["1", "1"]],
  ])("geçersiz `cta` (%s): sorgusuz yok sayılır", async (_d, raw) => {
    const { service, heroSlide, cache } = makeService();
    await expect(service.recordClick("s-1", IP, raw)).resolves.toBeUndefined();
    expect(heroSlide.findUnique).not.toHaveBeenCalled();
    expect(cache.setIfAbsent).not.toHaveBeenCalled();
  });
});

describe("parseHeroCtaParam", () => {
  it.each([
    [undefined, undefined],
    ["", undefined],
    ["1", 1],
    ["2", 2],
    ["0", null],
    ["3", null],
    [["1"], null],
  ])("%p → %p", (raw, expected) => {
    expect(parseHeroCtaParam(raw)).toBe(expected);
  });
});

describe("HeroSlideController — tık/gösterim uçları", () => {
  const proto = HeroSlideController.prototype as unknown as Record<
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

  it("tık ucu butonu `cta` sorgu parametresinden ham okur", () => {
    const args = Reflect.getMetadata(
      ROUTE_ARGS_METADATA,
      HeroSlideController,
      "recordClick",
    ) as Record<string, { data?: unknown }>;
    const query = Object.entries(args).find(([key]) =>
      key.startsWith(`${RouteParamtypes.QUERY}:`),
    );
    expect(query?.[1].data).toBe("cta");
  });

  it("gövde parametresi almaz (sendBeacon text/plain ya da boş gönderir)", () => {
    for (const name of ["recordClick", "recordImpression"]) {
      const args =
        (Reflect.getMetadata(ROUTE_ARGS_METADATA, HeroSlideController, name) as
          | Record<string, unknown>
          | undefined) ?? {};
      expect(
        Object.keys(args).some((key) =>
          key.startsWith(`${RouteParamtypes.BODY}:`),
        ),
      ).toBe(false);
    }
  });

  it("vitrin uçları herkese açıktır", () => {
    expect(Reflect.getMetadata("isPublic", HeroSlideController)).toBe(true);
  });
});
