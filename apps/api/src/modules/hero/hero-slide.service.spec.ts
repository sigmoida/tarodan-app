import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from "@nestjs/common";
import { Prisma, type HeroSlide } from "@prisma/client";
import { HeroSlideService } from "./hero-slide.service";
import { HERO_IMAGE_UPLOAD } from "./helpers/hero.constants";
import type { PrismaService } from "../../prisma";
import type { MediaService } from "../media/media.service";
import { notifyWebRevalidate } from "../../common/helpers/revalidate";

jest.mock("../../common/helpers/revalidate", () => ({
  notifyWebRevalidate: jest.fn().mockResolvedValue(undefined),
}));

/**
 * Hero slaytları: yayın kuralı + sıra, aynı anda en çok 5 yayında slayt,
 * yayındaki son ana sayfa slaytının korunması, iki dilli metin normalizasyonu,
 * buton çifti kuralı ve her yazımdan sonra web'in ilgili etiketinin
 * tazelenmesi.
 */

const NOW = new Date("2026-10-12T12:00:00Z");
const day = (offset: number) => new Date(NOW.getTime() + offset * 86_400_000);

const row = (over: Partial<HeroSlide> = {}): HeroSlide => ({
  id: "slide-1",
  placement: "home",
  isActive: true,
  displayOrder: 0,
  startDate: null,
  endDate: null,
  imageUrl: "https://cdn.test/hero.png",
  mobileImageUrl: null,
  imageSide: "right",
  title: { tr: "Başlık", en: "Title" },
  subtitle: null,
  imageAlt: null,
  cta1Label: { tr: "İlanlar", en: null },
  cta1Href: "/listings",
  cta2Label: null,
  cta2Href: null,
  hideOnIos: false,
  impressionCount: 10,
  clickCount: 3,
  cta1ClickCount: 2,
  cta2ClickCount: 0,
  createdAt: new Date("2026-10-01T00:00:00Z"),
  updatedAt: new Date("2026-10-02T00:00:00Z"),
  ...over,
});

const OPEN = { startDate: null, endDate: null };

function makeService() {
  const heroSlide = {
    findMany: jest.fn().mockResolvedValue([]),
    findUnique: jest.fn().mockResolvedValue(row()),
    create: jest
      .fn()
      .mockImplementation(({ data }) => Promise.resolve(row({ ...data }))),
    update: jest
      .fn()
      .mockImplementation(({ data }) => Promise.resolve(row({ ...data }))),
    delete: jest.fn().mockResolvedValue(row()),
    count: jest.fn().mockResolvedValue(1),
    aggregate: jest.fn().mockResolvedValue({ _max: { displayOrder: 2 } }),
  };
  const $transaction = jest.fn().mockResolvedValue([]);
  const media = {
    upload: jest.fn().mockResolvedValue({ url: "https://cdn.test/hero/x.png" }),
  };
  const service = new HeroSlideService(
    { heroSlide, $transaction } as unknown as PrismaService,
    media as unknown as MediaService,
  );
  return { service, heroSlide, $transaction, media };
}

const createDto = (over: Record<string, unknown> = {}) =>
  ({
    placement: "home",
    imageUrl: "https://cdn.test/hero.png",
    title: { tr: " Başlık ", en: "  " },
    ...over,
  }) as never;

describe("HeroSlideService — vitrin okuması", () => {
  beforeEach(() => jest.useFakeTimers().setSystemTime(NOW));
  afterEach(() => jest.useRealTimers());

  it("yerleşimin yayındaki slaytlarını sırasıyla, en çok 5 tane okur", async () => {
    const { service, heroSlide } = makeService();
    await service.listLive("home");
    expect(heroSlide.findMany).toHaveBeenCalledWith({
      where: {
        placement: "home",
        isActive: true,
        AND: [
          { OR: [{ startDate: null }, { startDate: { lte: NOW } }] },
          { OR: [{ endDate: null }, { endDate: { gte: NOW } }] },
        ],
      },
      orderBy: [{ displayOrder: "asc" }, { createdAt: "asc" }],
      take: 5,
    });
  });

  it("public şekil: iki dil, eksik butonsuz, sayaç/durum alanı yok", async () => {
    const { service, heroSlide } = makeService();
    heroSlide.findMany.mockResolvedValueOnce([
      row({ cta2Label: { tr: "Yarım" }, cta2Href: null }),
    ]);

    const [slide] = await service.listLive("home");

    expect(slide).toEqual({
      id: "slide-1",
      placement: "home",
      imageUrl: "https://cdn.test/hero.png",
      mobileImageUrl: null,
      imageSide: "right",
      title: { tr: "Başlık", en: "Title" },
      subtitle: null,
      imageAlt: null,
      cta1: { label: { tr: "İlanlar", en: null }, href: "/listings" },
      // Etiketi var ama hedefi yok: gösterilmez.
      cta2: null,
      hideOnIos: false,
    });
  });

  it("veritabanı süzmesinden kaçan yayında olmayan slaytı göstermez", async () => {
    const { service, heroSlide } = makeService();
    heroSlide.findMany.mockResolvedValueOnce([
      row({ id: "a" }),
      row({ id: "b", endDate: day(-1) }),
    ]);
    const slides = await service.listLive("home");
    expect(slides.map((s) => s.id)).toEqual(["a"]);
  });
});

