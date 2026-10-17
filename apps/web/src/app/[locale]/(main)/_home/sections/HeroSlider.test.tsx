// @vitest-environment jsdom
/** @format */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { HeroSlideDto } from "@tarodan/types";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const track = vi.hoisted(() => vi.fn());

vi.mock("@/lib/api/heroTracking", () => ({ trackHeroEvent: track }));
vi.mock("@/hooks/useVisibilityImpression", () => ({
  useVisibilityImpression: () => undefined,
}));
vi.mock("next-intl", () => ({
  useLocale: () => "tr",
  useTranslations: () => (key: string, values?: { index: number }) =>
    `${key}:${values?.index ?? ""}`,
}));
vi.mock("@/components/marketing/HeroPicture", () => ({
  default: ({ alt }: { alt: string }) => <span data-testid="img">{alt}</span>,
}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({
    href,
    children,
    ...rest
  }: { href: string; children?: React.ReactNode } & Record<
    string,
    unknown
  >) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import HeroSlider from "./HeroSlider";

const slide = (id: string, over: Partial<HeroSlideDto> = {}): HeroSlideDto =>
  ({
    id,
    placement: "home",
    imageUrl: "https://amzn-tarodan.s3.eu-west-1.amazonaws.com/a.png",
    mobileImageUrl: null,
    imageSide: "right",
    title: { tr: `Başlık ${id}`, en: `Title ${id}` },
    subtitle: null,
    imageAlt: null,
    cta1: { label: { tr: "Git", en: "Go" }, href: "/listings" },
    cta2: null,
    hideOnIos: false,
    ...over,
  }) as HeroSlideDto;

describe("HeroSlider", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    track.mockClear();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("slayt yoksa hiçbir şey çizmez", () => {
    act(() => root.render(<HeroSlider slides={[]} />));
    expect(container.innerHTML).toBe("");
  });

  it("yalnız ilk slayt h1, diğerleri h2 olur", () => {
    act(() => root.render(<HeroSlider slides={[slide("a"), slide("b")]} />));
    expect(container.querySelectorAll("h1")).toHaveLength(1);
    expect(container.querySelector("h1")?.textContent).toBe("Başlık a");
    expect(container.querySelector("h2")?.textContent).toBe("Başlık b");
  });

  it("nokta etiketleri i18n'den gelir; tek slaytta nokta çizilmez", () => {
    act(() => root.render(<HeroSlider slides={[slide("a"), slide("b")]} />));
    const labels = [...container.querySelectorAll("[aria-label]")].map((el) =>
      el.getAttribute("aria-label"),
    );
    expect(labels).toEqual([
      "home.slider.goToSlide:1",
      "home.slider.goToSlide:2",
    ]);

    act(() => root.render(<HeroSlider slides={[slide("a")]} />));
    expect(container.querySelectorAll("[aria-label]")).toHaveLength(0);
  });

  it("güvensiz CTA çizilmez, geçerli CTA tıklamayı sayar", () => {
    const bad = slide("a", {
      cta1: { label: { tr: "Kötü", en: "Bad" }, href: "javascript:alert(1)" },
      cta2: { label: { tr: "İyi", en: "Good" }, href: "/secure-swap" },
    });
    act(() => root.render(<HeroSlider slides={[bad]} />));

    const links = container.querySelectorAll("a");
    expect(links).toHaveLength(1);
    expect(links[0].textContent).toBe("İyi");

    act(() => {
      links[0].dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(track).toHaveBeenCalledWith("a", "click", 2);
  });

  it("yalnız etkin slayt etkileşimli; diğerleri inert + aria-hidden", () => {
    act(() => root.render(<HeroSlider slides={[slide("a"), slide("b")]} />));
    const slots = [...container.querySelectorAll("section > div > div")];
    expect(slots).toHaveLength(2);
    expect(slots[0].hasAttribute("inert")).toBe(false);
    expect(slots[0].hasAttribute("aria-hidden")).toBe(false);
    expect(slots[1].hasAttribute("inert")).toBe(true);
    expect(slots[1].getAttribute("aria-hidden")).toBe("true");

    const dots = container.querySelectorAll("[aria-label]");
    act(() => {
      dots[1].dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(slots[0].hasAttribute("inert")).toBe(true);
    expect(slots[1].hasAttribute("inert")).toBe(false);
  });

  it("mağaza bağlantılı CTA koyu mağaza butonu olur, yeni sekmede açılır", () => {
    const promo = slide("a", {
      cta1: {
        label: { tr: "Google Play", en: "Google Play" },
        href: "https://play.google.com/store/apps/details?id=com.tarodan.app",
      },
      cta2: { label: { tr: "Gez", en: "Browse" }, href: "/listings" },
    });
    act(() => root.render(<HeroSlider slides={[promo]} />));
    const [store, normal] = [...container.querySelectorAll("a")];
    expect(store.getAttribute("target")).toBe("_blank");
    expect(store.getAttribute("rel")).toBe("noopener noreferrer");
    expect(store.className).toContain("bg-heading");
    expect(store.querySelector("svg")?.getAttribute("aria-hidden")).toBe(
      "true",
    );
    expect(store.textContent).toContain("openOnMobile");
    expect(store.textContent).toContain("Google Play");
    expect(store.querySelector(".sr-only")?.textContent).toContain(
      "opensInNewTab",
    );
    expect(normal.className).not.toContain("bg-heading");
    expect(normal.textContent).toBe("Gez");
    expect(normal.querySelector(".sr-only")).toBeNull();
  });

  it("dış bağlantıyı yeni sekmede açar", () => {
    const ext = slide("a", {
      cta1: { label: { tr: "Dış", en: "Ext" }, href: "https://example.com" },
    });
    act(() => root.render(<HeroSlider slides={[ext]} />));
    const a = container.querySelector("a");
    expect(a?.getAttribute("target")).toBe("_blank");
    expect(a?.getAttribute("rel")).toContain("noopener");
  });
});
