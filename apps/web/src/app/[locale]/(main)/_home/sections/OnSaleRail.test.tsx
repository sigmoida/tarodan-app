/** @format */

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { Product } from "@/types/product";

// Yalnız başlık bandı sabitlenir: rail ve çerçeve kendi testlerinde.
vi.mock("next-intl/server", () => ({
  getTranslations: async () => (key: string) => key,
}));
vi.mock("./HomeSection", () => ({
  default: ({
    title,
    badge,
    children,
  }: {
    title: string;
    badge?: React.ReactNode;
    children: React.ReactNode;
  }) => (
    <section data-title={title}>
      {badge}
      {children}
    </section>
  ),
}));
vi.mock("./ProductRail", () => ({ default: () => <i data-rail /> }));

import OnSaleRail from "./OnSaleRail";

const items = [{ id: "p1", title: "A", price: 1 }] as Product[];

describe("OnSaleRail", () => {
  it("başlıkta sabit 'Fırsat' etiketi yoktur", async () => {
    const html = renderToStaticMarkup(await OnSaleRail({ items }));
    expect(html).toContain('data-title="product.onSale"');
    expect(html).not.toContain("home.deals");
  });

  it("ürün yoksa hiçbir şey çizmez", async () => {
    expect(await OnSaleRail({ items: [] })).toBeNull();
  });
});
