import { readFileSync } from "fs";
import { join } from "path";
import {
  HERO_PLACEMENTS,
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
 * sayfa slaytı canlıda bu seed'den gelir. Seed her API açılışında koşar —
 * idempotent olmalı, admin'in düzenlediğini ya da sildiğini geri getirmemeli,
 * ve kurduğu içerik API'nin kendi kurallarından geçmeli (yoksa admin seed
 * slaytını kaydedemezdi).
 */

function makeClient(existing: { slides?: number; badges?: number } = {}) {
  const heroSlide = {
    count: jest.fn().mockResolvedValue(existing.slides ?? 0),
    upsert: jest.fn().mockResolvedValue({}),
  };
  const trustBadge = {
    count: jest.fn().mockResolvedValue(existing.badges ?? 0),
    upsert: jest.fn().mockResolvedValue({}),
  };
  return { heroSlide, trustBadge } as const;
}

describe("seedHeroContent", () => {
  it("boş veritabanına her yerleşime bir slayt ve altı rozet kurar", async () => {
    const client = makeClient();
    await seedHeroContent(client as never);

    expect(client.heroSlide.upsert).toHaveBeenCalledTimes(3);
    expect(client.trustBadge.upsert).toHaveBeenCalledTimes(6);
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

  it("yerleşimde admin'in slaytı varsa (seed silinmiş olsa da) yazmaz", async () => {
    const client = makeClient({ slides: 1, badges: 4 });
    await seedHeroContent(client as never);

    expect(client.heroSlide.upsert).not.toHaveBeenCalled();
    expect(client.trustBadge.upsert).not.toHaveBeenCalled();
    expect(client.heroSlide.count.mock.calls.map(([a]) => a.where)).toEqual(
      HERO_PLACEMENTS.map((placement) => ({ placement })),
    );
  });
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
        expect(validateLocalizedText(value, { maxLength, required: false })).toBeNull();
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
