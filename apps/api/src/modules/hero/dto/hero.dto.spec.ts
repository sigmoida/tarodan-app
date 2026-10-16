import {
  BadRequestException,
  ValidationPipe,
  type ArgumentMetadata,
} from "@nestjs/common";
import { GLOBAL_VALIDATION_PIPE_OPTIONS } from "../../../common/validators/global-validation-pipe-options";
import {
  CreateHeroSlideDto,
  HeroSlideQueryDto,
  UpdateHeroSlideDto,
} from "./hero-slide.dto";
import { CreateTrustBadgeDto, UpdateTrustBadgeDto } from "./trust-badge.dto";

/**
 * Hero/rozet gövdeleri GERÇEK global pipe ayarlarıyla dönüştürülür
 * (`whitelist`, `transform`, `enableImplicitConversion`): iki dilli metin
 * nesnesinin bozulmadan geçmesi ve PartialType'ın `null` davranışı yalnız bu
 * yolda görünür.
 */
const pipe = new ValidationPipe(GLOBAL_VALIDATION_PIPE_OPTIONS);

const as = async <T>(
  metatype: new () => T,
  body: Record<string, unknown>,
  type: ArgumentMetadata["type"] = "body",
): Promise<Record<string, unknown>> => {
  const metadata: ArgumentMetadata = { type, metatype, data: "" };
  return (await pipe.transform(body, metadata)) as Record<string, unknown>;
};

const validSlide = {
  placement: "home",
  imageUrl: "https://cdn.test/hero.png",
  title: { tr: "Başlık", en: "Title" },
};

