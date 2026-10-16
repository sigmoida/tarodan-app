/** @format */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { HomePageData } from "../lib/types";

// Bölümler kendi testlerinde; burada yalnız SIRA ve montaj sabitlenir.
const { marker } = vi.hoisted(() => ({
  marker: (name: string) => () => <i data-section={name} />,
}));
vi.mock("../sections/BrandsMarquee", () => ({ default: marker("brands") }));
vi.mock("../sections/FeaturedRail", () => ({ default: marker("featured") }));
vi.mock("../sections/HeroSlider", () => ({ default: marker("hero") }));
vi.mock("../sections/OnSaleRail", () => ({ default: marker("onSale") }));
vi.mock("../sections/PopularRail", () => ({ default: marker("popular") }));
vi.mock("../sections/Spotlights", () => ({ default: marker("spotlights") }));
vi.mock("../sections/TopCollections", () => ({ default: marker("top") }));
vi.mock("../sections/TradeRail", () => ({ default: marker("trade") }));
vi.mock("../sections/TrustBadges", () => ({ default: marker("trust") }));
vi.mock("./HomeOnboardingTour", () => ({ default: marker("tour") }));
vi.mock("@/components/marketing/PopupAd", () => ({ default: marker("popup") }));
vi.mock("@/components/marketing/BannerSlot", () => ({
  default: ({ position }: { position: string }) => (
    <i data-section={`banner-${position}`} />
  ),
}));

import HomeContent from "./HomeContent";

const data = {
  heroSlides: [],
  marqueeItems: [],
  featured: [],
  discounted: [],
  trade: [],
  popular: [],
  topCollections: [],
  featuredCollector: null,
  featuredBusiness: null,
  trustBadges: [],
} as unknown as HomePageData;

const sections = () =>
  Array.from(
    renderToStaticMarkup(<HomeContent data={data} locale="tr" />).matchAll(
      /data-section="([^"]+)"/g,
    ),
    (m) => m[1],
  );

describe("HomeContent — reklam yerleşimi", () => {
  it("header afişi hero'nun ÜSTÜNDE", () => {
    const order = sections();
    expect(order.indexOf("banner-header")).toBeGreaterThan(-1);
    expect(order.indexOf("banner-header")).toBeLessThan(order.indexOf("hero"));
  });

  it("footer afişi en altta güven rozetlerinden önce kalır", () => {
    const order = sections();
    expect(order.indexOf("banner-footer")).toBe(order.indexOf("trust") - 1);
  });

  it("popup ana sayfada bağlanır", () => {
    expect(sections()).toContain("popup");
  });

  it("popup artık her sayfanın düzeninde (global) bağlanmaz", () => {
    const layout = readFileSync(join(__dirname, "../../layout.tsx"), "utf8");
    expect(layout).not.toMatch(/PopupAd/);
  });
});
