import { readFileSync } from "fs";
import { join } from "path";
import {
  HERO_PLACEMENTS,
  HERO_SEED_APPLIED_SETTING,
  HERO_TEXT_LIMITS,
  TRUST_BADGE_ICONS,
  TRUST_BADGE_LIMITS,
  validateLocalizedText,
} from "@tarodan/types";
import {
  HERO_SEED_SLIDES,
  TRUST_BADGE_SEED,
  seedHeroContent,
} from "../../../prisma/seed-hero-content";
import { isAdLinkUrl } from "../../modules/advertisement/helpers/ad-link-url.validator";
import { apiAppRoot } from "./app-root";

/**
 * Vitrin hero'sunun referans seed'i: kodda yedek slayt olmadığı için ana
 * sayfa slaytı ilk kurulumda bu seed'den gelir. Seed her API açılışında koşar
 * — YALNIZ BİR KEZ içerik yazmalı (`hero_seed_applied` işareti): admin'in
 * düzenlediğini ezmemeli, sildiğini (yerleşimi bilerek boşaltmış olabilir)
 * geri getirmemeli; kurduğu içerik API'nin kendi kurallarından geçmeli (yoksa
 * admin seed slaytını kaydedemezdi).
 */

function makeClient(
  existing: { slides?: number; badges?: number; applied?: boolean } = {},
) {
  // Upsert'ler işlem dizisine girdiği için tanınabilir işaretler döner.
  const heroSlide = {
    count: jest.fn().mockResolvedValue(existing.slides ?? 0),
    upsert: jest.fn().mockReturnValue("slide-op"),
  };
  const trustBadge = {
    count: jest.fn().mockResolvedValue(existing.badges ?? 0),
    upsert: jest.fn().mockReturnValue("badge-op"),
  };
  const platformSetting = {
    findUnique: jest
      .fn()
      .mockResolvedValue(existing.applied ? { id: "setting-1" } : null),
    upsert: jest.fn().mockReturnValue("marker-op"),
  };
  const $transaction = jest.fn().mockResolvedValue([]);
  return { heroSlide, trustBadge, platformSetting, $transaction } as const;
}

describe("seedHeroContent", () => {
  it("ilk kurulum: her yerleşime bir slayt ve altı rozet kurar, sonra işaretler", async () => {
    const client = makeClient();
    await seedHeroContent(client as never);

    expect(client.heroSlide.upsert).toHaveBeenCalledTimes(3);
    expect(client.trustBadge.upsert).toHaveBeenCalledTimes(6);
    expect(client.platformSetting.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { settingKey: HERO_SEED_APPLIED_SETTING },
        create: expect.objectContaining({
          settingKey: "hero_seed_applied",
          settingValue: "true",
        }),
        update: {},
      }),
    );
    // İçerik + işaret TEK işlemde: yarıda kesilen ilk kurulum yarım içerik
    // bırakıp "işaretten önceki kurulum" sanılmasın.
    expect(client.$transaction).toHaveBeenCalledTimes(1);
    expect(client.$transaction).toHaveBeenCalledWith([
      ...Array(3).fill("slide-op"),
      ...Array(6).fill("badge-op"),
      "marker-op",
    ]);
  });

  it("işaret varsa hiçbir şey yazmaz — boşaltılmış yerleşim boş kalır", async () => {
    const client = makeClient({ applied: true });
    await seedHeroContent(client as never);

    expect(client.platformSetting.findUnique).toHaveBeenCalledWith({
      where: { settingKey: HERO_SEED_APPLIED_SETTING },
      select: { id: true },
    });
    expect(client.heroSlide.count).not.toHaveBeenCalled();
    expect(client.heroSlide.upsert).not.toHaveBeenCalled();
    expect(client.trustBadge.upsert).not.toHaveBeenCalled();
    expect(client.platformSetting.upsert).not.toHaveBeenCalled();
    expect(client.$transaction).not.toHaveBeenCalled();
  });

  it("idempotent: sabit kimlikle upsert eder ve var olan satıra dokunmaz", async () => {
    const client = makeClient();
    await seedHeroContent(client as never);

    for (const [call] of [
      ...client.heroSlide.upsert.mock.calls,
      ...client.trustBadge.upsert.mock.calls,
    ]) {
      expect(call.update).toEqual({});
      expect(call.where).toEqual({ id: call.create.id });
    }
  });

  it.each([
    ["slayt var", { slides: 1, badges: 0 }],
    ["yalnız rozet var (ana sayfa boşaltılmış)", { slides: 0, badges: 4 }],
  ])(
    "işaretten önceki kurulum (%s): içerik eklemez, yalnız işaretler",
    async (_d, existing) => {
      const client = makeClient(existing);
      await seedHeroContent(client as never);

      expect(client.heroSlide.upsert).not.toHaveBeenCalled();
      expect(client.trustBadge.upsert).not.toHaveBeenCalled();
      expect(client.platformSetting.upsert).toHaveBeenCalledTimes(1);
      expect(client.$transaction).not.toHaveBeenCalled();
    },
  );
});