describe("HeroSlideService.create", () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(NOW);
    (notifyWebRevalidate as jest.Mock).mockClear();
  });
  afterEach(() => jest.useRealTimers());

  it("varsayılanları uygular, metni normalize eder, sona ekler", async () => {
    const { service, heroSlide } = makeService();
    await service.create(createDto());

    expect(heroSlide.create.mock.calls[0][0].data).toEqual({
      placement: "home",
      isActive: true,
      displayOrder: 3,
      startDate: null,
      endDate: null,
      imageUrl: "https://cdn.test/hero.png",
      mobileImageUrl: null,
      imageSide: "right",
      title: { tr: "Başlık", en: null },
      subtitle: Prisma.DbNull,
      imageAlt: Prisma.DbNull,
      cta1Label: Prisma.DbNull,
      cta1Href: null,
      cta2Label: Prisma.DbNull,
      cta2Href: null,
      hideOnIos: false,
    });
    expect(notifyWebRevalidate).toHaveBeenCalledWith(["home:hero"]);
  });

  it("auth yerleşimi auth etiketini tazeler", async () => {
    const { service } = makeService();
    await service.create(createDto({ placement: "auth_register" }));
    expect(notifyWebRevalidate).toHaveBeenCalledWith(["auth:hero"]);
  });

  it("buton etiketi hedefsiz → 400 (ctaIncomplete)", async () => {
    const { service, heroSlide } = makeService();
    await expect(
      service.create(createDto({ cta2Label: { tr: "Git" } })),
    ).rejects.toMatchObject({
      response: { i18nKey: "server.hero.ctaIncomplete", i18nParams: { slot: 2 } },
    });
    expect(heroSlide.create).not.toHaveBeenCalled();
  });

  it("buton hedefi etiketsiz → 400; iki dili boş etiket etiketsiz sayılır", async () => {
    const { service } = makeService();
    await expect(
      service.create(
        createDto({ cta1Label: { tr: " ", en: "" }, cta1Href: "/listings" }),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("bitiş başlangıçtan önce → 400", async () => {
    const { service } = makeService();
    await expect(
      service.create(
        createDto({
          startDate: day(2).toISOString(),
          endDate: day(1).toISOString(),
        }),
      ),
    ).rejects.toMatchObject({
      response: { i18nKey: "server.hero.endBeforeStart" },
    });
  });

  it("yerleşimde aynı anda 5 yayında slayt varken altıncı → 409", async () => {
    const { service, heroSlide } = makeService();
    heroSlide.findMany.mockResolvedValueOnce(Array(5).fill(OPEN));

    await expect(service.create(createDto())).rejects.toMatchObject({
      response: { i18nKey: "server.hero.maxLiveSlides", i18nParams: { max: 5 } },
    });
    expect(heroSlide.create).not.toHaveBeenCalled();
    // Sınır, bitmemiş açık slaytlar üzerinden yoklanır.
    expect(heroSlide.findMany.mock.calls[0][0].where).toEqual({
      placement: "home",
      isActive: true,
      OR: [{ endDate: null }, { endDate: { gte: NOW } }],
    });
  });

  it("başka bir slaytın bitişinden sonraya zamanlanan altıncı kabul edilir", async () => {
    const { service, heroSlide } = makeService();
    heroSlide.findMany.mockResolvedValueOnce([
      ...Array(4).fill(OPEN),
      { startDate: null, endDate: day(3) },
    ]);
    await service.create(createDto({ startDate: day(4).toISOString() }));
    expect(heroSlide.create).toHaveBeenCalled();
  });

  it("pasif slayt sınırı yoklamaz", async () => {
    const { service, heroSlide } = makeService();
    await service.create(createDto({ isActive: false }));
    expect(heroSlide.findMany).not.toHaveBeenCalled();
    expect(heroSlide.create).toHaveBeenCalled();
  });
});

describe("HeroSlideService.update", () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(NOW);
    (notifyWebRevalidate as jest.Mock).mockClear();
  });
  afterEach(() => jest.useRealTimers());

  it("bilinmeyen slayt → 404", async () => {
    const { service, heroSlide } = makeService();
    heroSlide.findUnique.mockResolvedValueOnce(null);
    await expect(service.update("x", {})).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it("null temizler, undefined dokunmaz", async () => {
    const { service, heroSlide } = makeService();
    await service.update("slide-1", {
      subtitle: null,
      mobileImageUrl: null,
    } as never);
    const data = heroSlide.update.mock.calls[0][0].data;
    expect(data.subtitle).toBe(Prisma.DbNull);
    expect(data.mobileImageUrl).toBeNull();
    expect(data.title).toBeUndefined();
    expect(data.imageAlt).toBeUndefined();
    expect(data.cta1Label).toBeUndefined();
  });

  it("buton çifti saklı değerle birlikte denetlenir: saklı etiketin hedefi silinemez", async () => {
    const { service, heroSlide } = makeService();
    await expect(
      service.update("slide-1", { cta1Href: null } as never),
    ).rejects.toMatchObject({
      response: { i18nKey: "server.hero.ctaIncomplete", i18nParams: { slot: 1 } },
    });
    expect(heroSlide.update).not.toHaveBeenCalled();
  });

  it("buton etiketi + hedefi birlikte temizlenebilir", async () => {
    const { service, heroSlide } = makeService();
    await service.update("slide-1", {
      cta1Label: null,
      cta1Href: null,
    } as never);
    expect(heroSlide.update).toHaveBeenCalled();
  });

  it.each([
    ["kapatma", { isActive: false }],
    ["bitişi geçmişe çekme", { endDate: "2026-10-01T00:00:00.000Z" }],
    ["başlangıcı ileri atma", { startDate: "2026-11-01T00:00:00.000Z" }],
    ["auth yerleşimine taşıma", { placement: "auth_default" }],
  ])(
    "yayındaki SON ana sayfa slaytında %s → 409",
    async (_d, dto) => {
      const { service, heroSlide } = makeService();
      heroSlide.count.mockResolvedValueOnce(0);
      await expect(
        service.update("slide-1", dto as never),
      ).rejects.toMatchObject({
        response: { i18nKey: "server.hero.lastLiveHomeSlide" },
      });
      expect(heroSlide.update).not.toHaveBeenCalled();
      expect(heroSlide.count.mock.calls[0][0].where).toMatchObject({
        placement: "home",
        id: { not: "slide-1" },
        isActive: true,
      });
    },
  );

  it("yayında başka ana sayfa slaytı varken kapatılabilir", async () => {
    const { service, heroSlide } = makeService();
    heroSlide.count.mockResolvedValueOnce(1);
    await service.update("slide-1", { isActive: false });
    expect(heroSlide.update).toHaveBeenCalled();
  });

  it("auth slaytı son da olsa kapatılabilir (guard yalnız ana sayfa)", async () => {
    const { service, heroSlide } = makeService();
    heroSlide.findUnique.mockResolvedValueOnce(row({ placement: "auth_default" }));
    await service.update("slide-1", { isActive: false });
    expect(heroSlide.count).not.toHaveBeenCalled();
    expect(heroSlide.update).toHaveBeenCalled();
    expect(notifyWebRevalidate).toHaveBeenCalledWith(["auth:hero"]);
  });

  it("açık slaytın metnini düzeltmek sınırı yoklamaz", async () => {
    const { service, heroSlide } = makeService();
    await service.update("slide-1", { title: { tr: "Yeni" } } as never);
    expect(heroSlide.findMany).not.toHaveBeenCalled();
    expect(heroSlide.update.mock.calls[0][0].data.title).toEqual({
      tr: "Yeni",
      en: null,
    });
  });

  it("pasif slaytı açmak sınırı kendisi hariç yoklar", async () => {
    const { service, heroSlide } = makeService();
    heroSlide.findUnique.mockResolvedValueOnce(row({ isActive: false }));
    heroSlide.findMany.mockResolvedValueOnce(Array(5).fill(OPEN));
    await expect(
      service.update("slide-1", { isActive: true }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(heroSlide.findMany.mock.calls[0][0].where.id).toEqual({
      not: "slide-1",
    });
  });

  it("yerleşim değişince iki yüzey de tazelenir", async () => {
    const { service, heroSlide } = makeService();
    heroSlide.findUnique.mockResolvedValueOnce(row({ placement: "auth_default" }));
    await service.update("slide-1", { placement: "home" } as never);
    expect(notifyWebRevalidate).toHaveBeenCalledWith(["auth:hero", "home:hero"]);
  });
});

describe("HeroSlideService.remove", () => {
  beforeEach(() => jest.useFakeTimers().setSystemTime(NOW));
  afterEach(() => jest.useRealTimers());

  it("yayındaki son ana sayfa slaytı silinemez → 409", async () => {
    const { service, heroSlide } = makeService();
    heroSlide.count.mockResolvedValueOnce(0);
    await expect(service.remove("slide-1")).rejects.toMatchObject({
      response: { i18nKey: "server.hero.lastLiveHomeSlide" },
    });
    expect(heroSlide.delete).not.toHaveBeenCalled();
  });

  it("yayında olmayan ana sayfa slaytı serbestçe silinir", async () => {
    const { service, heroSlide } = makeService();
    heroSlide.findUnique.mockResolvedValueOnce(row({ isActive: false }));
    await service.remove("slide-1");
    expect(heroSlide.count).not.toHaveBeenCalled();
    expect(heroSlide.delete).toHaveBeenCalledWith({ where: { id: "slide-1" } });
  });

  it("başka yayında ana sayfa slaytı varsa silinir", async () => {
    const { service, heroSlide } = makeService();
    heroSlide.count.mockResolvedValueOnce(2);
    await service.remove("slide-1");
    expect(heroSlide.delete).toHaveBeenCalled();
  });
});

describe("HeroSlideService.reorder", () => {
  it("dizi sırasını displayOrder olarak tek işlemde yazar", async () => {
    const { service, heroSlide, $transaction } = makeService();
    heroSlide.findMany
      .mockResolvedValueOnce([
        { id: "b", placement: "home" },
        { id: "a", placement: "home" },
      ])
      .mockResolvedValueOnce([]);
    await service.reorder(["b", "a"]);
    expect($transaction).toHaveBeenCalledTimes(1);
    expect(heroSlide.update.mock.calls.map((c) => c[0])).toEqual([
      { where: { id: "b" }, data: { displayOrder: 0 } },
      { where: { id: "a" }, data: { displayOrder: 1 } },
    ]);
  });

  it("bilinmeyen kimlik → 404", async () => {
    const { service, heroSlide, $transaction } = makeService();
    heroSlide.findMany.mockResolvedValueOnce([{ id: "a", placement: "home" }]);
    await expect(service.reorder(["a", "x"])).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect($transaction).not.toHaveBeenCalled();
  });

  it("farklı yerleşimler birlikte sıralanamaz → 400", async () => {
    const { service, heroSlide } = makeService();
    heroSlide.findMany.mockResolvedValueOnce([
      { id: "a", placement: "home" },
      { id: "b", placement: "auth_default" },
    ]);
    await expect(service.reorder(["a", "b"])).rejects.toMatchObject({
      response: { i18nKey: "server.hero.reorderMixedPlacement" },
    });
  });
});

describe("HeroSlideService.uploadImage", () => {
  it("dosya yoksa 400", async () => {
    const { service } = makeService();
    await expect(service.uploadImage(undefined)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it("hero hedefine (hero/, 2400 px, 5 MB) yükler ve yalnız url döner", async () => {
    const { service, media } = makeService();
    const file = { originalname: "a.png" } as Express.Multer.File;
    await expect(service.uploadImage(file)).resolves.toEqual({
      url: "https://cdn.test/hero/x.png",
    });
    expect(media.upload).toHaveBeenCalledWith(file, HERO_IMAGE_UPLOAD);
    expect(HERO_IMAGE_UPLOAD).toMatchObject({
      bucket: "products",
      folder: "hero",
      maxSize: 5 * 1024 * 1024,
      allowedTypes: ["image/jpeg", "image/png", "image/webp"],
      resize: { width: 2400, fit: "inside", withoutEnlargement: true },
    });
  });
});
