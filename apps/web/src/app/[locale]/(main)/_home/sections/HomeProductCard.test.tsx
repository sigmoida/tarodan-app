/** @format */

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { Product } from "@/types/product";

vi.mock("next/image", () => ({
  default: ({ alt }: { alt: string }) => <span>{alt}</span>,
}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, href }: { children?: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));
vi.mock("@/components/ui/ProductCardFavorite", () => ({
  default: () => <i data-heart />,
}));

import HomeProductCard from "./HomeProductCard";

const render = (product: Product) =>
  renderToStaticMarkup(
    <HomeProductCard
      product={product}
      index={1}
      priority={false}
      sponsoredLabel="Sponsorlu"
      tradeLabel="Takas"
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

describe("HomeProductCard rozetleri", () => {
  it("ProductCard ile aynı yığın: indirim → sponsorlu, en fazla 2", () => {
    const html = render(rich);
    expect(html).toContain('data-testid="product-card-badges"');
    expect(html).toContain("%38");
    expect(html).toContain("Sponsorlu");
    expect(html).not.toContain("Takas");
    expect(html).not.toContain("Komisyonsuz");
    // Sağ üstte ayrı indirim rozeti yok.
    expect(html.match(/%38/g)).toHaveLength(1);
  });

  it("takas metni her genişlikte görünür (hidden sm:inline yok)", () => {
    const html = render({ ...rich, oldPrice: null, isBoosted: false });
    expect(html).toContain("Takas");
    expect(html).toContain("Komisyonsuz");
    expect(html).not.toContain("hidden sm:inline");
  });

  it("kalp çizilir", () => {
    expect(render(rich)).toContain("data-heart");
  });
});