describe("CreateHeroSlideDto", () => {
  it("iki dilli metni olduğu gibi taşır", async () => {
    const dto = await as(CreateHeroSlideDto, {
      ...validSlide,
      subtitle: { tr: "Alt", en: null },
      cta1Label: { tr: "İlanlar" },
      cta1Href: "/listings",
    });
    expect(dto.title).toEqual({ tr: "Başlık", en: "Title" });
    expect(dto.subtitle).toEqual({ tr: "Alt", en: null });
    expect(dto.cta1Label).toEqual({ tr: "İlanlar" });
  });

  it.each([
    ["Türkçe başlık eksik", { title: { en: "Title" } }],
    ["başlık boş", { title: { tr: "  " } }],
    ["başlık düz metin", { title: "Başlık" }],
    ["başlık 120 karakteri aşıyor", { title: { tr: "a".repeat(121) } }],
    [
      "İngilizce başlık 120 karakteri aşıyor",
      { title: { tr: "a", en: "b".repeat(121) } },
    ],
    ["bilinmeyen dil", { title: { tr: "a", de: "b" } }],
    ["alt başlık 240 karakteri aşıyor", { subtitle: { tr: "a".repeat(241) } }],
    [
      "buton etiketi 40 karakteri aşıyor",
      { cta1Label: { tr: "a".repeat(41) } },
    ],
    [
      "görsel metni 160 karakteri aşıyor",
      { imageAlt: { tr: "a".repeat(161) } },
    ],
    ["javascript: hedef", { cta1Href: "javascript:alert(1)" }],
    ["protokol-göreli hedef", { cta2Href: "//evil.test" }],
    ["http görsel", { imageUrl: "http://cdn.test/hero.png" }],
    ["bilinmeyen yerleşim", { placement: "footer" }],
    ["bilinmeyen görsel tarafı", { imageSide: "top" }],
    ["yerleşim eksik", { placement: undefined }],
    ["bilinmeyen platform", { platform: "ios" }],
  ])("%s → 400", async (_d, over) => {
    await expect(
      as(CreateHeroSlideDto, { ...validSlide, ...over }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("site içi yol ve mutlak https hedef kabul edilir", async () => {
    const dto = await as(CreateHeroSlideDto, {
      ...validSlide,
      cta1Href: "/listings?sort=new",
      cta2Href: "https://example.com/kampanya",
    });
    expect(dto.cta1Href).toBe("/listings?sort=new");
    expect(dto.cta2Href).toBe("https://example.com/kampanya");
  });

  it.each(["web", "app", "all"])(
    "platform %s kabul edilir",
    async (platform) => {
      const dto = await as(CreateHeroSlideDto, { ...validSlide, platform });
      expect(dto.platform).toBe(platform);
    },
  );
});

describe("UpdateHeroSlideDto", () => {
  it("yalnız gönderilen alanı taşır — varsayılanlar PATCH'e sızmaz", async () => {
    expect(await as(UpdateHeroSlideDto, { isActive: false })).toEqual({
      isActive: false,
    });
  });

  it.each([
    "subtitle",
    "imageAlt",
    "cta1Label",
    "cta1Href",
    "cta2Label",
    "cta2Href",
    "mobileImageUrl",
    "startDate",
    "endDate",
  ])("temizlenebilir alan %s: null kabul edilir", async (field) => {
    const dto = await as(UpdateHeroSlideDto, { [field]: null });
    expect(dto[field]).toBeNull();
  });

  it.each([
    "title",
    "placement",
    "imageUrl",
    "isActive",
    "hideOnIos",
    "imageSide",
    "platform",
  ])("zorunlu alan %s: null → 400", async (field) => {
    await expect(
      as(UpdateHeroSlideDto, { [field]: null }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe("HeroSlideQueryDto", () => {
  it("yerleşim zorunludur ve bilinen değerlerden biridir", async () => {
    await expect(
      as(HeroSlideQueryDto, { placement: "auth_register" }, "query"),
    ).resolves.toEqual({ placement: "auth_register" });
    await expect(as(HeroSlideQueryDto, {}, "query")).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(
      as(HeroSlideQueryDto, { placement: "sidebar" }, "query"),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("platform isteğe bağlıdır; yalnız istemci değerleri (web/app) geçer", async () => {
    await expect(
      as(HeroSlideQueryDto, { placement: "home", platform: "web" }, "query"),
    ).resolves.toEqual({ placement: "home", platform: "web" });
    await expect(
      as(HeroSlideQueryDto, { placement: "home", platform: "app" }, "query"),
    ).resolves.toEqual({ placement: "home", platform: "app" });
    // `all` bir hedeftir, istemci değil.
    for (const platform of ["all", "ios", ""]) {
      await expect(
        as(HeroSlideQueryDto, { placement: "home", platform }, "query"),
      ).rejects.toBeInstanceOf(BadRequestException);
    }
  });
});

describe("CreateTrustBadgeDto / UpdateTrustBadgeDto", () => {
  it("sabit ikon listesinden ikon + Türkçe başlık ister", async () => {
    const dto = await as(CreateTrustBadgeDto, {
      icon: "shield-check",
      title: { tr: "Güvenli Alışveriş" },
      description: { tr: "{returnWindowDays} gün koşulsuz iade" },
    });
    expect(dto.icon).toBe("shield-check");
    expect(dto.description).toEqual({
      tr: "{returnWindowDays} gün koşulsuz iade",
    });
  });

  it.each([
    ["bilinmeyen ikon", { icon: "rocket" }],
    ["başlık 60 karakteri aşıyor", { title: { tr: "a".repeat(61) } }],
    ["açıklama 160 karakteri aşıyor", { description: { tr: "a".repeat(161) } }],
    ["Türkçe başlık eksik", { title: { en: "Secure" } }],
  ])("%s → 400", async (_d, over) => {
    await expect(
      as(CreateTrustBadgeDto, {
        icon: "truck",
        title: { tr: "Güvenli Kargo" },
        ...over,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("güncellemede açıklama temizlenebilir, başlık temizlenemez", async () => {
    await expect(
      as(UpdateTrustBadgeDto, { description: null }),
    ).resolves.toEqual({ description: null });
    await expect(
      as(UpdateTrustBadgeDto, { title: null }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