describe("hero seed içeriği", () => {
  it("her yerleşime tek slayt; kimlikler tekil", () => {
    expect(HERO_SEED_SLIDES.map((s) => s.placement).sort()).toEqual(
      [...HERO_PLACEMENTS].sort(),
    );
    const ids = [...HERO_SEED_SLIDES, ...TRUST_BADGE_SEED].map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("ana sayfa slaytı bugünkü web slaytıdır (iki buton, https görsel)", () => {
    const home = HERO_SEED_SLIDES.find((s) => s.placement === "home");
    expect(home).toMatchObject({
      imageUrl: expect.stringMatching(/^https:\/\/.+\/hero-marketplace\.png$/),
      cta1Href: "/collections",
      cta2Href: "/listings",
    });
  });

  it.each(HERO_SEED_SLIDES.map((s) => [s.placement, s] as const))(
    "%s slaytı API'nin metin ve bağlantı kurallarından geçer",
    (_p, slide) => {
      expect(
        validateLocalizedText(slide.title, {
          maxLength: HERO_TEXT_LIMITS.title,
          required: true,
        }),
      ).toBeNull();
      for (const [value, maxLength] of [
        [slide.subtitle, HERO_TEXT_LIMITS.subtitle],
        [slide.imageAlt, HERO_TEXT_LIMITS.imageAlt],
        [slide.cta1Label, HERO_TEXT_LIMITS.ctaLabel],
        [slide.cta2Label, HERO_TEXT_LIMITS.ctaLabel],
      ] as const) {
        expect(
          validateLocalizedText(value, { maxLength, required: false }),
        ).toBeNull();
      }
      for (const href of [slide.cta1Href, slide.cta2Href]) {
        if (href) expect(isAdLinkUrl(href)).toBe(true);
      }
      // Buton etiketi ve hedefi birlikte var ya da yok.
      expect(Boolean(slide.cta1Label)).toBe(Boolean(slide.cta1Href));
      expect(Boolean(slide.cta2Label)).toBe(Boolean(slide.cta2Href));
      expect(slide.imageUrl).toMatch(/^https:\/\//);
    },
  );

  it("rozetler sabit ikon listesinden ve metin sınırları içinde", () => {
    expect(TRUST_BADGE_SEED.map((b) => b.icon)).toEqual([...TRUST_BADGE_ICONS]);
    for (const badge of TRUST_BADGE_SEED) {
      expect(
        validateLocalizedText(badge.title, {
          maxLength: TRUST_BADGE_LIMITS.title,
          required: true,
        }),
      ).toBeNull();
      expect(
        validateLocalizedText(badge.description, {
          maxLength: TRUST_BADGE_LIMITS.description,
          required: false,
        }),
      ).toBeNull();
    }
  });

  it("iade süresi metne gömülmez, Süreler ve Kurallar belirteciyle gelir", () => {
    const text = JSON.stringify(TRUST_BADGE_SEED);
    expect(text).toContain("{returnWindowDays}");
    expect(text).not.toMatch(/\b14 gün\b/);
  });

  it("açılışta koşan referans seed'e ve yerel demo seed'ine bağlıdır", () => {
    const read = (file: string) =>
      readFileSync(join(apiAppRoot(), "prisma", file), "utf8");
    for (const file of ["seed-production.ts", "seed.ts"]) {
      const source = read(file);
      expect(source).toContain('from "./seed-hero-content"');
      expect(source).toContain("await seedHeroContent(prisma)");
    }
  });
});
