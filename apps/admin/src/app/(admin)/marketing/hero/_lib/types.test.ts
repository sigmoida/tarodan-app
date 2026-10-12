import { describe, expect, it } from "vitest";
import { HERO_TEXT_LIMITS } from "@tarodan/types";
import {
  emptyHeroForm,
  heroFormToPayload,
  heroSchema,
  heroToForm,
  type HeroFormValues,
  type HeroSlide,
} from "./types";

// Çeviri taklidi: anahtarı (ve değişkenleri) geri verir.
const t = ((key: string, vars?: Record<string, unknown>) =>
  vars ? `${key}:${JSON.stringify(vars)}` : key) as never;

const valid: HeroFormValues = {
  ...emptyHeroForm("home"),
  imageUrl: "https://cdn/x.png",
  titleTr: "Başlık",
};

const issues = (v: Partial<HeroFormValues>) => {
  const r = heroSchema(t).safeParse({ ...valid, ...v });
  return r.success
    ? []
    : r.error.issues.map((i) => [String(i.path[0]), i.message]);
};

describe("heroSchema", () => {
  it("accepts a minimal slide (TR title + desktop image)", () => {
    expect(issues({})).toEqual([]);
  });

  it("requires the TR title but not EN", () => {
    expect(issues({ titleTr: "" })).toEqual([
      ["titleTr", "admin.marketing.hero.validation.trRequired"],
    ]);
    expect(issues({ titleEn: "" })).toEqual([]);
  });

  it("rejects EN text without its TR counterpart on optional fields", () => {
    expect(issues({ subtitleEn: "Sub" })).toEqual([
      ["subtitleTr", "admin.marketing.hero.validation.trRequiredForEn"],
    ]);
  });

  it("requires the desktop image", () => {
    expect(issues({ imageUrl: " " })).toEqual([
      ["imageUrl", "admin.marketing.hero.validation.imageRequired"],
    ]);
  });

  it("enforces the shared text limits", () => {
    const over = "x".repeat(HERO_TEXT_LIMITS.title + 1);
    expect(issues({ titleTr: over }).map(([f]) => f)).toEqual(["titleTr"]);
    const longCta = "x".repeat(HERO_TEXT_LIMITS.ctaLabel + 1);
    expect(
      issues({ cta1LabelTr: longCta, cta1Href: "/a" }).map(([f]) => f),
    ).toEqual(["cta1LabelTr"]);
  });

  it("pairs a CTA label with a link, both ways", () => {
    expect(issues({ cta1LabelTr: "Git" })).toEqual([
      ["cta1Href", "admin.marketing.hero.validation.ctaHrefRequired"],
    ]);
    expect(issues({ cta2Href: "/kategori" })).toEqual([
      ["cta2LabelTr", "admin.marketing.hero.validation.ctaLabelRequired"],
    ]);
    expect(issues({ cta1LabelTr: "Git", cta1Href: "/kategori" })).toEqual([]);
  });

  it("validates CTA links like ad links", () => {
    expect(issues({ cta1LabelTr: "Git", cta1Href: "//evil.com" })).toEqual([
      ["cta1Href", "admin.marketing.hero.validation.linkInvalid"],
    ]);
    expect(
      issues({ cta1LabelTr: "Git", cta1Href: "https://tarodan.com/x" }),
    ).toEqual([]);
  });

  it("rejects an end date before the start date", () => {
    expect(issues({ startDate: "2026-07-10", endDate: "2026-07-01" })).toEqual([
      ["endDate", "admin.marketing.hero.validation.endBeforeStart"],
    ]);
  });
});

describe("heroFormToPayload", () => {
  it("create omits empty optional fields", () => {
    const p = heroFormToPayload(valid, "create");
    expect(p.subtitle).toBeUndefined();
    expect(p.cta1Label).toBeUndefined();
    expect(p.cta1Href).toBeUndefined();
    expect(p.mobileImageUrl).toBeUndefined();
    expect(p.startDate).toBeUndefined();
    expect(p.title).toEqual({ tr: "Başlık", en: null });
  });

  it("update sends null to clear emptied fields", () => {
    const p = heroFormToPayload(valid, "update");
    expect(p.subtitle).toBeNull();
    expect(p.imageAlt).toBeNull();
    expect(p.cta1Label).toBeNull();
    expect(p.cta1Href).toBeNull();
    expect(p.cta2Label).toBeNull();
    expect(p.mobileImageUrl).toBeNull();
    expect(p.startDate).toBeNull();
    expect(p.endDate).toBeNull();
  });

  it("maps filled fields: trimmed, EN nulled when blank, Istanbul day bounds", () => {
    const p = heroFormToPayload(
      {
        ...valid,
        titleEn: "Title",
        subtitleTr: " Alt ",
        cta1LabelTr: "Git",
        cta1Href: " /kategori ",
        hideOnIos: true,
        startDate: "2026-07-01",
        endDate: "2026-07-31",
      },
      "update",
    );
    expect(p.title).toEqual({ tr: "Başlık", en: "Title" });
    expect(p.subtitle).toEqual({ tr: "Alt", en: null });
    expect(p.cta1Href).toBe("/kategori");
    expect(p.hideOnIos).toBe(true);
    expect(p.startDate).toBe("2026-07-01T00:00:00.000+03:00");
    expect(p.endDate).toBe("2026-07-31T23:59:59.999+03:00");
  });
});

describe("heroToForm", () => {
  const slide = {
    id: "1",
    placement: "auth_default",
    isActive: false,
    displayOrder: 2,
    startDate: "2026-06-30T21:00:00.000Z",
    endDate: null,
    imageUrl: "https://cdn/x.png",
    mobileImageUrl: null,
    imageSide: "left",
    title: { tr: "Başlık", en: "Title" },
    subtitle: null,
    imageAlt: null,
    cta1Label: { tr: "Git", en: null },
    cta1Href: "/x",
    cta2Label: null,
    cta2Href: null,
    hideOnIos: true,
  } as unknown as HeroSlide;

  it("seeds the form from a stored slide (Istanbul calendar day)", () => {
    const f = heroToForm(slide);
    expect(f).toMatchObject({
      placement: "auth_default",
      imageSide: "left",
      titleTr: "Başlık",
      titleEn: "Title",
      subtitleTr: "",
      cta1LabelTr: "Git",
      cta1Href: "/x",
      mobileImageUrl: "",
      hideOnIos: true,
      isActive: false,
      startDate: "2026-07-01",
      endDate: "",
    });
  });
});
