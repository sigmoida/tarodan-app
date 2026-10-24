/** @format */

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { Product } from "@/types/product";
import type { ProductCardListing } from "@/lib/productCardListing";

vi.mock("next/image", () => ({
  default: ({ alt }: { alt: string }) => <span>{alt}</span>,
}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({
    children,
    href,
    className,
  }: {
    children?: React.ReactNode;
    href: string;
    className?: string;
  }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));
vi.mock("@/components/ui/ProductCardFavorite", () => ({
  default: () => <i data-heart />,
}));
// The price row is a client island (cart, viewer, boost); here only what the
// server card hands it matters.
vi.mock("@/components/ui/ProductCardAction", () => ({
  default: ({
    listing,
    children,
  }: {
    listing: ProductCardListing;
    children?: React.ReactNode;
  }) => (
    <div data-price-row={JSON.stringify(listing)} className="min-h-8">
      {children}
    </div>
  ),
}));

import HomeProductCard from "./HomeProductCard";

const labels = {
  discount: "indirim",
  boosted: "Öne Çıkan",
  boostedHint: "Satıcı bu ilanı ücretli olarak öne çıkardı",
  trade: "Takas",
};

const render = (product: Product) =>
  renderToStaticMarkup(
    <HomeProductCard
      product={product}
      index={1}
      priority={false}
      badgeLabels={labels}
      outOfStockLabel="Tükendi"
    />,
  );

const rich: Product = {
  id: "p1",
  title: "Camaro",
  price: 250,
  oldPrice: 400,
  discountPercent: 38,
  isBoosted: true,
  tradeAvailable: true,
  feeCampaigns: ["Komisyonsuz"],
};

describe("HomeProductCard badges", () => {
  it("same stack as ProductCard: discount then boosted, at most 2", () => {
    const html = render(rich);
    expect(html).toContain('data-testid="product-card-badges"');
    expect(html).toContain("%38");
    expect(html).toContain("Öne Çıkan");
    expect(html).not.toContain("Sponsorlu");
    expect(html).not.toContain(">Takas<");
    expect(html).not.toContain("Komisyonsuz");
    // The boosted badge carries the paid-placement hint as its tooltip.
    expect(html).toContain(`title="${labels.boostedHint}"`);
    // Visible badge + the link's screen-reader text, nothing else.
    expect(html.match(/%38/g)).toHaveLength(2);
    expect(html).toContain(`%38 indirim, ${labels.boostedHint}`);
  });

  it("shows the trade text at every width (no hidden sm:inline)", () => {
    const html = render({ ...rich, oldPrice: null, isBoosted: false });
    expect(html).toContain("Takas");
    expect(html).toContain("Komisyonsuz");
    expect(html).not.toContain("hidden sm:inline");
  });

  it("draws the heart", () => {
    expect(render(rich)).toContain("data-heart");
  });
});

describe("HomeProductCard link and action", () => {
  it("the title is the one stretched link; the image and price are outside it", () => {
    const html = render(rich);
    expect(html.match(/<a /g)).toHaveLength(1);
    const link = html.slice(html.indexOf("<a "), html.indexOf("</a>") + 4);
    expect(link).toContain("after:absolute after:inset-0");
    expect(link).toContain(">Camaro<");
    expect(link).not.toContain("data-price-row");
    expect(link).not.toContain("product-card-badges");
    // The card root is the container the action's text/icon switch reads.
    expect(html.startsWith('<div class="@container')).toBe(true);
  });

  it("hands the price row only the primitives the action needs", () => {
    const html = render({
      ...rich,
      seller: { id: 7 },
      status: "active",
      availableQuantity: 3,
      boostedUntil: "2026-11-12T10:00:00.000Z",
    });
    const raw = html.match(/data-price-row="([^"]*)"/)![1];
    expect(JSON.parse(raw.replace(/&quot;/g, '"'))).toEqual({
      id: "p1",
      title: "Camaro",
      sellerId: "7",
      status: "active",
      availableQuantity: 3,
      isBoosted: true,
      boostedUntil: "2026-11-12T10:00:00.000Z",
    });
  });
});
